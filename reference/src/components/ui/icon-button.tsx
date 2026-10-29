"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ComponentProps,
} from "react";
import { Tooltip } from "@/src/components/ui/tooltip";

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: LucideIcon;
  label: string;
  selected?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className = "", icon: Icon, label, selected = false, type = "button", ...props },
  ref,
) {
  return (
    <Tooltip label={label} dismissOnClick>
      <button
        ref={ref}
        type={type}
        className={`ui-icon-button ${selected ? "is-selected" : ""} ${className}`.trim()}
        aria-label={label}
        aria-current={selected ? "page" : undefined}
        {...props}
      >
        <Icon aria-hidden="true" size={20} strokeWidth={1.75} />
      </button>
    </Tooltip>
  );
});

interface IconLinkProps extends Omit<ComponentProps<typeof Link>, "children"> {
  icon: LucideIcon;
  label: string;
  selected?: boolean;
}

export const IconLink = forwardRef<HTMLAnchorElement, IconLinkProps>(function IconLink(
  { className = "", icon: Icon, label, selected = false, ...props },
  ref,
) {
  return (
    <Tooltip label={label} dismissOnClick>
      <Link
        ref={ref}
        className={`ui-icon-button ${selected ? "is-selected" : ""} ${className}`.trim()}
        aria-label={label}
        aria-current={selected ? "page" : undefined}
        {...props}
      >
        <Icon aria-hidden="true" size={20} strokeWidth={1.75} />
      </Link>
    </Tooltip>
  );
});
