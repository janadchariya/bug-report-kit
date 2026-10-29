import { REPORT_A_BUG_GUIDE } from "./content";

it("uses Bug wording, the matching menu label and direct MD contact for urgent payment issues", () => {
  const text = JSON.stringify(REPORT_A_BUG_GUIDE);
  expect(text).not.toContain("บั๊ก");
  expect(text).not.toContain("My bugs");
  expect(REPORT_A_BUG_GUIDE.steps[2].description).toContain("My bug reports");
  expect(REPORT_A_BUG_GUIDE.steps[2].caption).toContain("My bug reports");
  expect(REPORT_A_BUG_GUIDE.callouts[1].description).toBe("เรื่องด่วนเกี่ยวกับค่าคอมมิชชันหรือการจ่ายเงิน ให้ติดต่อ MD โดยตรง ไม่ต้องรอ bug report");
});
