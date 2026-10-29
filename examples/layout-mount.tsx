import type { ReactNode } from "react";
import { BugReportWidget } from "@/src/components/bugs/bug-report-widget";
import { NavBadges } from "@/src/components/shell/nav-badges";
import { Toaster } from "@/src/components/ui/toaster";
import { can } from "@/src/server/auth/permissions";
import { requireActorOrRedirect } from "@/src/server/auth/guard";

// Merge this into the existing authenticated shell. Import token, UI and shell
// CSS from the host's root layout; do not mount a second badge poller or toaster.
export default async function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const actor = await requireActorOrRedirect();
  return <NavBadges enabled={can(actor, "bugs.report") || can(actor, "bugs.triage")}>
    <main className="app-main">{children}</main>
    {/* The widget owns BOTH BugCoachmark and FloatingActionLayer. Mount once. */}
    <BugReportWidget canReportBugs={can(actor, "bugs.report")} />
    <Toaster />
  </NavBadges>;
}

// Add data-shell-bottom-obstruction to fixed action bars and toasts. The
// reference floating layer observes geometry only, including coachmark boxes.
// Reserve --shell-action-clearance in the last scrollable page content and
// --shell-action-base-clearance in nested workspaces (see shell reference CSS).
