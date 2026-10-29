import { act, render } from "@testing-library/react";
import { markBugReadAction } from "@/app/actions/bugs";
import { ReporterReadEffect } from "./reporter-read-effect";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("@/app/actions/bugs", () => ({ markBugReadAction: vi.fn() }));
vi.mock("@/src/components/shell/nav-badges", () => ({ useRefreshNavCounts: () => refresh }));

beforeEach(() => { vi.useFakeTimers(); vi.mocked(markBugReadAction).mockReset(); refresh.mockReset(); });
afterEach(() => { vi.useRealTimers(); });

it("retries a failed acknowledgement with the displayed watermark even after a same-watermark refresh", async () => {
  vi.mocked(markBugReadAction).mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({ ok: false, code: "internal_error", reasonCode: null, correlationId: "test" })
    .mockResolvedValueOnce({ ok: true, data: { readSeq: 4, activitySeq: 5 } });
  const view = render(<ReporterReadEffect bugId="report" isOwner seenActivitySeq={4} />);
  await act(async () => {});
  view.rerender(<ReporterReadEffect bugId="report" isOwner seenActivitySeq={4} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
  await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
  expect(markBugReadAction).toHaveBeenCalledTimes(3);
  for (const [input] of vi.mocked(markBugReadAction).mock.calls) expect(input).toEqual({ bugId: "report", seenActivitySeq: 4 });
  expect(refresh).toHaveBeenCalledOnce();
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(markBugReadAction).toHaveBeenCalledTimes(3);
});

it("bounds failed retries and cancels scheduled acknowledgements when the detail closes", async () => {
  vi.mocked(markBugReadAction).mockRejectedValue(new Error("offline"));
  const view = render(<ReporterReadEffect bugId="report" isOwner seenActivitySeq={4} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
  expect(markBugReadAction).toHaveBeenCalledTimes(3);
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(markBugReadAction).toHaveBeenCalledTimes(3);
  view.rerender(<ReporterReadEffect bugId="another-report" isOwner seenActivitySeq={1} />);
  await act(async () => {});
  expect(markBugReadAction).toHaveBeenCalledTimes(4);
  view.unmount();
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(markBugReadAction).toHaveBeenCalledTimes(4);
  expect(refresh).not.toHaveBeenCalled();
});

it("does not retry an old displayed watermark after the detail changes", async () => {
  vi.mocked(markBugReadAction).mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({ ok: true, data: { readSeq: 5, activitySeq: 5 } });
  const view = render(<ReporterReadEffect bugId="report" isOwner seenActivitySeq={4} />);
  await act(async () => {});
  view.rerender(<ReporterReadEffect bugId="report" isOwner seenActivitySeq={5} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(markBugReadAction).toHaveBeenCalledTimes(2);
  expect(markBugReadAction).toHaveBeenLastCalledWith({ bugId: "report", seenActivitySeq: 5 });
  expect(refresh).toHaveBeenCalledOnce();
});
