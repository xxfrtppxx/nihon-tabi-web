"use client";

import { useQuery } from "@tanstack/react-query";
import { statsApi } from "@/lib/api";
import { useRequireAuth } from "@/hooks/use-require-auth";

export default function DashboardPage() {
  const { user, loading } = useRequireAuth();
  const statsQuery = useQuery({
    queryKey: ["stats"],
    queryFn: statsApi.me,
    enabled: !!user,
  });

  if (loading || !user) return null;

  const stats = statsQuery.data;

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-bold">สถิติการเที่ยวญี่ปุ่น</h1>

      {statsQuery.isLoading && <p>กำลังโหลด...</p>}

      {stats && (
        <>
          <div className="mb-8 grid grid-cols-3 gap-4">
            <div className="rounded-lg border border-neutral-200 p-4 text-center dark:border-neutral-800">
              <p className="text-2xl font-bold">{stats.visitedCount}</p>
              <p className="text-sm text-neutral-500">ไปแล้ว</p>
            </div>
            <div className="rounded-lg border border-neutral-200 p-4 text-center dark:border-neutral-800">
              <p className="text-2xl font-bold">{stats.wantToGoCount}</p>
              <p className="text-sm text-neutral-500">อยากไป</p>
            </div>
            <div className="rounded-lg border border-neutral-200 p-4 text-center dark:border-neutral-800">
              <p className="text-2xl font-bold">{stats.percentageVisited}%</p>
              <p className="text-sm text-neutral-500">ของทั้งหมด</p>
            </div>
          </div>

          {stats.totalMunicipalities === 0 ? (
            <p className="text-neutral-500">
              ยังไม่มีข้อมูลเมือง/เขตในระบบ (รอ seed ข้อมูลจาก GADM) สถิติจะคำนวณได้เต็มรูปแบบหลังจากนั้น
            </p>
          ) : (
            <div>
              <h2 className="mb-3 text-sm font-semibold text-neutral-500">แยกตามภูมิภาค</h2>
              <ul className="flex flex-col gap-2">
                {stats.byRegion.map((r) => (
                  <li key={r.region}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span>{r.region}</span>
                      <span className="tabular-nums">
                        {r.visited}/{r.total}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{
                          width: `${r.total > 0 ? (r.visited / r.total) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </main>
  );
}
