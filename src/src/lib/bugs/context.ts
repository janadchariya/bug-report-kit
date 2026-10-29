import { BUG_LIMITS, BUG_PRIORITIES, BUG_STATUSES } from "@/src/domain/bugs";
import { USER_ROLES } from "@/src/lib/roles";

type BugQuery = string | URLSearchParams | Readonly<Record<string, string | readonly string[] | undefined>> | null;
const staticPaths = new Set([
  "/", "/accounts", "/accounts/duplicates", "/accounts/links", "/audit", "/deals", "/exports", "/guide",
  "/leads", "/leads/archived", "/leads/import-event", "/leads/new", "/leads/submitted", "/md", "/md/assign",
  "/md/contracts", "/md/disputes", "/md/import", "/md/leads", "/md/team", "/nurture", "/pool", "/profile",
  "/renewals", "/sales", "/search", "/today", "/bugs", "/bugs/mine", "/settings", "/settings/channel-costs",
  "/settings/channels", "/settings/chat-spaces", "/settings/eligibility", "/settings/holidays", "/settings/integrations",
  "/settings/price-list", "/settings/roles", "/settings/rules", "/settings/targets", "/settings/templates", "/settings/users",
]);
const uuid = "[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}";
const detailPath = new RegExp(`^/(?:leads/${uuid}|accounts/${uuid}(?:/new-deal)?|bugs/(?:mine/)?${uuid})$`);
const guidePath = new RegExp(`^/guide/(?:${USER_ROLES.join("|")})$`);

/** Diagnostics only: never preserve arbitrary browser locations or search text. */
export function sanitizeBugLocation(input: { pathname?: string | null; query?: BugQuery }): { path: string; query: string | null } {
  const raw = input.pathname ?? "/";
  if (raw.length > BUG_LIMITS.pagePath || /[\x00-\x20\\%?]/.test(raw)) return { path: "/", query: null };
  const path = raw.split("#", 1)[0];
  if (!staticPaths.has(path) && !detailPath.test(path) && !guidePath.test(path)) return { path: "/", query: null };
  if (path !== "/bugs" && path !== "/bugs/mine") return { path, query: null };
  const query = input.query;
  const params = new URLSearchParams();
  if (typeof query === "string") {
    if (query.length > BUG_LIMITS.pageQuery) return { path, query: null };
    new URLSearchParams(query.split("#", 1)[0]).forEach((v, k) => params.append(k, v));
  } else if (query instanceof URLSearchParams) {
    if (query.toString().length > BUG_LIMITS.pageQuery) return { path, query: null };
    query.forEach((v, k) => params.append(k, v));
  } else if (query) {
    for (const key of ["status", "priority"]) {
      const value = query[key];
      for (const item of typeof value === "string" ? [value] : value ?? []) params.append(key, item);
    }
  }
  const allowed = new URLSearchParams();
  const status = params.getAll("status");
  if (status.length === 1 && (BUG_STATUSES as readonly string[]).includes(status[0])) allowed.set("status", status[0]);
  const priority = params.getAll("priority");
  if (path === "/bugs" && priority.length === 1 && (BUG_PRIORITIES as readonly string[]).includes(priority[0])) allowed.set("priority", priority[0]);
  const result = allowed.toString();
  return { path, query: result && path.length + result.length + 1 <= 2048 ? result : null };
}
