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
      <h1 className="mb-6 text-2xl font-extrabold tracking-tight">
        Your Japan travel stats
      </h1>

      {statsQuery.isLoading && <p>Loading...</p>}

      {stats && (
        <>
          <div className="mb-8 grid grid-cols-3 gap-2">
            <div
              className="rounded-[var(--radius-lg)] p-4 text-center"
              style={{ background: "var(--neutral-200)" }}
            >
              <p className="text-2xl font-extrabold">{stats.visitedCount}</p>
              <p className="text-sm text-neutral-500">Visited</p>
            </div>
            <div
              className="rounded-[var(--radius-lg)] p-4 text-center"
              style={{ background: "var(--neutral-200)" }}
            >
              <p className="text-2xl font-extrabold">{stats.wantToGoCount}</p>
              <p className="text-sm text-neutral-500">Want to go</p>
            </div>
            <div
              className="rounded-[var(--radius-lg)] p-4 text-center text-white"
              style={{ background: "var(--accent)" }}
            >
              <p className="text-2xl font-extrabold">{stats.percentageVisited}%</p>
              <p className="text-sm opacity-90">of all Japan</p>
            </div>
          </div>

          {stats.totalMunicipalities === 0 ? (
            <p className="text-neutral-500">
              No municipality data yet (waiting on the GADM seed). Stats will be
              fully available after that.
            </p>
          ) : (
            <div>
              <h2 className="mb-3 text-sm font-semibold text-neutral-500">By region</h2>
              <ul className="flex flex-col gap-2">
                {stats.byRegion.map((r) => (
                  <li key={r.region}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span>{r.region}</span>
                      <span className="tabular-nums">
                        {r.visited}/{r.total}
                      </span>
                    </div>
                    <div
                      className="h-2 overflow-hidden rounded-full"
                      style={{ background: "var(--neutral-200)" }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          background: "var(--accent)",
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
