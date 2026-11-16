"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { PageTopbar } from "@/features/topbar/page-topbar";
import { useErrorScreen } from "@/features/shell/client/error-screen.client";

export function BugsError({ error, retry }: { error: unknown; retry: () => void }) {
  const tryAgain = useErrorScreen(error, "bugs", retry);
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert">
      <PageTopbar title="Bug reports" />
      <div className="mx-6 rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
        <p className="font-medium text-foreground">Bug reports could not load</p>
        <p className="mt-1 text-sm text-muted-foreground">Try again in a moment.</p>
        <Button variant="outline" className="mt-4" onClick={tryAgain}>
          Try again
        </Button>
      </div>
    </div>
  );
}
