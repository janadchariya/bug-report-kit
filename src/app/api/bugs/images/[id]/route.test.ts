import { beforeEach, expect, it, vi } from "vitest";
import type { Actor } from "@/src/server/auth/actor";
import { AuthenticationError, AuthorizationError, DomainRuleError } from "@/src/server/errors";

const mocks = vi.hoisted(() => ({ requireActor: vi.fn(), readBugImage: vi.fn(), error: vi.fn() }));
vi.mock("@/src/server/auth/guard", () => ({ requireActor: mocks.requireActor }));
vi.mock("@/src/server/bugs/images", () => ({ readBugImage: mocks.readBugImage }));
vi.mock("@/src/server/logging/logger", () => ({ logger: { error: mocks.error } }));
const actor: Actor = { userId: "00000000-0000-4000-8000-000000000002", email: "synthetic@example.test", displayName: "Synthetic", nickname: null, roles: new Set(["bd"]), permissions: new Set(["bugs.report"]), loginMethod: "workspace", sessionId: null };
const imageId = "00000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireActor.mockResolvedValue(actor);
  mocks.readBugImage.mockResolvedValue({ content: Buffer.from([1,2,3]), mimeType: "image/png", width: 1, height: 1, byteCount: 3 });
});
async function read(id = imageId) {
  const { GET } = await import("./route");
  return GET(new Request(`https://crm.test/api/bugs/images/${id}?download=customer-name`), { params: Promise.resolve({ id }) });
}

it("awaits params and serves private bytes with a fixed safe inline filename", async () => {
  const response = await read();
  expect(response.status).toBe(200);
  expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1,2,3]);
  expect(response.headers.get("content-type")).toBe("image/png");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("content-disposition")).toBe('inline; filename="bug-image.png"');
  expect(response.headers.has("etag")).toBe(false);
  expect(response.headers.has("set-cookie")).toBe(false);
  expect(mocks.readBugImage.mock.calls[0][1]).toEqual({ actor, imageId });
});

it.each(["missing_session", "inactive_session"])("returns 401 for %s without redirect or image read", async reason => {
  mocks.requireActor.mockRejectedValue(new AuthenticationError(reason));
  const response = await read();
  expect(response.status).toBe(401);
  expect(response.headers.get("location")).toBeNull();
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(mocks.readBugImage).not.toHaveBeenCalled();
});

it.each([new DomainRuleError("bug_not_visible"), new AuthorizationError("revoked")])("uniformly returns 404 for denied, missing or removed images", async error => {
  mocks.readBugImage.mockRejectedValue(error);
  const response = await read();
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: "not_found" });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(mocks.error).not.toHaveBeenCalled();
});

it("refuses malformed IDs after auth without a database image read", async () => {
  const response = await read("not-a-uuid");
  expect(response.status).toBe(404);
  expect(mocks.requireActor).toHaveBeenCalledOnce();
  expect(mocks.readBugImage).not.toHaveBeenCalled();
});

it("logs only the safe error class for an unexpected failure", async () => {
  mocks.readBugImage.mockRejectedValue(new TypeError("customer@example.test"));
  const response = await read();
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: "unavailable" });
  expect(mocks.error).toHaveBeenCalledExactlyOnceWith({ event: "bug_image.failed", errorClass: "TypeError" });
});
