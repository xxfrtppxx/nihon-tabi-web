# nihon-tabi-web

Web app (Next.js) สำหรับบันทึกการท่องเที่ยวญี่ปุ่น — ใช้ backend และ API เดียวกับ Android (ดู [`../SYSTEM_DESIGN.md`](../SYSTEM_DESIGN.md))

## Stack

- Next.js 16 (App Router) + TypeScript, React 19
- MapLibre GL JS (`react-map-gl/maplibre`) — แผนที่ฐาน (basemap: OpenFreeMap, ฟรีไม่ต้องใช้ API key)
- Tailwind CSS v4
- TanStack Query — data fetching/cache จาก `nihon-tabi-api`
- Auth: access token + refresh token เก็บใน `localStorage` (client-side ทั้งหมด ไม่มี server session)

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
  api.ts                          -- fetch client + endpoint functions ทั้งหมด (auth/geo/visits/stats)
  auth-context.tsx                 -- AuthProvider + useAuth()
  token-store.ts                    -- localStorage-backed token storage
hooks/
  use-require-auth.ts                -- redirect ไป /login ถ้ายังไม่ login
```

## สถานะปัจจุบัน

ทดสอบผ่านเบราว์เซอร์จริงแล้วครบ flow: register → login → เลือกจังหวัด/เมือง (ยังเป็น list เพราะไม่มี polygon geometry จริง) → mark visited/want_to_go พร้อมวันที่/โน้ต/rating → รายการที่ไปแล้ว → dashboard สถิติ → logout → auth guard เด้งกลับ /login ถูกต้อง

แผนที่ฐาน (ถนน/เมือง จาก OpenFreeMap) แสดงผลได้แล้วและซูม/เลื่อนไปยังจังหวัดที่เลือกได้ (`flyTo` ตาม centroid) — **ยังไม่มี polygon สีตามสถานะ visited/want_to_go** เพราะรอข้อมูล GeoJSON ขอบเขตจริงจาก GADM pipeline (ดู SYSTEM_DESIGN.md ข้อ 6)

### หมายเหตุเรื่อง maplibre-gl เวอร์ชัน

ตอนแรกลองใช้ `maplibre-gl@6.x` (ล่าสุดตอนเขียน) แล้วเจอบั๊ก: raster background layer ขึ้น แต่ vector tile layer (ถนน/เมือง/label) ไม่โหลดเลยไม่ว่าจะใช้ Turbopack หรือ webpack dev server — เป็นปัญหาของตัว library เอง ไม่เกี่ยวกับโค้ดเรา จึงปักหมุดไว้ที่ `maplibre-gl@5.24.0` (เสถียร ใช้งานได้ปกติ) แทน ถ้าจะอัปเป็น v6 ในอนาคตต้องทดสอบ vector tile loading ให้ดีก่อน

## Setup

```bash
npm install
cp .env.local.example .env.local   # ตั้ง NEXT_PUBLIC_API_BASE_URL ให้ตรงกับที่ nihon-tabi-api รันอยู่
npm run dev                          # http://localhost:3001 (ตั้ง port แยกจาก backend ที่ 3000)
```

ต้องรัน `nihon-tabi-api` (พร้อม Postgres) ควบคู่กันด้วย — ดู setup ที่ [`../nihon-tabi-api/README.md`](../nihon-tabi-api/README.md)

## ที่ยังไม่ทำ

- Polygon สีตามสถานะบนแผนที่ (รอ GADM GeoJSON)
- อัปโหลดรูป (`POST /visits/:id/photos` ฝั่ง backend รับแค่ URL ที่อัปโหลดไว้แล้ว ยังไม่มี UI อัปโหลดจริง)
- Refresh token ยังเก็บใน localStorage ธรรมดา (ไม่ใช่ httpOnly cookie) — เพียงพอสำหรับ MVP ส่วนตัว แต่ไม่ใช่ best practice สำหรับ production ทั่วไป
