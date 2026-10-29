"use client";

import { X } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { overlayIsActive } from "@/src/components/ui/overlay-bounds";
import { focusWithoutTooltip } from "@/src/components/ui/tooltip-focus";
import { IconButton } from "@/src/components/ui/icon-button";

const focusableSelector = [
  "button:not([disabled])",
  "a[href]",
  "input:not([type='hidden']):not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => {
    if (element.matches(":disabled") || element.closest("[hidden], [inert], [aria-hidden='true']")) return false;
    for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
      const style = window.getComputedStyle(ancestor);
      if (style.display === "none" || style.visibility === "hidden") return false;
    }
    return true;
  });
}

export function Dialog({
  children,
  className = "ui-dialog",
  description,
  dismissible = true,
  onOpenChange,
  open,
  returnFocusRef,
  title,
}: {
  children: ReactNode;
  className?: string;
  description?: string;
  /** Opt-in setup dialogs must offer their own explicit exit action. */
  dismissible?: boolean;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  returnFocusRef?: RefObject<HTMLElement | null>;
  title: string;
}) {
  const panelId = useId();
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const returnFocusTarget = returnFocusRef?.current ?? previousFocus;
    const panel = panelRef.current;
    const body = panel?.querySelector<HTMLElement>(".ui-dialog__body");
    const controls = body ? focusableWithin(body) : [];
    const initial = controls.find((element) => element.hasAttribute("data-dialog-autofocus"))
      ?? controls.find((element) => element.matches("input:not([type='hidden']), select, textarea"))
      ?? controls.find((element) => element.textContent?.trim() === "Cancel")
      ?? controls[0]
      ?? panel;
    focusWithoutTooltip(initial);

    return () => {
      focusWithoutTooltip(returnFocusTarget);
    };
  }, [open, returnFocusRef]);

  useEffect(() => {
    if (!open || !panelRef.current) return;
    const panel = panelRef.current;
    // Pending actions can remove Close and disable the previously focused field.
    if (!focusableWithin(panel).length && document.activeElement !== panel) {
      panel.focus();
    }
  });

  useEffect(() => {
    if (!open) return;
    function handleDocumentKeyDown(event: globalThis.KeyboardEvent) {
      if (event.defaultPrevented || event.key !== "Escape" || !panelRef.current || !overlayIsActive(panelRef.current)) return;
      event.preventDefault();
      if (dismissible) onOpenChange(false);
    }
    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => document.removeEventListener("keydown", handleDocumentKeyDown);
  }, [dismissible, onOpenChange, open]);

  if (!open) return null;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.key !== "Tab" || !panelRef.current || !overlayIsActive(panelRef.current)) return;
    const portals = Array.from(document.querySelectorAll<HTMLElement>("[data-overlay-container]"))
      .filter((element) => element.dataset.overlayContainer === panelId);
    const focusable = [...focusableWithin(panelRef.current), ...portals.flatMap((portal) => [
      ...(portal.matches(focusableSelector) && window.getComputedStyle(portal).visibility !== "hidden" ? [portal] : []),
      ...focusableWithin(portal),
    ])];
    if (focusable.length === 0) {
      event.preventDefault();
      panelRef.current.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1);

    if (document.activeElement === panelRef.current) {
      event.preventDefault();
      (event.shiftKey ? last : first)?.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  // Portal to <body>: a parent with backdrop-filter or transform (the sticky top bar) would otherwise anchor this fixed layer.
  return createPortal(
    <div className="ui-dialog-backdrop" role="presentation" onMouseDown={() => { if (dismissible) onOpenChange(false); }}>
      <div
        ref={panelRef}
        id={panelId}
        className={className}
        data-refresh-hold
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-label={title}
        aria-describedby={description ? descriptionId : undefined}
        onKeyDown={handleKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="ui-dialog__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          {dismissible ? <IconButton icon={X} label="Close" onClick={() => onOpenChange(false)} /> : null}
        </div>
        <div className="ui-dialog__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
