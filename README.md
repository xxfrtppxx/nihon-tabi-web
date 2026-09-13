# nihon-tabi-web

Web app (Next.js) สำหรับบันทึกการท่องเที่ยวญี่ปุ่น — ใช้ backend และ API เดียวกับ Android (ดู [`../SYSTEM_DESIGN.md`](../SYSTEM_DESIGN.md))

## Stack

- Next.js 16 (App Router) + TypeScript, React 19
- Tailwind CSS v4
- TanStack Query — data fetching/cache จาก `nihon-tabi-api`
- Auth: access token เก็บใน `localStorage`, refresh token เก็บใน httpOnly cookie (ตั้งโดย `nihon-tabi-api`, `path=/auth`, JS อ่านไม่ได้) — client-side ทั้งหมด ไม่มี server session

## โครงสร้างโฟลเดอร์

```
app/
  layout.tsx / providers.tsx   -- root layout, QueryClientProvider + AuthProvider
  page.tsx                      -- redirect ตาม auth state (/map หรือ /login)
  login/, register/             -- ฟอร์ม auth
  map/                           -- หน้าหลัก: เลือกจังหวัด → เมือง (list) + dot-matrix map + VisitEditor
  city/[id]/                     -- หน้ารายละเอียดเมือง (records, รูปทั้งหมด, nearby)
  trips/                         -- ตัวอย่าง trip แบบ static (ยังไม่มี backend)
  visits/                        -- รายการที่ไปแล้ว/อยากไป
  dashboard/                     -- สถิติ (% ที่ไปแล้ว, แยกตาม region)
components/
  nav-bar.tsx
  dot-map.tsx                     -- dot-matrix map primitive (useDotGrid + DotMapSvg/DotMapFill) — ใช้ทั้งใน Atlas, city page, dashboard, trips
  visit-editor.tsx                -- modal สร้าง/แก้/ลบ visit
lib/
  api.ts                          -- fetch client (credentials: "include" ทุก request) + endpoint functions ทั้งหมด (auth/geo/visits/stats)
  auth-context.tsx                 -- AuthProvider + useAuth()
  token-store.ts                    -- localStorage-backed access token storage (refresh token อยู่ใน cookie ไม่ผ่านโค้ดฝั่ง client เลย)
hooks/
  use-require-auth.ts                -- redirect ไป /login ถ้ายังไม่ login
```

## สถานะปัจจุบัน

ทดสอบผ่านเบราว์เซอร์จริงแล้วครบ flow: register → login → เลือกจังหวัด/เมือง ผ่าน sidebar แบบ drill-down พร้อม search → mark visited/want_to_go พร้อมวันที่/โน้ต/rating/รูปถ่าย → รายการที่ไปแล้ว → dashboard สถิติ → logout → auth guard เด้งกลับ /login ถูกต้อง

Atlas เป็น dot-matrix ล้วน (ตาม redesign v2 — ดู `../Nihon Tabi Redesign v2.dc.html`) แทนแผนที่ MapLibre แบบโต้ตอบได้จริงแบบเดิม: `components/dot-map.tsx` สุ่มจุดกริดจาก GeoJSON จริง (จาก GADM ผ่าน `nihon-tabi-api`) แล้ววาดเป็น SVG จุดสี่เหลี่ยมเล็กๆ ไล่สีตามสถานะ visited/want_to_go/mixed — `DotMapFill` วัดขนาดกล่องตัวเองผ่าน ResizeObserver แล้ว fit ให้เต็มพื้นที่จริง (ไม่ใช่ square เท่ากันทุกด้าน) การเลือกจังหวัด/เมืองทำผ่าน sidebar list เท่านั้น ไม่มีคลิกลงบนแผนที่โดยตรงอีกต่อไป

เลือกเมืองในหน้า Atlas จะโชว์กล่องข้อมูลลอยมุมล่างซ้าย (แถบรูป 3 รูป + ชื่อเมือง + โน้ตล่าสุด + ปุ่ม "Open city"/"Add record") แทนการเปิด modal ตรงๆ — "Open city" พาไปหน้า `app/city/[id]/page.tsx` (records ทั้งหมด, รูปทั้งหมด, nearby ที่ยังไม่ได้ไป), "Add record" เปิด `VisitEditor`

## Setup

```bash
npm install
cp .env.local.example .env.local   # ตั้ง NEXT_PUBLIC_API_BASE_URL ให้ตรงกับที่ nihon-tabi-api รันอยู่
npm run dev                          # http://localhost:3001 (ตั้ง port แยกจาก backend ที่ 3000)
```

ต้องรัน `nihon-tabi-api` (พร้อม Postgres) ควบคู่กันด้วย — ดู setup ที่ [`../nihon-tabi-api/README.md`](../nihon-tabi-api/README.md)

## อัปโหลดรูป

Photo section ใน VisitEditor แสดงเมื่อแก้ visit ที่บันทึกแล้วเท่านั้น (visit ใหม่ที่ยังไม่ save จะยังไม่มี `visitId` ให้ผูกรูป) — อัปโหลดผ่าน presigned URL ตรงไป Cloudflare R2 (ดู setup ที่ [`../nihon-tabi-api/README.md`](../nihon-tabi-api/README.md#photo-upload-cloudflare-r2)) แล้วค่อยบันทึก URL ลง DB, แสดงผลผ่าน `next/image` (ต้องตั้ง `images.remotePatterns` ใน `next.config.ts` ให้ตรงกับ domain ของ R2 public URL ที่ใช้)
