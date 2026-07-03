"use client";

import { useEffect } from "react";

export function ReporterReadEffect({ bugId }: { bugId: string }) {
  useEffect(() => {
    fetch(`/api/bugs/${bugId}/reporter-read`, { method: "PATCH" }).catch(
      () => undefined,
    );
  }, [bugId]);
  return null;
}
