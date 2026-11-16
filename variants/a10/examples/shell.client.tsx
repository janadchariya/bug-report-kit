"use client";

import Link from "next/link";
import { Bug } from "lucide-react";
import { bugNavigation } from "@/domain/bug-navigation";
import { BugBadge } from "@/features/bug-reports/client/bug-badge.client";
import { BugReportButton } from "@/features/bug-reports/client/bug-button.client";

/** Mount within the authenticated shell. Pass trusted access from its server loader.
 * Render one active instance (sidebar OR mobile More) to avoid duplicate badge pollers.
 * Merge into existing navigation; do not replace the host's other menu items.
 */
export function BugNavigation({ access, employeeId }: {
  access: { isAdmin: boolean; isLead: boolean }; employeeId: string;
}) {
  const item = bugNavigation(access, employeeId);
  return item ? <Link href={item.href}><Bug size={18} /><span>{item.label}</span><BugBadge /></Link> : null;
}

/** Mount once, after the host content, for every authenticated reporter. */
export function BugFeedback({ buildSha }: { buildSha: string | null }) {
  return <BugReportButton buildSha={buildSha} />;
}
