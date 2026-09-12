# nihon-tabi-web

Web app (Next.js) สำหรับบันทึกการท่องเที่ยวญี่ปุ่น — ใช้ backend และ API เดียวกับ Android (ดู [`../SYSTEM_DESIGN.md`](../SYSTEM_DESIGN.md))

## Stack

- Next.js (App Router) + TypeScript
- MapLibre GL JS + react-map-gl — render แผนที่ + polygon จังหวัด/เมือง (library เดียวกับฝั่ง Android เพื่อให้ behavior ตรงกัน)
- Tailwind CSS
- TanStack Query — data fetching/cache จาก `nihon-tabi-api`
- Auth: เก็บ access token ใน memory, refresh token ใน httpOnly cookie

## โครงสร้างโฟลเดอร์ (แผน)

```
app/
  (auth)/login/            -- หน้า login/register
  (main)/map/               -- หน้าแผนที่หลัก
  (main)/visits/             -- รายการที่ไปแล้ว + filter
  (main)/dashboard/           -- สถิติ % ที่ไปแล้ว
  (main)/profile/              -- profile/settings
components/
  map/                         -- JapanMap, PrefectureLayer, MunicipalityLayer, VisitBottomSheet
  ui/                           -- component ทั่วไป (button, card, ฯลฯ)
lib/
  api/                          -- client เรียก nihon-tabi-api (fetch wrapper + endpoint functions)
  auth/                         -- token handling, auth context
```

## Flow หลัก

เหมือนฝั่ง Android: โหลด prefecture GeoJSON ทั้งประเทศก่อน → ซูมเข้าจังหวัด → fetch municipality GeoJSON ของจังหวัดนั้นจาก API → แตะเมืองเปิด modal/bottom sheet เพื่อ mark visited/want_to_go พร้อมวันที่/โน้ต/รูป/rating

## Setup (ยังไม่ได้เริ่ม)

```bash
npx create-next-app@latest . --typescript --tailwind --app
npm install maplibre-gl react-map-gl @tanstack/react-query
```
