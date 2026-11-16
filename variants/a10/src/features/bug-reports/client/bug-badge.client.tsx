"use client";

import { useEffect, useState } from "react";
import { BUG_COUNTS_EVENT, BUG_COUNTS_FIRST_MS, BUG_COUNTS_POLL_MS, badgeCount } from "@/domain/bug-reports";
import { startVisiblePoll } from "@/lib/visible-poll";
import { createBugClient } from "./bug-client";
import "../bugs.css";

/**
 * The count beside "Bug reports" in the sidebar (old PR #2 bugBadge): new reports for A10 admins plus my reports with an
 * unread reply. First read a few seconds after the page opens, then every two minutes while the page is visible, and
 * again whenever a bug page says it changed something. Before the migration is applied the read fails and it stays empty.
 */
export function BugBadge() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const client = createBugClient();
    const load = () =>
      client.counts().then(
        (counts) => setCount(badgeCount(counts)),
        () => setCount(0),
      );
    let stop = () => {};
    const first = setTimeout(() => {
      void load();
      stop = startVisiblePoll(() => void load(), { intervalMs: BUG_COUNTS_POLL_MS });
    }, BUG_COUNTS_FIRST_MS);
    const onChange = () => void load();
    window.addEventListener(BUG_COUNTS_EVENT, onChange);
    return () => {
      clearTimeout(first);
      stop();
      window.removeEventListener(BUG_COUNTS_EVENT, onChange);
    };
  }, []);
  if (count === 0) return null;
  return (
    <i className="sb-count" aria-label={`${count} need attention`}>
      {count > 99 ? "99+" : count}
    </i>
  );
}
