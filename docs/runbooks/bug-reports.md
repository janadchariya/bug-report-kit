# In-app bug reports


สถานะการส่งมอบรอบนี้: **not deployed** จนกว่าจะได้รับอนุญาตให้ deploy และตรวจสอบ production จริง การทดสอบ local หรือ Chat transport จำลองไม่ใช่หลักฐานว่า production พร้อมแล้ว

## Access and navigation

- ผู้มีสิทธิ์ `bugs.report` ใช้ **Report a bug** และ **My bug reports** ได้ ค่าเริ่มต้นให้สิทธิ์นี้กับทุก role ผู้รายงานอ่านรายงาน รูป และตอบในรายงานของตัวเองได้เท่านั้น
- ผู้มีสิทธิ์ `bugs.triage` เปิด **Bugs** เพื่ออ่านและตอบทุกรายงาน เปลี่ยนสถานะ Priority และ Assignee หรือนำรูปออกได้ ค่าเริ่มต้นให้ MD และ Admin การตรวจสิทธิ์ใช้ grant ปัจจุบันที่ server ไม่ใช่อาศัยการซ่อนปุ่มหรือชื่อ role
- โทรศัพท์เก็บ **Bugs** และ **My bug reports** ใน **More** โดยไม่ย้ายสามปลายทางแรกในแถบเมนู ปุ่มรายงานหลบแถบงานด้านล่างและซ่อนขณะมี modal รวมถึง R18 **Set up Google Chat** เปิดอยู่
- บัญชีที่ไม่มีสิทธิ์ทำงาน Lead ยังรายงานปัญหาและเห็น unread ของตัวเองได้ ไม่มีสิทธิ์อ่าน Lead เพิ่มจากฟีเจอร์นี้ การไม่มี webhook ไม่ลดสิทธิ์ใช้งานในแอป

## Report and attach an image

เปิด **Report a bug** ใส่ **Summary** ที่ไม่ว่าง (ไม่เกิน 200 ตัวอักษร) และแนบภาพหน้าจอจึงจะกด **Send** ได้ กด **+ Add details** เพื่อเพิ่ม **Description** ไม่เกิน 4,000 ตัวอักษร แนบ PDF เพิ่มได้ 1 ไฟล์ ไม่เกิน 4 MiB ส่วน server command ยังรองรับรายงานที่มีแต่ Summary เพื่อความเข้ากันได้ แต่ไม่ใช่กติกาของฟอร์ม R19.1

รูปต้องมาจากผู้ใช้เอง ระบบไม่จับภาพหน้าจออัตโนมัติ วางภาพจาก clipboard ลงในช่องแนบรูป ลากไฟล์มาวาง หรือกด **Attach image** เพื่อเลือก PNG, JPEG, WebP หรือ GIF ได้ หาก browser ไม่รองรับ paste ให้ใช้ picker หรือ drop แทน รับ GIF โดยแปลงเป็นภาพนิ่งก่อนส่ง ไม่รับ SVG หรือ HEIC และไม่อัปโหลดภาพเคลื่อนไหว

ก่อนแนบ ให้ตรวจชื่อ หมายเลขโทรศัพท์ email ข้อมูลลูกค้า และข้อมูลส่วนตัวทั้งในข้อความและภาพด้วยตนเอง หลีกเลี่ยงข้อมูลที่ไม่จำเป็น ระบบไม่ได้ตรวจ OCR หรือรับประกันว่าจะค้นพบชื่อลูกค้าในภาพหรือข้อความได้

ภาพที่แนบเปิดให้วาดได้ทันที ใช้ **Rectangle**, **Ellipse**, **Arrow** หรือ **Freehand** เลือก Red, Yellow หรือ Green และใช้ **Undo** / **Start over** เพื่อนำเครื่องหมายออก เลื่อนภาพและ Zoom เพื่อดูภาพยาว กด **Send** จึงรวมเครื่องหมายเป็นภาพที่อัปโหลด ส่วนภาพในความคิดเห็นถูกเตรียมและแนบโดยตรง ไม่มีขั้น Annotate/Apply ใน comment composer

browser ย่อภาพก่อนวาดให้ด้านยาวไม่เกิน 1920 px แล้วรวมเครื่องหมายเป็น WebP โดยมี PNG fallback ขนาดผลลัพธ์ไม่เกิน 2 MiB (2,097,152 bytes) server ตรวจชนิด raster ขนาดภาพ และจำนวน bytes ซ้ำอีกครั้ง ไฟล์ต้นทางมีขอบเขต 15 MiB และภาพบางไฟล์อาจต้องถูกย่อเพิ่มหรือถูกปฏิเสธ ให้ตรวจ preview ก่อนส่ง

draft และภาพ preview อยู่ใน memory ขณะที่หน้าหรือ dialog ยัง mounted เท่านั้น การส่งล้มเหลวหรือยังยืนยันผลไม่ได้จะเก็บ draft ให้ลองอีกครั้งด้วย retry key เดิม การ refresh เต็มหน้าอาจทำให้ draft หาย ไม่มีการเก็บ draft ใน localStorage, sessionStorage หรือ IndexedDB การปิด draft ที่มีข้อมูลต้องยืนยันการทิ้งข้อมูล

บริบทที่แนบอัตโนมัติจำกัดเป็น path และ query ที่อยู่ใน allowlist, viewport และข้อมูล OS/browser/device จาก User-Agent โดยทิ้ง `q`, search text, query ที่ไม่รู้จัก และ hash ไม่เก็บ cookie หรือ storage dump server ระบุผู้รายงานและ build SHA เอง

## Triage, discussion and history

ใน **Bugs** เลือกรายงาน ใช้ตัวกรอง Status, Priority และ Assignee ได้ สถานะเดินตามนี้:

- **New → In progress** หรือ **Cancelled**
- **In progress → Done** หรือ **Cancelled**
- **Done / Cancelled → In progress** เพื่อ reopen

การ Cancel ต้องมี **Cancellation reason** ที่ไม่ว่างและไม่เกิน 500 ตัวอักษร สถานะ New ข้ามไป Done ไม่ได้ ประวัติสถานะเก็บผู้เปลี่ยน เวลา และเหตุผล การบันทึกสถานะเดิมไม่เพิ่มประวัติ Assignee เลือก **Unassigned** หรือผู้ใช้ active ที่มีสิทธิ์ triage ปัจจุบันได้เท่านั้น ถ้าคนเดิมหมดสิทธิ์จะแสดงว่า unavailable และเลือกคนใหม่ได้

ถ้ามีผู้แก้ไขก่อนหน้า ระบบแสดงข้อความให้โหลดข้อมูลล่าสุดและตรวจสอบ draft ก่อนบันทึกอีกครั้ง ไม่เขียนทับงานคนอื่นเงียบ ๆ

**Comments** รับข้อความไม่เกิน 4,000 ตัวอักษรหรือหนึ่งรูป โดยต้องมีอย่างน้อยหนึ่งอย่าง ข้อความและรูปถูกบันทึกพร้อมกัน ผู้รายงานตอบในรายงาน Done หรือ Cancelled ได้โดยไม่ reopen อัตโนมัติ ไม่มีการแก้ไขหรือลบ comment ที่ส่งแล้ว และไม่มี hard delete ของรายงานหรือประวัติ

ขอบเขตการส่งคือ 5 รายงานต่อผู้รายงานต่อ 10 นาที และ 30 comments ต่อผู้เขียนต่อ 10 นาที รูปและ PDF ในรายงานและ comments รวมกันได้ไม่เกิน 50 MiB ต่อผู้ใช้ในช่วง 24 ชั่วโมงย้อนหลัง บังคับที่ DB ข้าม process โดยนับ bytes ที่อัปโหลดแม้รูปถูกนำออกแล้ว การลองส่งคำขอเดิมซ้ำไม่สร้างรายงาน comment หรือ Chat ซ้ำ และไม่ใช้ quota เพิ่ม

## NEW and unread

badge ของ **Bugs** นับรายงานสถานะ New ส่วน badge ของ **My bug reports** นับจำนวนรายงานของผู้ใช้ที่ยังมีกิจกรรมจาก triager ที่ไม่เคยอ่าน รวมรายงาน Done และ Cancelled ด้วย หนึ่งรายงานที่มีหลาย reply ยังนับเป็นหนึ่ง

comment หรือการเปลี่ยนสถานะจริงจาก triager คนอื่นทำให้เกิด unread การตอบหรือ triage ของตัวเอง และการเปลี่ยนเฉพาะ Priority/Assignee ไม่เพิ่ม unread การเปิดรายละเอียดจะ mark read เฉพาะกิจกรรมล่าสุดที่แสดงจาก snapshot นั้น หาก reply ใหม่เข้าหลัง snapshot จะยัง unread อยู่ การ prefetch รายการหรือการโหลดประวัติเก่าไม่ mark read

รายละเอียดเริ่มด้วย 50 comments และ 50 status changes ล่าสุด เรียงตามเวลา และมีปุ่มโหลดรายการเก่า เมนูทุกส่วนใช้ `/api/nav-counts` และ poller เดียวเดิมทุก 45 วินาทีขณะหน้า visible การส่งหรืออ่านสำเร็จ refresh badge ทันที การตอบจากอีก browser อาจใช้เวลาถึงรอบ poll ถัดไป

## Screenshot storage and manual privacy review

bytes ของรูปอยู่ใน Postgres ตาราง `bug_report_images` แยกจาก metadata รายงาน ไม่มี object storage หรือ public URL โหลดได้ผ่าน `GET /api/bugs/images/[id]` ที่ตรวจ session และ reporter-or-triager ทุกครั้ง พร้อม `private, no-store` และ `nosniff` ห้ามนำ URL นี้ผ่าน public image optimizer หรือ CDN cache

เมื่อพบข้อมูลลูกค้าหรือข้อมูลส่วนตัวในภาพ ให้ triager ตรวจสอบรายงานและเลือก **Remove image** ระบุ **Removal reason** แล้ว **Confirm removal** วิธีนี้ทำให้ bytes ใน live row เป็น NULL และคง metadata ผู้ดำเนินการ เวลา และเหตุผลไว้ หน้ารายงานแสดง **Screenshot removed** / **Image removed** ไม่มีการ restore หรือแทนที่ภาพ และ comment เดิมยังอยู่

การ review นี้เป็นงาน manual ทั้ง screenshot pixels และชื่อที่อาจอยู่ในข้อความ ไม่ใช่การ scan อัตโนมัติของ contact-privacy inventory อย่าอ้างว่า contact erasure ล้าง screenshot หรือ free text ครบแล้วเพียงเพราะ counter ของ inventory เป็นศูนย์ ตรวจชื่อและบริบทที่เหลือด้วยตนเองตามกระบวนการ privacy ปัจจุบัน

การทำ bytes เป็น NULL ไม่ลบข้อมูลย้อนหลังจาก backup ข้อมูล production และ backups ยังคงใช้นโยบาย retention เดิม ไม่มี cleanup ทำลายข้อมูลเพิ่ม และไม่มีคำมั่นว่าจะลบข้อมูลจากระบบภายนอกหรือ backup ย้อนหลังได้

## PDF screening and manual privacy review

PDF เก็บใน `bug_report_files` และดาวน์โหลดผ่าน `GET /api/bugs/files/[id]` ที่ตรวจ reporter-or-triager ก่อนอ่าน bytes ทุกครั้ง ตอบกลับเป็น attachment พร้อม `private, no-store`, `nosniff` และ CSP `sandbox` ชื่อไฟล์มี ASCII fallback `attachment.pdf` พร้อมชื่อ UTF-8 ใน `filename*`

การตรวจ active content เป็น best effort: ตรวจชื่อ `/JavaScript`, `/JS`, `/Launch`, `/EmbeddedFile`, `/XFA` และ `/RichMedia` หลัง decode `#xx` และตรวจ delimiter ของชื่อ โดยข้าม bytes ระหว่าง `stream` กับ `endstream` จึง **ไม่ decompress หรือ scan compressed object streams (`/ObjStm`)** การตรวจนี้ไม่ใช่ PDF parser หรือ malware scanner ที่สมบูรณ์ `/OpenAction` แบบเปิดหน้าหรือกำหนด zoom ใช้ได้ ส่วน JavaScript ที่ระบุผ่าน `/JS` หรือ `/JavaScript` ยังถูกปฏิเสธ ไม่ปฏิเสธ `/AA`, `/URI` หรือ `/SubmitForm` เพราะพบได้ในฟอร์มและใบเสนอราคาปกติ

ผู้รายงานแนบ PDF ในช่องของรายงานได้เฉพาะเมื่อยังไม่มี PDF และสถานะเป็น **New** หรือ **In progress** เท่านั้น server ตรวจเงื่อนไขเดียวกัน การ retry request เดิมที่สำเร็จแล้วคืน metadata เดิมได้แม้สถานะเปลี่ยนเป็น **Done** หรือ **Cancelled** ข้อจำกัดสถานะนี้ไม่ใช้กับ PDF ใน comment ซึ่งยังต้องเป็น comment ที่รอ PDF และผู้แนบต้องเป็นผู้เขียน comment นั้น

privacy scrub registry ปัจจุบันกำหนด classification ระดับตาราง ไม่รองรับการให้ `file_name` เป็น `text` แยกจาก bytes ของ PDF จึงคง `bug_report_files` เป็น `manual` เช่นเดียวกับ metadata ของ `bug_report_images` ผู้ดูแลต้องตรวจทั้งเนื้อหา PDF, `file_name` และ `removed_reason` ด้วยตนเองระหว่าง contact erasure; เมื่อ metadata ตรงกับ strong identifier ระบบนับ manual follow-up แต่ไม่ได้ล้างชื่อไฟล์ให้อัตโนมัติ อย่าอ้างว่า contact erasure ล้างข้อมูลส่วนตัวในไฟล์หรือชื่อไฟล์แล้วเพียงเพราะ counter เป็นศูนย์

## Optional Google Chat delivery

ใช้ personal webhook และ outbox/jobs ของ host หรือ reference adapter เท่านั้น รายงานใหม่ส่งให้ triager ที่ active มีสิทธิ์ปัจจุบัน และมี personal webhook ที่ active ส่วน reply หรือ status change จาก triager ส่งให้ผู้รายงานที่ active และมี webhook โดยไม่ส่งแจ้งตัวเอง

ถ้าไม่มี webhook, webhook เป็น broken/disabled หรือมีแต่ API destination จะไม่มี Chat ระบบไม่ใช้ shared webhook หรือ API fallback แทน ผู้ใช้ยังติดตามในแอปได้ครบ และต้องรักษาขอบเขตสิทธิ์การตั้ง webhook ของ host

`chat_webhooks_paused` หยุดการแจ้งเตือนทั้งตอน enqueue และ delivery โดย source host ใช้ setting เดิม ส่วน reference adapter แมป setting นี้กับ `BUG_CHAT_PAUSED=true` ให้ installer ผูกกับ switch ของ host การเปลี่ยน credential/revision ถอนสิทธิ์ หรือ deactivate ผู้รับก่อนส่งทำให้ pending delivery ถูก supersede ตามการตรวจปัจจุบัน ไม่มีการย้ายไปส่งที่อื่น

การ์ดแสดงเพียง **Bug report <short id>**, สถานะ และ trusted application link ไปยัง `/bugs/[id]` หรือ `/bugs/mine/[id]` ตามผู้รับ **ไม่ส่ง free-text Summary**, Description, comment, รูป, page context หรือข้อมูลลูกค้าไป Chat แม้ Summary จะดูปลอดภัยก็ใช้ fallback เดิม ไม่รับ host/query จาก captured location เป็นปลายทาง

outbox ถูกบันทึกใน transaction ของงาน แล้วค่อยปลุก job หลัง commit ความล้มเหลว timeout หรือ retry ของ Google ไม่ทำให้รายงานที่บันทึกแล้วกลายเป็นการส่งล้มเหลว หากการปลุก job ไม่สำเร็จ scheduled drain/cron ของ host ต้องเรียก drainJobs() ต่อได้ การ์ด webhook ที่ส่งแล้วไม่มี PATCH หรือ privacy-repair loop และไม่มีคำมั่นว่าจะลบข้อความที่ส่งแล้วจาก Google ได้

## Reference adapter operations

`reference/src/server/settings/resolve.ts` มีเฉพาะ pause switch ของ bugs ไม่มี holiday/business-calendar dependencies จาก source host ส่วน `drainJobs()` รับเฉพาะงานส่ง bug Chat และต้องมี protected cron เรียกซ้ำสำหรับงาน retry หรือ wake-up ที่หายไป ไม่ให้ claim งานชนิดอื่นของ host

เก็บ webhook URL แบบเข้ารหัสด้วย secret ของ host ไม่ส่ง credential ไป client หรือ logs ค่า `APP_URL` เป็น trusted origin ของลิงก์ในการ์ด ห้ามใช้ captured location เป็น origin หากไม่ใช้ Google Chat ให้ stub enqueue เป็น no-op ตาม INTEGRATION.md โดยคง audit events ของรายงานไว้

## Local verification

ใช้ fixture `r19-bugs` ที่ guard ว่าเป็น localhost และ DB ชื่อ test/e2e เท่านั้น สร้างผู้ใช้และ Lead สังเคราะห์ ไม่มี webhook จริง inspect คืนเฉพาะ metadata/ความยาว bytes และจำนวนแถว cleanup Cancel รายงานที่ยังเปิด archive Lead และ deactivate ผู้ใช้ โดยไม่ hard delete หรือเปลี่ยน provider modes

ชุด browser ต้องใช้ host test config พร้อม desktop และ phone projects รวมทั้ง login/scenario fixture ตาม INTEGRATION.md กรณีทดสอบ Chat onboarding, bulk bars และ role settings ต้องมีหน้าที่เทียบเท่าของ host คำสั่งจาก root ของ host หลังติดตั้ง (kit นี้ไม่ใช่แอปที่ build ได้เอง):

```sh
npx tsc --noEmit
npx vitest run --project unit
npx vitest run --project server
npx playwright test tests/e2e/bugs.spec.ts --list
npx playwright test tests/e2e/bugs.spec.ts tests/e2e/r19-annotation-navigation.spec.ts
```

ตั้ง `TEST_DATABASE_URL` และ migrate disposable DB ก่อน server tests ตามตัวอย่าง Vitest; สำหรับ Playwright กำหนด `DATABASE_URL` ให้ชี้ DB ทดสอบเดียวกัน และ `PLAYWRIGHT_BASE_URL` ให้ชี้ host ทดสอบ `--list` ใช้ยืนยันชื่อ spec ได้ แต่ไม่ยืนยันว่า browser หรือ DB ทำงานผ่าน ต้องบันทึกผลคำสั่งที่รันจริง แยก checks ที่ถูก sandbox บล็อก และตรวจ layout/paste/touch กับ browser จริงก่อนส่งมอบ production
