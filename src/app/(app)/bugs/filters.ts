import { BUG_PRIORITIES, BUG_STATUSES, type BugPriority, type BugStatus } from "@/src/domain/bugs";

export type BugFilters = { status?: BugStatus; priority?: BugPriority | null; assigneeId?: string | null; cursor?: string; q?: string };
export type BugSearchParams = Record<string, string | string[] | undefined>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseBugFilters(raw: BugSearchParams): BugFilters {
  const filters: BugFilters = {};
  for (const key of ["status", "priority", "assignee", "cursor", "q"] as const) {
    const value = raw[key];
    if (Array.isArray(value)) throw new Error("invalid_bug_filter");
    if (!value) continue;
    if (key === "status") {
      if (!BUG_STATUSES.includes(value as BugStatus)) throw new Error("invalid_bug_filter");
      filters.status = value as BugStatus;
    } else if (key === "priority") {
      if (value !== "none" && !BUG_PRIORITIES.includes(value as BugPriority)) throw new Error("invalid_bug_filter");
      filters.priority = value === "none" ? null : value as BugPriority;
    } else if (key === "assignee") {
      if (value !== "unassigned" && !UUID.test(value)) throw new Error("invalid_bug_filter");
      filters.assigneeId = value === "unassigned" ? null : value;
    } else if (key === "q") {
      const query = value.trim();
      if (query.length > 100) throw new Error("invalid_bug_filter");
      if (query) filters.q = query;
    } else {
      if (value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("invalid_bug_filter");
      filters.cursor = value;
    }
  }
  return filters;
}

export function bugListUrl(scope: "triage" | "mine", filters: BugFilters, id?: string): string {
  const query = new URLSearchParams();
  if (filters.status) query.set("status", filters.status);
  if (filters.priority !== undefined) query.set("priority", filters.priority ?? "none");
  if (filters.assigneeId !== undefined) query.set("assignee", filters.assigneeId ?? "unassigned");
  if (filters.q) query.set("q", filters.q);
  if (filters.cursor) query.set("cursor", filters.cursor);
  if (scope === "triage" && id) query.set("selected", id);
  return `${scope === "mine" ? "/bugs/mine" : "/bugs"}${scope === "mine" && id ? `/${id}` : ""}${query.size ? `?${query}` : ""}`;
}

export function parseBugSelection(raw: BugSearchParams): string | undefined {
  const value = raw.selected;
  if (value === undefined || value === "") return undefined;
  if (Array.isArray(value) || !UUID.test(value)) throw new Error("invalid_bug_filter");
  return value;
}
