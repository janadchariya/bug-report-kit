"use client";

import type { ReactNode, RefObject } from "react";
import { Dialog } from "@/src/components/ui/dialog";

export function BottomSheet(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  returnFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  return (
    <Dialog
      className="ui-dialog ui-bottom-sheet"
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={props.title}
      description={props.description}
      returnFocusRef={props.returnFocusRef}
    >
      {props.children}
    </Dialog>
  );
}
