import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { filterNavItems, NAV_ITEMS } from "@/src/components/shell/nav-items";
import { Sidebar } from "@/src/components/shell/sidebar";
import { TabBar } from "@/src/components/shell/tab-bar";
import { DEFAULT_ROLE_PERMISSIONS } from "@/src/lib/permissions";
import { NavBadges } from "@/src/components/shell/nav-badges";

const navigation = vi.hoisted(() => ({ pathname: "/bugs/mine/report-id" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));
afterEach(() => vi.unstubAllGlobals());

it("grants each bug destination only through its effective capability", () => {
  expect(filterNavItems(NAV_ITEMS, p => p === "bugs.report").map(i => i.href)).toEqual(["/today", "/bugs/mine", "/guide"]);
  expect(filterNavItems(NAV_ITEMS, p => p === "bugs.triage").map(i => i.href)).toEqual(["/today", "/bugs", "/guide"]);
  expect(filterNavItems(NAV_ITEMS, () => false).map(i => i.href)).toEqual(["/today", "/guide"]);
});

it("places both bug destinations in More for an admin", () => {
  const items = filterNavItems(NAV_ITEMS, (permission) => DEFAULT_ROLE_PERMISSIONS.system_admin.has(permission));
  render(<TabBar items={items} />);
  const phone = screen.getByRole("navigation", { name: "Main menu" });
  expect(within(phone).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/today", "/guide"]);
  fireEvent.click(within(phone).getByRole("button", { name: "More" }));
  const more = screen.getByRole("dialog", { name: "More" });
  expect(within(more).getByRole("link", { name: "Bugs" })).toHaveAttribute("href", "/bugs");
  expect(within(more).getByRole("link", { name: "My bug reports" })).toHaveAttribute("href", "/bugs/mine");
});

it("keeps bug-only capabilities accessible through More without replacing existing destinations", () => {
  render(<TabBar items={filterNavItems(NAV_ITEMS, (permission) => permission === "bugs.report")} />);
  const phone = screen.getByRole("navigation", { name: "Main menu" });
  expect(within(phone).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/today", "/guide"]);
  fireEvent.click(within(phone).getByRole("button", { name: "More" }));
  expect(within(screen.getByRole("dialog", { name: "More" })).getByRole("link", { name: "My bug reports" })).toBeInTheDocument();
});

it.each(["/bugs/mine", "/bugs/mine/report-id", "/bugs/report-id"])("selects the correct nested bug route %s on Sidebar and More", (pathname) => {
  navigation.pathname = pathname;
  const items = NAV_ITEMS.filter(i => ["/today", "/bugs", "/bugs/mine", "/guide"].includes(i.href));
  render(<><Sidebar items={items} displayName="Synthetic" roleLabels={[]} signOutAction={async () => {}} /><TabBar items={items} /></>);
  const expected = pathname.startsWith("/bugs/mine") ? "My bug reports" : "Bugs";
  const other = expected === "Bugs" ? "My bug reports" : "Bugs";
  const sidebar = screen.getByRole("navigation", { name: "Sidebar menu" });
  fireEvent.click(screen.getByRole("button", { name: "User menu" }));
  const userMenu = screen.getByRole("menu", { name: "User menu" });
  const desktopBugs = within(sidebar).getByRole("link", { name: "Bugs" });
  const desktopMine = within(userMenu).getByRole("menuitem", { name: "My bug reports" });
  const desktopDestination = expected === "Bugs" ? desktopBugs : desktopMine;
  const desktopOther = other === "Bugs" ? desktopBugs : desktopMine;
  expect(desktopDestination).toHaveAttribute("aria-current", "page");
  expect(desktopOther).not.toHaveAttribute("aria-current");
  fireEvent.keyDown(document, { key: "Escape" });
  const phone = screen.getByRole("navigation", { name: "Main menu" });
  expect(within(phone).getAllByRole("link").map(i => i.textContent)).toEqual(["Today", "Guide"]);
  const more = within(phone).getByRole("button", { name: "More" });
  expect(more).toHaveAttribute("aria-current", "page");
  fireEvent.click(more);
  expect(within(screen.getByRole("dialog", { name: "More" })).getByRole("link", { name: expected })).toHaveAttribute("aria-current", "page");
});

it("shows the sum of overflow badges on More using the shared counts request", async () => {
  navigation.pathname = "/bugs/mine/report-id";
  const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ awaitingClaim: 2, overdue: 3, poolAwaiting: 2, bugNew: 4, bugUnread: 3 }) });
  vi.stubGlobal("fetch", fetcher);
  const items = NAV_ITEMS.filter(i => ["/today", "/bugs", "/bugs/mine", "/guide"].includes(i.href));
  render(<NavBadges enabled><TabBar items={items} /></NavBadges>);
  const more = screen.getByRole("button", { name: "More" });
  await waitFor(() => expect(more).toHaveAccessibleDescription("7 notifications"));
  expect(more).toHaveTextContent("More7");
  expect(more).toHaveAttribute("aria-current", "page");
  expect(fetcher).toHaveBeenCalledTimes(1);
  fireEvent.click(more);
  const sheet = screen.getByRole("dialog", { name: "More" });
  expect(within(sheet).getByRole("link", { name: "Bugs4" })).toBeInTheDocument();
  expect(within(sheet).getByRole("link", { name: "My bug reports3" })).toHaveAttribute("aria-current", "page");
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("keeps the zero-count More label and leaves it inactive on a visible destination", () => {
  navigation.pathname = "/today";
  render(<TabBar items={NAV_ITEMS.filter(i => ["/today", "/bugs/mine", "/guide"].includes(i.href))} />);
  const more = screen.getByRole("button", { name: "More" });
  expect(more).not.toHaveAttribute("aria-current");
  expect(more.querySelector(".ui-badge")).toBeNull();
});
