/**
 * EXAMPLE — how the source project mounts the floating bug widget.
 * This is the ROOT layout (app/layout.tsx). The widget renders a floating
 * button on every page for logged-in users; it self-handles screenshot
 * capture, annotation, and submission to POST /api/bugs.
 *
 * Only the `user && <BugFeedbackWidget />` line matters — adapt the rest
 * to the target project's layout.
 */
import { BugFeedbackWidget } from "@/components/bug-feedback/bug-feedback-widget";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Mounting in the ROOT layout (not a route-group layout) means every
  // authed page gets the widget automatically. getCurrentUser() throws on
  // unauthenticated pages (e.g. /login) — swallow and skip the widget.
  const user = await getCurrentUser().catch(() => null);

  return (
    <html lang="th">
      <body>
        {children}
        {user && <BugFeedbackWidget />}
      </body>
    </html>
  );
}
