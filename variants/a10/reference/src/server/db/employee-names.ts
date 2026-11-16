import "server-only";
import { employeeDisplayName } from "@/domain/person-name";
import type { A10Db } from "./client";
import { readAllPages } from "./read-all-pages";

/** Current mirrored TWO names by employee UUID and ClickUp ID. No process cache: source changes appear on the next read. */
export async function readEmployeeNames(db: A10Db): Promise<ReadonlyMap<string, string>> {
  const rows = await readAllPages((from, to) =>
    db.from("people").select("id, clickup_id, name, full_name, nickname, fetched_at").order("fetched_at", { ascending: false }).order("id").range(from, to).throwOnError(),
  );
  return employeeNamesOf(rows);
}

/** Already newest-first employee rows can also retain their raw names for historical author-note lookup. */
export function employeeNamesOf(rows: readonly ({ id: string; clickup_id: string | null } & Parameters<typeof employeeDisplayName>[0])[]): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    const name = employeeDisplayName(row);
    if (name === "—") continue;
    names.set(row.id, name);
    if (row.clickup_id && !names.has(row.clickup_id)) names.set(row.clickup_id, name);
  }
  return names;
}
