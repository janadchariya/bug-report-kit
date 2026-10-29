import { afterEach, describe, expect, it, vi } from "vitest";
import { captureShortcut, isImageFile, isTypingTarget, routeReportFiles } from "./report-dialog";

afterEach(() => vi.unstubAllGlobals());

function fileItem(file: File): DataTransferItem {
  return {
    kind: "file",
    type: file.type,
    getAsFile: () => file,
    getAsString: () => undefined,
    webkitGetAsEntry: () => null,
  };
}

function textItem(type: string, value: string): DataTransferItem {
  return {
    kind: "string",
    type,
    getAsFile: () => null,
    getAsString: callback => callback?.(value),
    webkitGetAsEntry: () => null,
  };
}

function transfer(items: DataTransferItem[], files: File[] = []): Pick<DataTransfer, "items" | "files"> {
  return { items, files } as unknown as Pick<DataTransfer, "items" | "files">;
}

describe("report capture shortcut", () => {
  it.each([
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "⌘⇧4"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", "⌘⇧4"],
    ["Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)", "⌘⇧4"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "⊞⇧S"],
    ["Mozilla/5.0 (X11; Linux x86_64)", "เครื่องมือแคปหน้าจอ"],
    ["", "เครื่องมือแคปหน้าจอ"],
  ])("offers the matching capture tool for %s", (userAgent, expected) => {
    expect(captureShortcut(userAgent)).toBe(expected);
  });

  it("uses the browser user agent when none is supplied", () => {
    vi.stubGlobal("navigator", { userAgent: "Macintosh" });
    expect(captureShortcut()).toBe("⌘⇧4");
  });

  it("returns the generic hint when navigator is unavailable", () => {
    vi.stubGlobal("navigator", undefined);
    expect(captureShortcut()).toBe("เครื่องมือแคปหน้าจอ");
  });
});

describe("report image allowlist", () => {
  it.each(["image/png", "image/jpeg", "image/webp", "image/gif"])("accepts %s", type => {
    expect(isImageFile(new Blob(["image"], { type }))).toBe(true);
  });

  it.each(["image/svg+xml", "image/tiff", "image/bmp", "application/pdf", "text/html", ""])("rejects %s", type => {
    expect(isImageFile(new Blob(["file"], { type }))).toBe(false);
  });
});

describe("report paste and drop routing", () => {
  it("returns no attachments for a missing transfer", () => {
    expect(routeReportFiles(null)).toEqual({ image: null, pdf: null });
  });

  it("takes one image and one PDF from file items", () => {
    const image = new File(["image"], "capture.png", { type: "image/png" });
    const pdf = new File(["pdf"], "details.pdf", { type: "application/pdf" });
    expect(routeReportFiles(transfer([fileItem(image), fileItem(pdf)]))).toEqual({ image, pdf });
  });

  it("keeps the first attachment of each kind", () => {
    const image = new File(["first"], "first.gif", { type: "image/gif" });
    const pdf = new File(["first"], "first.pdf", { type: "application/pdf" });
    const otherImage = new File(["next"], "next.jpg", { type: "image/jpeg" });
    const otherPdf = new File(["next"], "next.pdf", { type: "application/pdf" });
    expect(routeReportFiles(transfer([fileItem(image), fileItem(pdf), fileItem(otherImage), fileItem(otherPdf)])))
      .toEqual({ image, pdf });
  });

  it("falls back to files for a drop with no items", () => {
    const image = new File(["image"], "capture.webp", { type: "image/webp" });
    const pdf = new File(["pdf"], "details.pdf", { type: "application/pdf" });
    expect(routeReportFiles(transfer([], [image, pdf]))).toEqual({ image, pdf });
  });

  it("uses files to fill a missing attachment without replacing a file item", () => {
    const image = new File(["item"], "item.png", { type: "image/png" });
    const otherImage = new File(["file"], "file.png", { type: "image/png" });
    const pdf = new File(["pdf"], "details.pdf", { type: "application/pdf" });
    expect(routeReportFiles(transfer([fileItem(image)], [otherImage, pdf]))).toEqual({ image, pdf });
  });

  it("leaves plain text and HTML clipboard entries as text", () => {
    expect(routeReportFiles(transfer([
      textItem("text/plain", "pasted summary"),
      textItem("text/html", '<img src="https://example.test/capture.png">'),
    ]))).toEqual({ image: null, pdf: null });
  });

  it("ignores unsupported files even when their names look like images or PDFs", () => {
    const svg = new File(["svg"], "capture.png", { type: "image/svg+xml" });
    const tiff = new File(["tiff"], "capture.tiff", { type: "image/tiff" });
    const fakePdf = new File(["html"], "details.pdf", { type: "text/html" });
    expect(routeReportFiles(transfer([fileItem(svg), fileItem(tiff)], [fakePdf])))
      .toEqual({ image: null, pdf: null });
  });

  it("ignores a file item whose file cannot be read", () => {
    const item: DataTransferItem = { ...fileItem(new File([], "gone.png", { type: "image/png" })), getAsFile: () => null };
    expect(routeReportFiles(transfer([item]))).toEqual({ image: null, pdf: null });
  });
});

describe("report keyboard typing guard", () => {
  it.each(["input", "textarea", "select"])("protects %s controls from zoom shortcuts", tag => {
    expect(isTypingTarget(document.createElement(tag))).toBe(true);
  });

  it("protects descendants of an editable field", () => {
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    const child = document.createElement("span");
    editor.append(child);
    expect(isTypingTarget(child)).toBe(true);
  });

  it.each(["", "plaintext-only"])("protects contenteditable=%s", value => {
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", value);
    expect(isTypingTarget(editor)).toBe(true);
  });

  it("allows shortcuts in an explicitly noneditable child", () => {
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    const child = document.createElement("span");
    child.setAttribute("contenteditable", "false");
    editor.append(child);
    expect(isTypingTarget(child)).toBe(false);
  });

  it("allows shortcuts on buttons and the canvas", () => {
    expect(isTypingTarget(document.createElement("button"))).toBe(false);
    expect(isTypingTarget(document.createElement("canvas"))).toBe(false);
  });

  it("handles missing and non-element event targets", () => {
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget(window)).toBe(false);
  });
});

it("routes a PDF whose browser MIME is empty by its extension without accepting an explicit wrong MIME", () => {
  const pdf = new File(["%PDF-1.7"], "evidence.PDF");
  expect(routeReportFiles(transfer([fileItem(pdf)]))).toEqual({ image: null, pdf });
  expect(routeReportFiles(transfer([fileItem(new File(["html"], "evidence.pdf", { type: "text/html" }))]))).toEqual({ image: null, pdf: null });
});
