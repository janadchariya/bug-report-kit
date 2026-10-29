import { expect, test, type Page } from "./fixtures";
import { signInAs } from "../fixtures/auth";
import { seedScenario } from "../fixtures/scenarios";

async function touchDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...from, id: 1 }] });
    for (let step = 1; step <= 5; step += 1) {
      await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from.x + (to.x - from.x) * step / 5, y: from.y + (to.y - from.y) * step / 5, id: 1 }] });
    }
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally { await session.detach(); }
}

test("phone users pan a long zoomed screenshot and annotate its lower edge in the exported raster", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Exercises phone touch navigation");
  const fixture = await seedScenario("r19-bugs");
  try {
    await signInAs(page, fixture.reporterEmail);
    await page.goto("/bugs/mine");
    await page.getByRole("button", { name: "Report a bug", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Report a bug", exact: true });
    // All pixels are generated in this test; no real screenshot or customer data.
    const png = await page.evaluate(() => {
      const canvas = document.createElement("canvas"); canvas.width = 600; canvas.height = 1920;
      const ctx = canvas.getContext("2d")!; ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/png").split(",")[1];
    });
    const title = `${fixture.companyLabel} touch annotation`;
    await dialog.getByLabel("Summary", { exact: true }).fill(title);
    await dialog.getByLabel("Choose image", { exact: true }).setInputFiles({ name: "synthetic-long.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
    await expect(dialog.getByLabel("Draw annotations", { exact: true })).toBeVisible();
    const editor = dialog;
    for (let step = 0; step < 4; step += 1) await editor.getByRole("button", { name: "Zoom in", exact: true }).click();
    // C3 replaces Pan with the native scroll wrapper. A scroll must not draw.
    const viewport = editor.getByRole("region", { name: "Annotation image" });
    for (let drag = 0; drag < 12; drag += 1) {
      const position = await viewport.evaluate(element => ({ left: element.scrollLeft, top: element.scrollTop, bottom: element.scrollHeight - element.clientHeight }));
      if (position.left > 0 && position.bottom > 0 && Math.abs(position.top - position.bottom) <= 1) break;
      // Native scrolling can move the outer dialog; do not reuse stale screen coordinates.
      await viewport.scrollIntoViewIfNeeded();
      const bounds = await viewport.boundingBox();
      expect(bounds).not.toBeNull();
      await touchDrag(page,
        { x: bounds!.x + bounds!.width * 0.8, y: bounds!.y + bounds!.height * 0.8 },
        { x: bounds!.x + bounds!.width * 0.2, y: bounds!.y + bounds!.height * 0.2 });
    }
    await expect.poll(() => viewport.evaluate(element => Math.abs(element.scrollTop - (element.scrollHeight - element.clientHeight)))).toBeLessThanOrEqual(1);
    const scrolled = await viewport.evaluate((element) => ({ left: element.scrollLeft, top: element.scrollTop, bottom: element.scrollHeight - element.clientHeight }));
    expect(scrolled.left).toBeGreaterThan(0);
    expect(scrolled.top).toBeGreaterThan(0);
    expect(Math.abs(scrolled.top - scrolled.bottom)).toBeLessThanOrEqual(1);
    await expect(editor.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();

    await editor.getByRole("button", { name: "Rectangle", exact: true }).click();
    await viewport.scrollIntoViewIfNeeded();
    const visible = await viewport.boundingBox();
    const drawing = editor.getByLabel("Draw annotations", { exact: true });
    const raster = await drawing.boundingBox();
    expect(visible).not.toBeNull(); expect(raster).not.toBeNull();
    const a = { x: visible!.x + 30, y: visible!.y + 40 };
    const b = { x: a.x + 90, y: a.y + 80 };
    const sample = { x: ((a.x + b.x) / 2 - raster!.x) * 600 / raster!.width, y: (a.y - raster!.y) * 1920 / raster!.height };
    expect(sample.y).toBeGreaterThan(960);
    await touchDrag(page, a, b);
    await expect(editor.getByRole("button", { name: "Undo", exact: true })).toBeEnabled();
    // C2 flattens on Send, so inspect the persisted private raster, not an interim preview.
    await dialog.getByRole("button", { name: "Send", exact: true }).click();
    await expect(dialog).toBeHidden();
    await page.goto("/bugs/mine");
    // C9 replaces the split workspace navigation with the reporter's single-column list.
    const report = page.getByRole("main").getByRole("list").getByRole("link").filter({ hasText: title });
    const reportPath = await report.getAttribute("href");
    expect(reportPath).toMatch(/^\/bugs\/mine\/[0-9a-f-]+(?:\?.*)?$/);
    await Promise.all([page.waitForURL(url => url.pathname === new URL(reportPath!, page.url()).pathname), report.click()]);
    const screenshot = page.getByRole("article", { name: "Bug report detail", exact: true }).getByRole("img", { name: "Bug screenshot", exact: true });
    await expect(screenshot).toBeVisible();
    const exported = await screenshot.evaluate(async (element, point) => {
      const image = element as HTMLImageElement; await image.decode();
      const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d")!; ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(Math.round(point.x) - 2, Math.round(point.y) - 2, 5, 5).data;
      let redPixels = 0;
      for (let index = 0; index < pixels.length; index += 4) if (pixels[index] > 150 && pixels[index + 1] < 120 && pixels[index + 2] < 120) redPixels += 1;
      return { width: image.naturalWidth, height: image.naturalHeight, redPixels };
    }, sample);
    expect(exported.width).toBe(600); expect(exported.height).toBe(1920);
    expect(exported.redPixels).toBeGreaterThan(0);
  } finally {
    await seedScenario("r19-bugs", { fixtureState: fixture.fixtureState, reason: "cleanup" });
  }
});
