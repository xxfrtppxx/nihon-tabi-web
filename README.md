# nihon-tabi-web

Web app (Next.js) สำหรับบันทึกการท่องเที่ยวญี่ปุ่น — ใช้ backend และ API เดียวกับ Android (ดู [`../SYSTEM_DESIGN.md`](../SYSTEM_DESIGN.md))

## Stack

- Next.js 16 (App Router) + TypeScript, React 19
- MapLibre GL JS (`react-map-gl/maplibre`) — แผนที่ฐาน (basemap: OpenFreeMap, ฟรีไม่ต้องใช้ API key)
- Tailwind CSS v4
- TanStack Query — data fetching/cache จาก `nihon-tabi-api`
- Auth: access token เก็บใน `localStorage`, refresh token เก็บใน httpOnly cookie (ตั้งโดย `nihon-tabi-api`, `path=/auth`, JS อ่านไม่ได้) — client-side ทั้งหมด ไม่มี server session

## โครงสร้างโฟลเดอร์

```
app/
  layout.tsx / providers.tsx   -- root layout, QueryClientProvider + AuthProvider
  page.tsx                      -- redirect ตาม auth state (/map หรือ /login)
  login/, register/             -- ฟอร์ม auth
  map/                           -- หน้าหลัก: เลือกจังหวัด → เมือง (list) + แผนที่ + VisitEditor
  visits/                        -- รายการที่ไปแล้ว/อยากไป
  dashboard/                     -- สถิติ (% ที่ไปแล้ว, แยกตาม region)
components/
  nav-bar.tsx
  map-view.tsx                   -- MapLibre wrapper (dynamic import, ssr:false)
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

แผนที่แสดง polygon จริงของจังหวัด/เมือง (จาก GADM ผ่าน `nihon-tabi-api`) พร้อมสีตามสถานะ visited/want_to_go (ผสมสีถ้ามีทั้งสองสถานะในที่เดียวกัน), fit ขอบเขตอัตโนมัติเมื่อเลือกจังหวัด/เมือง, ล็อค pan/zoom ให้อยู่ในขอบเขตญี่ปุ่น

คลิกเลือกเมืองบนแผนที่ไม่เปิด modal แก้ไขข้อมูลโดยตรงอีกต่อไป — แสดงเป็น preview บนแผนที่แทน: การ์ด polygon เอียงคล้ายโมเดล 3D (`components/map-view.tsx`, วาดจาก GeoJSON เป็น SVG แล้วเอียงด้วย CSS transform) ถ้ายังไม่มีข้อมูล, หรือรูปถ่ายสไตล์โพลารอยด์กระจายอยู่ในพื้นที่ (ผ่าน MapLibre `Marker`) ถ้ามี visit ที่มีรูปแล้ว — คลิกการ์ด/รูปเพื่อเปิด editor (สร้างใหม่/ดูรายการเดิม) ปุ่ม "+" ลอยมุมล่างขวาเปิด editor สร้างใหม่ได้ตลอดโดยไม่ต้องเลือกเมืองก่อน (มีช่องเลือกจังหวัด/เมืองในฟอร์มเอง — จะ disable ถ้าเปิดมาจากเมืองที่เลือกไว้แล้วบนแผนที่)

### หมายเหตุเรื่อง maplibre-gl เวอร์ชัน

ตอนแรกลองใช้ `maplibre-gl@6.x` (ล่าสุดตอนเขียน) แล้วเจอบั๊ก: raster background layer ขึ้น แต่ vector tile layer (ถนน/เมือง/label) ไม่โหลดเลยไม่ว่าจะใช้ Turbopack หรือ webpack dev server — เป็นปัญหาของตัว library เอง ไม่เกี่ยวกับโค้ดเรา จึงปักหมุดไว้ที่ `maplibre-gl@5.24.0` (เสถียร ใช้งานได้ปกติ) แทน ถ้าจะอัปเป็น v6 ในอนาคตต้องทดสอบ vector tile loading ให้ดีก่อน

## Setup

```bash
npm install
cp .env.local.example .env.local   # ตั้ง NEXT_PUBLIC_API_BASE_URL ให้ตรงกับที่ nihon-tabi-api รันอยู่
npm run dev                          # http://localhost:3001 (ตั้ง port แยกจาก backend ที่ 3000)
```

ต้องรัน `nihon-tabi-api` (พร้อม Postgres) ควบคู่กันด้วย — ดู setup ที่ [`../nihon-tabi-api/README.md`](../nihon-tabi-api/README.md)

## อัปโหลดรูป

Photo section ใน VisitEditor แสดงเมื่อแก้ visit ที่บันทึกแล้วเท่านั้น (visit ใหม่ที่ยังไม่ save จะยังไม่มี `visitId` ให้ผูกรูป) — อัปโหลดผ่าน presigned URL ตรงไป Cloudflare R2 (ดู setup ที่ [`../nihon-tabi-api/README.md`](../nihon-tabi-api/README.md#photo-upload-cloudflare-r2)) แล้วค่อยบันทึก URL ลง DB, แสดงผลผ่าน `next/image` (ต้องตั้ง `images.remotePatterns` ใน `next.config.ts` ให้ตรงกับ domain ของ R2 public URL ที่ใช้)
