import { expect, test, createHydratedContext, createHydratedPage, type Locator, type Page } from "./fixtures";
import { signInAs } from "../fixtures/auth";
import { seedScenario } from "../fixtures/scenarios";

// Exercise R18's supported session UI; the shared fixture must not bypass it here.
test.use({ chatOnboarding: true });

type Fixture = Awaited<ReturnType<typeof seedScenario>>;
type StoredReport = { id: string; summary: string; description: string | null; status: string; activity: number; read: number; comments: number; images: { id: string; width: number; height: number; byteCount: number; storedBytes: number | null; removedBy: string | null; removedAt: string | null; reason: string | null }[] };
const setup = () => seedScenario("r19-bugs");
const inspect = (fixture: Fixture) => seedScenario("r19-bugs", { fixtureState: fixture.fixtureState, reason: "inspect" });
const cleanup = (fixture: Fixture) => seedScenario("r19-bugs", { fixtureState: fixture.fixtureState, reason: "cleanup" });
const reportDialog = (page: Page) => page.getByRole("dialog", { name: "Report a bug", exact: true });
const reportTrigger = (page: Page) => page.getByRole("button", { name: "Report a bug", exact: true });
// C9 replaces the reporter split-view navigation with Almond's narrow list.
const mineReport = (page: Page, summary: string) => page.getByRole("main").getByRole("list").getByRole("link").filter({ hasText: summary });

async function followLink(page: Page, link: Locator) {
  const href = await link.getAttribute("href");
  expect(href).toBeTruthy();
  const destination = new URL(href!, page.url());
  await Promise.all([
    page.waitForURL(url => url.pathname === destination.pathname && url.search === destination.search),
    link.click(),
  ]);
}

async function enter(page: Page, email: string, path = "/bugs/mine", eligible = true) {
  await signInAs(page, email);
  await page.goto(path);
  const gate = page.getByRole("dialog", { name: "Set up Google Chat", exact: true });
  if (eligible) {
    await expect(gate).toBeVisible();
    await expect(reportTrigger(page)).toBeHidden();
    await gate.getByRole("button", { name: "Skip for now", exact: true }).click();
  }
  await expect(gate).toBeHidden();
  await expect(reportTrigger(page)).toBeVisible();
}

/** White raster generated locally: any colored output pixel must be an annotation. */
async function syntheticPng(page: Page, width = 2400, height = 1200) {
  return page.evaluate(({ width, height }) => {
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d")!; ctx.fillStyle = "white"; ctx.fillRect(0, 0, width, height);
    return canvas.toDataURL("image/png").split(",")[1];
  }, { width, height });
}

async function transferImage(target: Locator, dialog: Locator, png: string, mode: "paste" | "drop") {
  const prevented = await target.evaluate((element, { png, mode }) => {
    const bytes = Uint8Array.from(atob(png), char => char.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], "synthetic-r19.png", { type: "image/png" }));
    const event = mode === "paste"
      ? new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true })
      : new DragEvent("drop", { dataTransfer: transfer, bubbles: true, cancelable: true });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  }, { png, mode });
  expect(prevented).toBe(true);
  await expect(dialog.getByLabel("Draw annotations", { exact: true })).toBeVisible();
}

async function pasteCommentImage(target: Locator, png: string) {
  expect(await target.evaluate((element, data) => {
    const bytes = Uint8Array.from(atob(data), char => char.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], "synthetic-r19-comment.png", { type: "image/png" }));
    const event = new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  }, png)).toBe(true);
}

/** A complete, harmless PDF generated in memory; no real documents enter the fixture. */
function syntheticPdf() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << >> /Contents 4 0 R >>",
    "<< /Length 0 >>\nstream\n\nendstream",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 5\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

async function draw(page: Page, canvas: Locator, a: [number, number], b: [number, number]) {
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox(); expect(box).not.toBeNull();
  await page.mouse.move(box!.x + a[0] * box!.width, box!.y + a[1] * box!.height);
  await page.mouse.down();
  await page.mouse.move(box!.x + b[0] * box!.width, box!.y + b[1] * box!.height, { steps: 6 });
  await page.mouse.up();
}

async function annotationPixels(image: Locator) {
  return image.evaluate(async element => {
    const image = element as HTMLImageElement; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d")!; ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let red = 0, green = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] > 150 && pixels[index + 1] < 130 && pixels[index + 2] < 130) red++;
      if (pixels[index + 1] > pixels[index] + 25 && pixels[index + 1] > pixels[index + 2] + 10) green++;
    }
    return { width: image.naturalWidth, height: image.naturalHeight, red, green };
  });
}

type CapturedAction = { url: string; action: string; contentType: string; bytes: number[]; result: string };
type CaptureWindow = Window & { r19Action?: Promise<CapturedAction>; r19RestoreFetch?: () => void };

/** Chromium's request.postDataBuffer() omits uploaded files; clone the real body before sending it. */
async function captureAction(page: Page, submit: Locator): Promise<CapturedAction> {
  await page.evaluate(() => {
    const target = window as CaptureWindow;
    const originalFetch = window.fetch;
    target.r19RestoreFetch = () => { window.fetch = originalFetch; };
    target.r19Action = new Promise<CapturedAction>((resolve, reject) => {
      window.fetch = (input, init) => {
        const request = new Request(input, init);
        const action = request.headers.get("next-action"), contentType = request.headers.get("content-type");
        if (request.method !== "POST" || !action || !contentType?.startsWith("multipart/form-data")) return originalFetch(input, init);
        window.fetch = originalFetch;
        const bytes = request.clone().arrayBuffer();
        const response = originalFetch(request);
        void Promise.all([bytes, response.then(value => value.clone().text())]).then(([body, result]) => {
          resolve({ url: request.url, action, contentType, bytes: Array.from(new Uint8Array(body)), result });
        }, reject);
        return response;
      };
    });
  });
  try {
    await submit.click();
    return await page.evaluate(() => (window as CaptureWindow).r19Action!);
  } finally {
    await page.evaluate(() => {
      const target = window as CaptureWindow;
      target.r19RestoreFetch?.();
      delete target.r19RestoreFetch;
      delete target.r19Action;
    });
  }
}

function actionIdentity(payload: string): string {
  expect(payload).toContain('"ok":true');
  const results = payload.split("\n").flatMap(line => {
    try {
      const value: unknown = JSON.parse(line.slice(line.indexOf(":") + 1));
      return value && typeof value === "object" && "ok" in value && "data" in value ? [value] : [];
    } catch { return []; }
  });
  expect(results).toHaveLength(1);
  expect(results[0].ok).toBe(true);
  const data = results[0].data as { id?: string; comment?: { id: string } };
  const id = data.id ?? data.comment?.id;
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
  return id!;
}

/** Replay identical multipart bytes with the same actor/retry key and require the original identity. */
async function retryAction(page: Page, request: CapturedAction) {
  const response = await page.request.post(request.url, {
    headers: { "next-action": request.action, "content-type": request.contentType, origin: new URL(request.url).origin, accept: "text/x-component" },
    data: Buffer.from(request.bytes),
  });
  expect(response.ok()).toBe(true);
  const replayId = actionIdentity(await response.text());
  expect(replayId).toBe(actionIdentity(request.result));
  return replayId;
}

async function navLink(page: Page, mobile: boolean, path: string) {
  if (!mobile) {
    if (path === "/bugs/mine") {
      const userMenu = page.getByRole("menu", { name: "User menu", exact: true });
      if (!await userMenu.isVisible()) await page.getByRole("button", { name: "User menu", exact: true }).click();
      await expect(userMenu).toBeVisible();
      return userMenu.getByRole("menuitem", { name: /My bug reports/ });
    }
    const sidebar = page.getByRole("navigation", { name: "Sidebar menu", exact: true });
    const admin = sidebar.getByRole("button", { name: "Admin", exact: true });
    if (await admin.count() && await admin.getAttribute("aria-expanded") !== "true") await admin.click();
    return sidebar.locator(`a[href="${path}"]`);
  }
  const more = page.getByRole("dialog", { name: "More", exact: true });
  if (!await more.isVisible()) await page.getByRole("navigation", { name: "Main menu", exact: true }).getByRole("button", { name: "More", exact: true }).click();
  await expect(more).toBeVisible();
  await expect(reportTrigger(page)).toBeHidden();
  return more.locator(`a[href="${path}"]`);
}

async function closeMore(page: Page, mobile: boolean) {
  if (mobile) { await page.keyboard.press("Escape"); await expect(page.getByRole("dialog", { name: "More", exact: true })).toBeHidden(); }
  else {
    const userMenu = page.getByRole("menu", { name: "User menu", exact: true });
    if (await userMenu.isVisible()) { await page.keyboard.press("Escape"); await expect(userMenu).toBeHidden(); }
  }
}

async function clearHitTarget(target: Locator) {
  await expect(target).toBeVisible();
  expect(await target.evaluate(element => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return Boolean(hit && element.contains(hit));
  })).toBe(true);
}

test("reporter pastes and annotates with a PDF, triager filters and replies with an image, and the shared poller clears only displayed activity", async ({ page, browser, isMobile }, info) => {
  const fixture = await setup();
  let triageContext: Awaited<ReturnType<typeof createHydratedContext>> | undefined;
  let strangerContext: Awaited<ReturnType<typeof createHydratedContext>> | undefined;
  try {
    triageContext = await createHydratedContext(browser, info.project.use);
    strangerContext = await createHydratedContext(browser, info.project.use);
    await page.clock.install();
    await enter(page, fixture.reporterEmail);
    const coachmark = page.getByRole("region", { name: "How to report a bug", exact: true });
    await expect(coachmark).toBeVisible();
    await expect(coachmark.getByRole("link", { name: "Learn more", exact: true })).toHaveAttribute("href", "/guide#report-a-bug");
    await coachmark.getByRole("button", { name: "Got it", exact: true }).click();
    await expect(coachmark).toBeHidden();
    await page.reload();
    await expect(reportTrigger(page)).toBeVisible();
    await expect(coachmark).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem("bug-report-kit.coachmarkSeen"))).toBe("1");
    await reportTrigger(page).click();
    const dialog = reportDialog(page);
    const title = `${fixture.companyLabel} annotated`;
    await expect(dialog.getByLabel("Summary", { exact: true })).toBeFocused();
    await dialog.getByLabel("Summary", { exact: true }).fill(title);
    await dialog.getByRole("button", { name: "+ Add details", exact: true }).click();
    await dialog.getByLabel("Description", { exact: true }).fill("ภาพสีขาวและข้อความนี้สร้างขึ้นเพื่อทดสอบเท่านั้น");
    // C2 catches image paste while Summary is focused and exposes a live canvas.
    await dialog.getByLabel("Summary", { exact: true }).focus();
    await transferImage(dialog.getByLabel("Summary", { exact: true }), dialog, await syntheticPng(page), "paste");
    const editor = dialog;
    const canvas = editor.getByLabel("Draw annotations", { exact: true });
    await editor.getByRole("button", { name: "Rectangle", exact: true }).click();
    await draw(page, canvas, [0.12, 0.15], [0.4, 0.4]);
    await editor.getByRole("button", { name: "Arrow", exact: true }).click();
    await editor.getByRole("button", { name: "Green", exact: true }).click();
    await expect(editor.getByRole("button", { name: "Yellow", exact: true })).toBeVisible();
    await draw(page, canvas, [0.55, 0.6], [0.85, 0.6]);
    await editor.getByRole("button", { name: "Undo", exact: true }).click();
    // A second undo removes the rectangle too: both pointer gestures were committed.
    await editor.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(editor.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
    await editor.getByRole("button", { name: "Rectangle", exact: true }).click();
    await editor.getByRole("button", { name: "Red", exact: true }).click();
    await draw(page, canvas, [0.12, 0.15], [0.4, 0.4]);
    await editor.getByRole("button", { name: "Arrow", exact: true }).click();
    await editor.getByRole("button", { name: "Green", exact: true }).click();
    await draw(page, canvas, [0.55, 0.6], [0.85, 0.6]);
    await editor.getByRole("button", { name: "Ellipse", exact: true }).click();
    await draw(page, canvas, [0.5, 0.15], [0.8, 0.4]);
    await editor.getByRole("button", { name: "Freehand", exact: true }).click();
    await draw(page, canvas, [0.15, 0.7], [0.4, 0.8]);
    const pdf = syntheticPdf();
    await dialog.getByLabel("Choose PDF", { exact: true }).setInputFiles({ name: "synthetic-r19.pdf", mimeType: "application/pdf", buffer: pdf });
    await expect(dialog.getByText("synthetic-r19.pdf", { exact: true })).toBeVisible();
    const created = await captureAction(page, dialog.getByRole("button", { name: "Send", exact: true }));
    await expect(dialog).toBeHidden();
    const replayedReportId = await retryAction(page, created);
    await page.goto("/bugs/mine");
    const createdReport = mineReport(page, title);
    await expect(createdReport).toHaveCount(1);
    const reportPath = await createdReport.getAttribute("href");
    const reportId = reportPath!.split("/").at(-1)!.split("?")[0];
    expect(reportId).toBe(replayedReportId);
    const initialCounts = page.waitForResponse(response => new URL(response.url()).pathname === "/api/nav-counts");
    await page.goto("/today");
    await initialCounts;

    const triager = await createHydratedPage(triageContext);
    await enter(triager, fixture.triagerEmail, "/bugs");
    const before = await (await triager.request.get("/api/nav-counts")).json() as { bugNew: number };
    const newLink = await navLink(triager, isMobile, "/bugs");
    await expect(newLink.locator(".ui-badge")).toHaveText(String(before.bugNew));
    await closeMore(triager, isMobile);
    const groupedCard = triager.getByRole("navigation", { name: "Bug reports", exact: true }).getByRole("link").filter({ hasText: title });
    const newGroup = triager.locator(".bugs-list__group").filter({ has: triager.getByRole("heading", { name: /^New\s*\(/ }) });
    await expect(newGroup.getByRole("link").filter({ hasText: title })).toBeVisible();
    await expect(groupedCard.locator("img")).toHaveAttribute("loading", "lazy");
    await expect(groupedCard.locator("img")).toHaveAttribute("width", "80");
    await expect(groupedCard.locator("img")).toHaveAttribute("height", "56");
    await expect(groupedCard.getByText("PDF", { exact: true })).toBeVisible();
    await followLink(triager, triager.getByRole("navigation", { name: "Status filters", exact: true }).getByRole("link", { name: "New", exact: true }));
    expect(new URL(triager.url()).searchParams.get("status")).toBe("new");
    await Promise.all([
      triager.waitForURL(url => url.pathname === "/bugs" && url.searchParams.get("status") === "new" && url.searchParams.get("q") === title),
      triager.getByRole("searchbox", { name: "Search summary", exact: true }).fill(title),
    ]);
    expect(new URL(triager.url()).searchParams.get("q")).toBe(title);
    await expect(triager.getByRole("navigation", { name: "Bug reports", exact: true }).getByRole("link").filter({ hasText: title })).toHaveCount(1);
    await followLink(triager, triager.getByRole("navigation", { name: "Bug reports", exact: true }).getByRole("link").filter({ hasText: title }));
    const detail = triager.getByRole("article", { name: "Bug report detail", exact: true });
    const screenshot = detail.getByRole("img", { name: "Bug screenshot", exact: true });
    await expect(screenshot).toBeVisible();
    const pixels = await annotationPixels(screenshot);
    expect(pixels.width).toBe(1920); expect(pixels.height).toBe(960);
    expect(pixels.red).toBeGreaterThan(50); expect(pixels.green).toBeGreaterThan(50);
    const imagePath = (await screenshot.getAttribute("src"))!;
    const imageResponse = await triager.request.get(imagePath);
    expect(imageResponse.status()).toBe(200);
    expect(imageResponse.headers()["cache-control"]).toBe("private, no-store");
    expect(imageResponse.headers()["x-content-type-options"]).toBe("nosniff");
    expect(["image/webp", "image/png"]).toContain(imageResponse.headers()["content-type"]);
    const pdfDownload = detail.getByRole("link", { name: /ไฟล์ PDF — กดเพื่อดาวน์โหลด/ });
    await expect(pdfDownload).toHaveAttribute("download");
    const pdfPath = (await pdfDownload.getAttribute("href"))!;
    expect(pdfPath).toMatch(/^\/api\/bugs\/files\/[0-9a-f-]+$/);
    const pdfResponse = await triager.request.get(pdfPath);
    expect(pdfResponse.status()).toBe(200);
    expect(pdfResponse.headers()["content-type"]).toBe("application/pdf");
    expect(pdfResponse.headers()["content-disposition"]).toMatch(/^attachment;.*filename\*=/);
    expect(pdfResponse.headers()["cache-control"]).toBe("private, no-store");
    expect(pdfResponse.headers()["x-content-type-options"]).toBe("nosniff");
    expect(pdfResponse.headers()["content-security-policy"]).toBe("sandbox");
    expect(await pdfResponse.body()).toEqual(pdf);
    const triage = detail.getByRole("region", { name: "Triage", exact: true });
    await triage.getByRole("combobox", { name: "Status", exact: true }).selectOption("in_progress");
    await triage.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(detail.getByRole("region", { name: "Status history", exact: true })).toContainText("New → In progress");
    const remaining = before.bugNew - 1;
    const updatedNewLink = await navLink(triager, isMobile, "/bugs");
    if (remaining) await expect(updatedNewLink.locator(".ui-badge")).toHaveText(String(remaining));
    else await expect(updatedNewLink.locator(".ui-badge")).toHaveCount(0);
    await closeMore(triager, isMobile);
    const reply = "ตรวจสอบภาพทดสอบแล้ว กำลังแก้ไข";
    await detail.getByLabel("Comment", { exact: true }).fill(reply);
    await detail.getByLabel("Comment", { exact: true }).focus();
    await pasteCommentImage(detail.getByLabel("Comment", { exact: true }), await syntheticPng(triager, 480, 320));
    await expect(detail.getByRole("img", { name: "Attached image preview", exact: true })).toBeVisible();
    await expect(detail.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
    const commented = await captureAction(triager, detail.getByRole("button", { name: "Send", exact: true }));
    await expect(detail.getByRole("list", { name: "Comments", exact: true }).getByText(reply, { exact: true })).toBeVisible();
    const commentImage = detail.getByRole("list", { name: "Comments", exact: true }).getByRole("img", { name: "Comment attachment", exact: true });
    await expect(commentImage).toBeVisible();
    const commentImagePath = (await commentImage.getAttribute("src"))!;
    await retryAction(triager, commented);

    await page.bringToFront();
    let countReads = 0;
    page.on("request", request => { if (new URL(request.url()).pathname === "/api/nav-counts") countReads++; });
    const unreadLink = await navLink(page, isMobile, "/bugs/mine");
    await page.clock.fastForward(45_100);
    await expect(unreadLink.locator(".ui-badge")).toHaveText("1");
    expect(countReads).toBe(1); // Sidebar, TabBar and More still share one interval.
    await followLink(page, unreadLink);
    const unreadReport = mineReport(page, title);
    await expect(unreadReport.getByRole("img", { name: "Unread", exact: true })).toBeVisible();
    await followLink(page, unreadReport);
    const reporterDetail = page.getByRole("article", { name: "Bug report detail", exact: true });
    await expect(reporterDetail.getByText(reply, { exact: true })).toHaveCount(1);
    await expect(reporterDetail.getByRole("img", { name: "Comment attachment", exact: true })).toBeVisible();
    expect((await page.request.get(pdfPath)).status()).toBe(200);
    // C9 shows the current status on the reporter's single-column detail;
    // the exact transition remains asserted in triage's Status history above.
    await expect(reporterDetail.locator("header").getByText("In progress", { exact: true })).toBeVisible();
    await expect(reporterDetail.getByRole("region", { name: "Triage", exact: true })).toHaveCount(0);
    await expect(reporterDetail.getByRole("button", { name: "Remove image", exact: true })).toHaveCount(0);
    const clearedLink = await navLink(page, isMobile, "/bugs/mine");
    await expect(clearedLink.locator(".ui-badge")).toHaveCount(0); // mark-read refresh, without another 45-second tick.
    await expect(clearedLink).toHaveAttribute("aria-current", "page");
    await closeMore(page, isMobile);

    const stranger = await createHydratedPage(strangerContext);
    await enter(stranger, fixture.strangerEmail, "/bugs/mine", false);
    await expect(stranger.getByText(title, { exact: true })).toHaveCount(0);
    expect((await stranger.goto(`/bugs/mine/${reportId}`))?.status()).toBe(404);
    expect((await stranger.request.get(imagePath)).status()).toBe(404);
    expect((await stranger.request.get(commentImagePath)).status()).toBe(404);
    expect((await stranger.request.get(pdfPath)).status()).toBe(404);
    expect((await page.goto("/bugs"))?.status()).toBe(404);
    const state = await inspect(fixture);
    const reports = JSON.parse(state.reports) as StoredReport[];
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ id: reportId, summary: title, status: "in_progress", comments: 1, activity: 2, read: 2 });
    expect(reports[0].images).toHaveLength(2);
    const storedScreenshot = reports[0].images.find(image => image.id === imagePath.split("/").at(-1));
    expect(storedScreenshot).toMatchObject({ width: 1920, height: 960, removedAt: null });
    const storedCommentImage = reports[0].images.find(image => image.id === commentImagePath.split("/").at(-1));
    expect(storedCommentImage).toMatchObject({ width: 480, height: 320, removedAt: null });
    for (const image of reports[0].images) {
      expect(image.byteCount).toBeGreaterThan(0);
      expect(image.byteCount).toBeLessThanOrEqual(2_097_152);
      expect(image.storedBytes).toBe(image.byteCount);
    }
    expect(state.webhookCount).toBe("0");
  } finally {
    try { await triageContext?.close(); }
    finally {
      try { await strangerContext?.close(); }
      finally { await cleanup(fixture); }
    }
  }
});

test("reports require a screenshot, optional details and picker/drop attachments persist, and removal leaves a one-way tombstone", async ({ page, browser }, info) => {
  const fixture = await setup();
  let triageContext: Awaited<ReturnType<typeof createHydratedContext>> | undefined;
  try {
    triageContext = await createHydratedContext(browser, info.project.use);
    // Finance has bugs.report without lead.work_own or R18 webhook eligibility.
    await enter(page, fixture.strangerEmail, "/bugs/mine", false);
    const title = `${fixture.companyLabel} optional details`;
    await reportTrigger(page).click();
    await reportDialog(page).getByLabel("Summary", { exact: true }).fill(title);
    // C2 replaces summary-only submission with a required screenshot; details stay optional.
    await expect(reportDialog(page).getByRole("button", { name: "Send", exact: true })).toBeDisabled();
    await expect(reportDialog(page).getByLabel("Description", { exact: true })).toHaveCount(0);
    expect(JSON.parse((await inspect(fixture)).reports)).toEqual([]);
    await reportDialog(page).getByLabel("Choose image", { exact: true }).setInputFiles({ name: "synthetic-required.png", mimeType: "image/png", buffer: Buffer.from(await syntheticPng(page, 480, 320), "base64") });
    await reportDialog(page).getByRole("button", { name: "Send", exact: true }).click();
    await expect(reportDialog(page)).toBeHidden();
    await page.goto("/bugs/mine");
    await followLink(page, mineReport(page, title));
    const ownDetail = page.getByRole("article", { name: "Bug report detail", exact: true });
    // C9 omits the description when it is absent rather than showing a placeholder.
    await expect(ownDetail.locator("header .bugs-detail__description")).toHaveCount(0);
    expect((JSON.parse((await inspect(fixture)).reports) as StoredReport[]).find(report => report.summary === title)?.description).toBeNull();
    await expect(ownDetail.getByRole("img", { name: "Bug screenshot", exact: true })).toBeVisible();
    const ownCounts = await (await page.request.get("/api/nav-counts")).json();
    expect(ownCounts).toEqual({ awaitingClaim: 0, overdue: 0, poolAwaiting: 0, bugNew: 0, bugUnread: 0 });

    await reportTrigger(page).click();
    const dialog = reportDialog(page);
    const png = await syntheticPng(page, 480, 320);
    await dialog.getByLabel("Summary", { exact: true }).fill(`${fixture.companyLabel} picker and drop`);
    await dialog.getByLabel("Choose image", { exact: true }).setInputFiles({ name: "synthetic-picker.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
    await expect(dialog.getByLabel("Draw annotations", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Change image", exact: true }).click();
    await expect(dialog.getByLabel("Draw annotations", { exact: true })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
    await transferImage(dialog.getByLabel("Summary", { exact: true }), dialog, png, "drop");
    await dialog.getByRole("button", { name: "Send", exact: true }).click();
    await expect(dialog).toBeHidden();
    await page.goto("/bugs/mine");
    const nextReport = mineReport(page, "picker and drop");
    const nextReportPath = await nextReport.getAttribute("href");
    expect(nextReportPath).toMatch(/^\/bugs\/mine\/[0-9a-f-]+(?:\?.*)?$/);
    await followLink(page, nextReport);
    const path = new URL(page.url()).pathname;
    const screenshot = ownDetail.getByRole("img", { name: "Bug screenshot", exact: true });
    await expect(screenshot).toBeVisible();
    const imagePath = (await screenshot.getAttribute("src"))!;
    const triager = await createHydratedPage(triageContext);
    await enter(triager, fixture.triagerEmail, path.replace("/bugs/mine/", "/bugs/"));
    await triager.getByRole("article", { name: "Bug report detail", exact: true }).getByRole("button", { name: "Remove image", exact: true }).click();
    const remove = triager.getByRole("dialog", { name: "Remove image", exact: true });
    await remove.getByLabel("Removal reason", { exact: true }).fill("ภาพทดสอบผ่านการตรวจสอบแล้ว");
    await remove.getByRole("button", { name: "Confirm removal", exact: true }).click();
    await expect(remove).toBeHidden();
    await expect(triager.getByText("Screenshot removed", { exact: true })).toBeVisible();
    await page.reload();
    await expect(ownDetail.getByText("Screenshot removed", { exact: true })).toBeVisible();
    await expect(ownDetail.getByRole("img")).toHaveCount(0);
    expect((await page.request.get(imagePath)).status()).toBe(404);
    const state = await inspect(fixture);
    const reports = JSON.parse(state.reports) as StoredReport[];
    expect(reports).toHaveLength(2);
    expect(reports.find(report => report.summary === title)?.images).toHaveLength(1);
    expect(reports.find(report => report.summary === title)?.images[0].removedAt).toBeNull();
    const removed = reports.filter(report => report.summary !== title).flatMap(report => report.images);
    expect(removed).toHaveLength(1);
    expect(removed[0]).toMatchObject({ storedBytes: null, removedBy: fixture.triagerId, reason: "ภาพทดสอบผ่านการตรวจสอบแล้ว" });
    expect(removed[0].removedAt).toBeTruthy();
  } finally {
    try { await triageContext?.close(); }
    finally { await cleanup(fixture); }
  }
});

test("real bulk/save bars and modal layers keep the report control reachable, with keyboard and screenshot scrolling", async ({ page, isMobile }) => {
  const fixture = await setup();
  try {
    await enter(page, fixture.reporterEmail, "/deals");
    if (isMobile) expect(await page.getByRole("navigation", { name: "Main menu", exact: true }).getByRole("link").evaluateAll(links => links.map(link => link.getAttribute("href"))))
      .toEqual(["/today", "/leads/new", "/pool"]);
    const assertNoCollision = async (obstruction: Locator) => {
      await expect(obstruction).toBeVisible();
      await expect.poll(async () => {
        const trigger = await reportTrigger(page).boundingBox(), bar = await obstruction.boundingBox();
        const intro = page.getByRole("region", { name: "How to report a bug", exact: true });
        const coachmark = await intro.isVisible() ? await intro.boundingBox() : null;
        return Boolean(trigger && bar && [trigger, ...(coachmark ? [coachmark] : [])].every(box => (
          box.x + box.width <= bar.x || bar.x + bar.width <= box.x ||
          box.y + box.height <= bar.y || bar.y + bar.height <= box.y
        )));
      }).toBe(true);
      await clearHitTarget(reportTrigger(page));
      await clearHitTarget(obstruction.getByRole("button").first());
    };
    await page.getByRole("button", { name: "Select", exact: true }).click();
    await page.getByRole("checkbox", { name: `Select ${fixture.companyLabel}`, exact: true }).check();
    await assertNoCollision(page.getByRole("group", { name: "Bulk actions", exact: true }));
    await page.getByRole("button", { name: "Reschedule to…", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Reschedule", exact: true })).toBeVisible();
    await expect(reportTrigger(page)).toBeHidden();
    await page.keyboard.press("Escape");
    await expect(reportTrigger(page)).toBeVisible();
    await page.getByRole("group", { name: "Bulk actions", exact: true }).getByRole("button", { name: "Clear", exact: true }).click();
    if (isMobile) {
      await navLink(page, true, "/bugs/mine");
      await closeMore(page, true);
      await expect(page.getByRole("button", { name: "More", exact: true })).toBeFocused();
    }
    await reportTrigger(page).focus();
    await page.keyboard.press("Enter");
    const dialog = reportDialog(page);
    await expect(dialog.getByLabel("Summary", { exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "+ Add details", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog.getByLabel("Description", { exact: true })).toBeVisible();
    await dialog.getByLabel("Summary", { exact: true }).focus();
    await page.keyboard.press("Tab");
    await expect(dialog.getByLabel("Description", { exact: true })).toBeFocused();
    await expect(dialog.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
    await dialog.getByLabel("Choose image", { exact: true }).setInputFiles({ name: "synthetic-long.png", mimeType: "image/png", buffer: Buffer.from(await syntheticPng(page, 600, 2400), "base64") });
    await expect(dialog.getByLabel("Draw annotations", { exact: true })).toBeVisible();
    const editor = dialog;
    await editor.getByRole("button", { name: "Zoom in", exact: true }).click();
    const viewport = editor.getByRole("region", { name: "Annotation image", exact: true });
    await viewport.scrollIntoViewIfNeeded();
    await viewport.focus();
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => viewport.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    expect(await viewport.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    const smallText = await dialog.evaluate(element => [...element.querySelectorAll<HTMLElement>("*")].filter(child => {
      const style = getComputedStyle(child), box = child.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && [...child.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) && parseFloat(style.fontSize) < 12;
    }).map(child => child.textContent));
    expect(smallText).toEqual([]);
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    page.once("dialog", confirm => confirm.accept());
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(reportTrigger(page)).toBeFocused();

    await enter(page, "admin@example.test", "/settings/roles");
    // Change only a local, unsaved permission draft, then discard it.
    const cell = page.getByRole("checkbox", { name: "Finance · Report bugs", exact: true });
    await cell.uncheck();
    const saveBar = page.locator('.role-matrix__bar[data-dirty="true"]');
    await assertNoCollision(saveBar);
    await saveBar.getByRole("button", { name: "Review changes", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(reportTrigger(page)).toBeHidden();
    await page.keyboard.press("Escape");
    await saveBar.getByRole("button", { name: "Discard", exact: true }).click();
    await expect(cell).toBeChecked();
    await clearHitTarget(reportTrigger(page));
  } finally { await cleanup(fixture); }
});
