import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "critical" | "ai";

export function Badge({
  children,
  icon: Icon,
  tone = "neutral",
}: {
  children: ReactNode;
  icon?: LucideIcon;
  tone?: BadgeTone;
}) {
  return (
    <span className={`ui-badge ui-badge--${tone}`}>
      {Icon ? <Icon aria-hidden="true" data-testid="badge-icon" size={14} strokeWidth={1.75} /> : null}
      <span>{children}</span>
    </span>
  );
}
