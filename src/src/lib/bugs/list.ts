import { BUG_STATUSES, type BugStatus } from "@/src/domain/bugs";
import type { BugListItem } from "./types";

/** LIKE treats these characters as operators unless escaped. Searches are literal substrings. */
export function escapeBugSummarySearch(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}
export function groupBugList(items: BugListItem[]): { status: BugStatus; items: BugListItem[] }[] {
  return BUG_STATUSES.map((status) => ({ status, items: items.filter((item) => item.status === status) })).filter((group) => group.items.length > 0);
}
export function formatBugRelativeTime(iso: string, now = Date.now()): string {
  const minutes = Math.floor(Math.max(0, now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "เมื่อกี้";
  if (minutes < 60) return `${minutes} นาที`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ชม.`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} วัน`;
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" });
}
