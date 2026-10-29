import { Bug } from "lucide-react";
import type { BugFilters } from "@/app/(app)/bugs/filters";
import type { BugDetail as Detail, BugListItem, BugStaff } from "@/src/lib/bugs/types";
import { BugDetail } from "./bug-detail";
import { BugList } from "./bug-list";
import { BugListFilters } from "./bug-list-filters";
import "./bug-pages.css";

export function BugsWorkspace({ scope, filters, items, nextCursor, detail, triagers, selectedId = detail?.id, detailError }: { scope: "triage" | "mine"; filters: BugFilters; items: BugListItem[]; nextCursor: string | null; detail: Detail | null; triagers: BugStaff[]; selectedId?: string; detailError?: string }) {
  if (scope === "mine") return <section className="bugs-mine-page">
    {detail ? <BugDetail key={detail.id} detail={detail} scope="mine" triagers={[]} /> : <>
      <header className="page-header"><div><h1 className="page-title">My bug reports</h1></div></header>
      {!items.length ? <p className="bugs-helper">ยังไม่มีรายงานที่คุณแจ้ง</p> : null}
      <BugList items={items} scope="mine" filters={filters} nextCursor={nextCursor} />
    </>}
  </section>;
  return <section className="page bugs-page">
    <header className="page-header"><div><h1 className="page-title">Bugs</h1></div></header>
    <div className="bugs-workspace">
      <div className="bugs-workspace__detail">{detail ? <BugDetail key={detail.id} detail={detail} scope="triage" triagers={triagers} /> : <div className="bugs-workspace__empty"><Bug size={40} aria-hidden="true" /><p role={detailError ? "alert" : undefined}>{detailError ?? "เลือกรายงานจากรายการเพื่อดูรายละเอียด"}</p></div>}</div>
      <div className="bugs-workspace__list"><BugListFilters filters={filters} triagers={triagers} selectedId={selectedId} /><BugList items={items} scope="triage" filters={filters} selectedId={selectedId} nextCursor={nextCursor} /></div>
    </div>
  </section>;
}
