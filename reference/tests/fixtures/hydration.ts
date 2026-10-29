import { expect, type Locator, type Page } from "@playwright/test";

interface UnreadyControl { tag: string; role: string; name: string }
interface HydrationFailure { url: string; controls: UnreadyControl[]; error?: string }
export interface HydrationBarrier {
  invocations: number;
  failures: HydrationFailure[];
  wait(): Promise<void>;
}

const installed = new WeakMap<Page, Promise<HydrationBarrier>>();
type FocusOptions = Parameters<Locator["focus"]>[0];
interface RequestedFocus { run(timeout: number): Promise<void>; started: boolean }
const requestedFocus = new WeakMap<Page, RequestedFocus>();
const wrappedLocatorPrototypes = new WeakSet<object>();
const delay = () => new Promise<void>((resolve) => setTimeout(resolve, 20));

function guardFocus(page: Page) {
  const prototype = Object.getPrototypeOf(page.locator("body")) as Locator;
  if (wrappedLocatorPrototypes.has(prototype)) return;
  wrappedLocatorPrototypes.add(prototype);
  const original = prototype.focus;
  prototype.focus = async function (options?: FocusOptions) {
    const targetPage = this.page();
    if (!installed.has(targetPage)) return original.call(this, options);
    const request: RequestedFocus = {
      started: false,
      run: (timeout) => original.call(this, { ...options, timeout: Math.min(options?.timeout || timeout, timeout) }),
    };
    requestedFocus.set(targetPage, request);
    try { await original.call(this, options); }
    finally { if (requestedFocus.get(targetPage) === request) requestedFocus.delete(targetPage); }
  };
}

// This function is serialized into the main world. Keep it synchronous and self-contained:
// an in-page timer can stop when a test freezes page.clock.
function unreadyControls(): UnreadyControl[] {
  return Array.from(document.querySelectorAll<HTMLElement>('input:not([type="hidden"]), textarea, select, button, [role="button"]'))
    .filter((element) => {
      const style = getComputedStyle(element);
      return !element.matches(":disabled") && element.getAttribute("aria-disabled") !== "true"
        && style.visibility !== "hidden" && style.display !== "none"
        && element.getClientRects().length > 0
        && !Object.getOwnPropertyNames(element).some((name) => name.startsWith("__reactProps$"));
    })
    .map((element) => {
      const labelledBy = element.getAttribute("aria-labelledby")?.split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? "").join(" ");
      const labels = "labels" in element ? Array.from((element as HTMLInputElement).labels ?? []).map((label) => label.textContent).join(" ") : "";
      const tag = element.tagName.toLowerCase();
      const type = element.getAttribute("type") ?? "text";
      const nativeRole = tag === "button" ? "button" : tag === "select" ? "combobox" : tag === "textarea" ? "textbox"
        : tag === "input" ? ["checkbox", "radio"].includes(type) ? type : ["submit", "reset", "button"].includes(type) ? "button" : "textbox" : "";
      const buttonValue = tag === "input" && ["submit", "reset", "button"].includes(type) ? (element as HTMLInputElement).value : "";
      return { tag, role: element.getAttribute("role") ?? nativeRole, name: (element.getAttribute("aria-label") || labelledBy || labels || buttonValue || element.textContent || element.getAttribute("name") || "").trim().slice(0, 200) };
    });
}

export async function installHydrationBarrier(page: Page, options: { timeoutMs?: number | (() => number) } = {}): Promise<HydrationBarrier> {
  const previous = installed.get(page);
  if (previous) return previous;
  const installation = (async () => {
    let handling = false;
    const state: HydrationBarrier = {
      invocations: 0, failures: [],
      async wait() {
        state.invocations += 1;
        if (state.failures.length || page.isClosed()) return;
        const deadline = Date.now() + (typeof options.timeoutMs === "function" ? options.timeoutMs() : options.timeoutMs ?? 4_000);
        let controls: UnreadyControl[] = [];
        let error: string | undefined;
        // A locator handler must never reject. Navigation destroys evaluation contexts;
        // retry the new document, and report permanent failures from fixture teardown.
        while (!page.isClosed()) {
          try {
            const focus = handling ? requestedFocus.get(page) : undefined;
            if (focus && !focus.started && await page.evaluate(() => document.readyState === "complete")) {
              // A native focus can prioritize a dehydrated React boundary. Perform only
              // that requested focus inside the handler, where Playwright skips recursive
              // handler prechecks, after deferred bootstrap scripts have executed.
              focus.started = true;
              try { await focus.run(Math.max(1, deadline - Date.now())); }
              catch { /* The unchanged outer focus call owns its normal error contract. */ }
            }
            controls = await page.evaluate(unreadyControls);
            if (!controls.length) return;
            error = undefined;
          } catch (cause) {
            error = cause instanceof Error ? cause.message : String(cause);
            if (page.isClosed() || /(?:page|context|browser).*closed/i.test(error)) return;
          }
          if (Date.now() >= deadline) {
            state.failures.push({ url: page.url(), controls, ...(error ? { error } : {}) });
            return;
          }
          await delay();
        }
      },
    };
    await page.addLocatorHandler(page.locator("body"), async () => {
      handling = true;
      try { await state.wait(); } finally { handling = false; }
    }, { noWaitAfter: true });
    guardFocus(page);
    // Raw keyboard APIs do not run locator actionability checks. Patch methods on the
    // existing object, so callers retain the original Page, Locator and Keyboard identities.
    const keyboard = page.keyboard as unknown as Record<string, (...args: unknown[]) => Promise<void>>;
    for (const method of ["down", "up", "insertText", "press", "type"]) {
      const original = keyboard[method];
      keyboard[method] = async (...args: unknown[]) => {
        await state.wait();
        await original.apply(page.keyboard, args);
      };
    }
    return state;
  })();
  installed.set(page, installation);
  return installation;
}

export async function finishHydrationBarriers(
  states: Iterable<HydrationBarrier>,
  attach: (name: string, options: { body: string; contentType: string }) => Promise<void>,
): Promise<void> {
  const failures = Array.from(states).flatMap((state) => state.failures);
  if (!failures.length) return;
  await attach("unready-controls", { body: JSON.stringify(failures, null, 2), contentType: "application/json" });
  throw new Error(`Hydration barrier expired (${failures.length} document${failures.length === 1 ? "" : "s"}); see unready-controls`);
}

export async function waitForHydration(locator: Locator): Promise<void> {
  // Server HTML (including a date input's min) can be ready before hydration;
  // controlled values filled before hydration can reset when another input changes.
  await expect.poll(() => locator.evaluate((element) =>
    Object.getOwnPropertyNames(element).some((name) => name.startsWith("__reactProps$")),
  )).toBe(true);
}
