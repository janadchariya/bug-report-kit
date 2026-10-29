import { test as base, expect, type Browser, type BrowserContext, type BrowserContextOptions, type Page, type TestInfo } from "@playwright/test";
import { finishHydrationBarriers, installHydrationBarrier, type HydrationBarrier } from "../fixtures/hydration";

export { expect };
export type { Browser, BrowserContext, Locator, Page, Request, TestInfo } from "@playwright/test";

const barriers = new WeakMap<TestInfo, { states: Set<HydrationBarrier>; startedAt: number; chatOnboarding: boolean }>();

async function instrument(page: Page, info: TestInfo): Promise<Page> {
  const manager = barriers.get(info);
  if (!manager) throw new Error("Hydrated pages require the shared test fixture");
  // Skip before hydration so the gate cannot steal focus and trigger a field blur.
  // R18 opts in to exercise the complete gate, including its real skip button.
  if (!manager.chatOnboarding) {
    await page.addInitScript(() => {
      const getItem = Storage.prototype.getItem;
      Storage.prototype.getItem = function (this: Storage, key: string) {
        if (this === sessionStorage && typeof key === "string" && key.startsWith("bug-kit-chat-gate:v1:")) return "skipped";
        return getItem.call(this, key);
      };
    });
    await page.addLocatorHandler(page.getByRole("dialog", { name: "Set up Google Chat", exact: true }), async (dialog) => {
      await dialog.getByRole("button", { name: "Skip for now", exact: true }).click();
    });
  }
  manager.states.add(await installHydrationBarrier(page, { timeoutMs: () => {
    const elapsed = Date.now() - manager.startedAt;
    return info.timeout === 0 ? 4_000 : Math.max(1, Math.min(4_000, info.timeout - elapsed - 1_000));
  } }));
  return page;
}

export async function createHydratedPage(context: BrowserContext): Promise<Page> {
  return instrument(await context.newPage(), base.info());
}

export async function createHydratedContext(browser: Browser, options?: BrowserContextOptions): Promise<BrowserContext> {
  // Callers keep their original context options and cleanup lifetime. Page creation
  // goes through the awaited factory; an asynchronous 'page' event would race actions.
  return browser.newContext(options);
}

export const test = base.extend<{ hydration: Set<HydrationBarrier>; chatOnboarding: boolean }>({
  chatOnboarding: [false, { option: true }],
  hydration: [async ({ chatOnboarding }, run, info) => {
    const states = new Set<HydrationBarrier>();
    barriers.set(info, { states, startedAt: Date.now(), chatOnboarding });
    try { await run(states); }
    finally {
      barriers.delete(info);
      await finishHydrationBarriers(states, (name, options) => info.attach(name, options));
    }
  }, { auto: true }],
  page: async ({ page, hydration }, run, info) => {
    void hydration;
    await run(await instrument(page, info));
  },
});
