/** Almond's shared bug help, shown below the role guides for every signed-in user. */
export const REPORT_A_BUG_GUIDE = {
  title: "Report a bug",
  summary: "เจอปัญหาหรือสิ่งที่ทำงานผิดพลาดระหว่างใช้งาน แจ้งทีมได้ทันทีพร้อมภาพหน้าจอ แล้วติดตามการแก้ไขได้เอง ใช้ได้ทุกคน",
  steps: [
    {
      title: "Open the bug form",
      description: "กดปุ่มกลมมุมขวาล่างของหน้าจอ (ไอคอน Bug) จะเปิดฟอร์มแจ้งปัญหาขึ้นมา",
      caption: "ปุ่มกลมสีม่วงมุมขวาล่าง มีทุกหน้า — กดเพื่อเปิดฟอร์มแจ้งปัญหา",
    },
    {
      title: "Describe and attach a screenshot",
      description: "เล่าว่าเกิดอะไรขึ้น ทำอะไรอยู่ตอนเจอปัญหา และแนบภาพหน้าจอ — ยิ่งละเอียด ทีมยิ่งแก้ได้เร็ว วางภาพด้วย ⌘/Ctrl+V ได้แม้กำลังพิมพ์ใน Summary วาดทำเครื่องหมายบนภาพได้ และแนบ PDF ได้ 1 ไฟล์ ขนาดไม่เกิน 4 MiB",
      caption: "พิมพ์อธิบายปัญหา + แนบภาพหน้าจอ ยิ่งละเอียดยิ่งแก้ไว",
    },
    {
      title: "Send and follow up",
      description: "กด Send เมื่อกรอก Summary และแนบภาพครบ รายการจะอยู่ในเมนู My bug reports ติดตามสถานะได้ และมีป้ายแจ้งเตือนเมื่อทีมตอบกลับหรือแก้เสร็จ เปิดรายการเพื่ออ่านและตอบทีมได้ พร้อมแนบภาพหรือ PDF ในความคิดเห็น",
      caption: "เมนู My bug reports แสดงรายการที่แจ้ง + สถานะการแก้ไข",
    },
  ],
  callouts: [
    { title: "Tell us what went wrong", description: "ทั้ง Bug ความผิดพลาดของข้อมูล หรือข้อเสนอแนะให้ใช้งานง่ายขึ้น — แจ้งมาได้หมด ทีมอ่านทุกรายการ" },
    { title: "Urgent payment issues", description: "เรื่องด่วนเกี่ยวกับค่าคอมมิชชันหรือการจ่ายเงิน ให้ติดต่อ MD โดยตรง ไม่ต้องรอ bug report" },
  ],
} as const;

