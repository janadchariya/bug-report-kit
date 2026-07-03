import { NextResponse } from "next/server";

export function jsonOk(data: unknown, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function jsonError(
  code: string,
  message: string,
  status: number,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json(
    { ok: false, error: { code, message, ...extra } },
    { status },
  );
}

export function handleApiError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  if (message.startsWith("Forbidden")) {
    return jsonError("forbidden", message, 403);
  }
  if (message.startsWith("Unknown ") || message.includes("not found")) {
    return jsonError("not_found", message, 404);
  }
  if (message.startsWith("Cannot ")) {
    return jsonError("conflict", message, 409);
  }
  console.error("[api]", err);
  return jsonError("internal", message, 500);
}
