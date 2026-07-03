import { getCurrentUser } from "@/lib/auth/current-user";

import {
  BackLink,
  Callout,
  GradientText,
  IconBug,
  IconCheck,
  Kicker,
  SectionLabel,
  Step,
  Timeline,
} from "../_components";
import { StepMock } from "../step-mocks";

export default async function BugHelpPage() {
  await getCurrentUser();

  return (
    <div className="mx-auto max-w-3xl">
      <BackLink />
      <Kicker />
      <h1 className="text-[26px] font-medium leading-tight tracking-tight text-[var(--text-primary)]">
        วิธี <GradientText>แจ้งปัญหา (Bug)</GradientText>
      </h1>
      <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-[var(--text-secondary)]">
        เจอปัญหาหรือสิ่งที่ทำงานผิดพลาดระหว่างใช้งาน แจ้งทีมได้ทันทีพร้อมภาพหน้าจอ แล้วติดตามการแก้ไขได้เอง
        ใช้ได้ทุกคน
      </p>

      <SectionLabel>ขั้นตอน</SectionLabel>
      <Timeline>
        <Step n={1} title="กดปุ่มแจ้งปัญหา" tags={[["emp", "ทุกคน"]]}>
          กดปุ่มกลมมุมขวาล่างของหน้าจอ (ไอคอน bug) จะเปิดฟอร์มแจ้งปัญหาขึ้นมา
          <StepMock
            id="bug-1"
            caption="ปุ่มกลมสีส้มมุมขวาล่าง มีทุกหน้า — กดเพื่อเปิดฟอร์มแจ้งปัญหา"
          />
        </Step>
        <Step n={2} title="อธิบาย + แนบภาพหน้าจอ" tags={[["emp", "ทุกคน"]]}>
          เล่าว่าเกิดอะไรขึ้น ทำอะไรอยู่ตอนเจอปัญหา และแนบภาพหน้าจอ — ยิ่งละเอียด ทีมยิ่งแก้ได้เร็ว
          <StepMock
            id="bug-2"
            caption="พิมพ์อธิบายปัญหา + แนบภาพหน้าจอ ยิ่งละเอียดยิ่งแก้ไว"
          />
        </Step>
        <Step n={3} title="ส่ง แล้วติดตามได้" tags={[["emp", "ทุกคน"]]}>
          กดส่ง รายการจะอยู่ในเมนู &ldquo;Bug ของฉัน&rdquo; ติดตามสถานะได้ และมีแจ้งเตือนเมื่อทีมตอบกลับหรือแก้เสร็จ
          <StepMock
            id="bug-3"
            caption="เมนู “Bug ของฉัน” แสดงรายการที่แจ้ง + สถานะการแก้ไข"
          />
        </Step>
      </Timeline>

      <Callout title="แจ้งได้ทุกอย่าง" icon={<IconBug />}>
        ทั้งบั๊ก ความผิดพลาดของข้อมูล หรือข้อเสนอแนะให้ใช้งานง่ายขึ้น — แจ้งมาได้หมด ทีมอ่านทุกรายการ
      </Callout>
      <Callout title="ปัญหาเร่งด่วนเรื่องเงิน" icon={<IconCheck />}>
        ถ้าเป็นเรื่องยอดเงิน/การจ่ายที่เร่งด่วน แจ้ง Bug ไว้พร้อมแจ้งฝ่ายบัญชีหรือหัวหน้าโดยตรงควบคู่กัน
      </Callout>
    </div>
  );
}
