"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { geoApi, geoFilesApi, statsApi, visitsApi } from "@/lib/api";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { DotMatrixSvg, useDotMatrix } from "@/components/coverage-dot-matrix";

export default function DashboardPage() {
  const { user, loading } = useRequireAuth();
  const statsQuery = useQuery({
    queryKey: ["stats"],
    queryFn: statsApi.me,
    enabled: !!user,
  });
  const visitsQuery = useQuery({
    queryKey: ["visits"],
    queryFn: () => visitsApi.list(),
    enabled: !!user,
  });
  const prefecturesQuery = useQuery({
    queryKey: ["prefectures"],
    queryFn: geoApi.prefectures,
    enabled: !!user,
  });
  const prefecturesGeoJSONQuery = useQuery({
    queryKey: ["geo-files", "prefectures"],
    queryFn: geoFilesApi.prefectures,
    enabled: !!user,
    staleTime: Infinity,
  });

  const visits = useMemo(() => visitsQuery.data ?? [], [visitsQuery.data]);

  const visitedPrefectureIds = useMemo(
    () =>
      Array.from(
        new Set(visits.filter((v) => v.status === "visited").map((v) => v.municipality.prefectureId)),
      ),
    [visits],
  );
  const wantPrefectureIds = useMemo(
    () =>
      Array.from(
        new Set(visits.filter((v) => v.status === "want_to_go").map((v) => v.municipality.prefectureId)),
      ),
    [visits],
  );
  const mixedPrefectureIds = useMemo(() => {
    const wantSet = new Set(wantPrefectureIds);
    return visitedPrefectureIds.filter((id) => wantSet.has(id));
  }, [visitedPrefectureIds, wantPrefectureIds]);

  const dots = useDotMatrix({
    prefecturesGeoJSON: prefecturesGeoJSONQuery.data ?? null,
    visitedPrefectureIds,
    wantPrefectureIds,
    mixedPrefectureIds,
  });

  // Real visit counts per calendar year, from the same data the Timeline
  // shows — not a fabricated series.
  const perYear = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of visits) {
      if (!v.visitedOn) continue;
      const year = v.visitedOn.slice(0, 4);
      counts.set(year, (counts.get(year) ?? 0) + 1);
    }
    const years = Array.from(counts.keys()).sort();
    const max = Math.max(1, ...counts.values());
    return years.map((year) => ({ year, count: counts.get(year)!, max }));
  }, [visits]);

  // The region whose most recent *visited* record is the oldest — i.e. the
  // longest since you've actually been back — plus how many prefectures in
  // that region have no record at all yet. Skipped entirely if nothing has
  // been visited yet (there's no "gap" to report).
  const longestGap = useMemo(() => {
    const lastVisitedByRegion = new Map<string, string>();
    for (const v of visits) {
      if (v.status !== "visited" || !v.visitedOn) continue;
      const region = v.municipality.prefecture.region;
      const current = lastVisitedByRegion.get(region);
      if (!current || v.visitedOn > current) lastVisitedByRegion.set(region, v.visitedOn);
    }
    if (lastVisitedByRegion.size === 0) return null;

    let region: string | null = null;
    let oldestDate: string | null = null;
    for (const [r, date] of lastVisitedByRegion) {
      if (!oldestDate || date < oldestDate) {
        region = r;
        oldestDate = date;
      }
    }
    if (!region || !oldestDate) return null;

    const years = new Date().getFullYear() - new Date(oldestDate).getUTCFullYear();
    const loggedPrefectureIds = new Set(visits.map((v) => v.municipality.prefectureId));
    const neverLogged = (prefecturesQuery.data ?? []).filter(
      (p) => p.region === region && !loggedPrefectureIds.has(p.id),
    );

    return { region, years, neverLoggedCount: neverLogged.length };
  }, [visits, prefecturesQuery.data]);

  if (loading || !user) return null;

  const stats = statsQuery.data;

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-extrabold tracking-tight">
        Your Japan travel stats
      </h1>

      {statsQuery.isLoading && <p>Loading...</p>}

      {stats && (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_280px]">
          <div>
            <div className="mb-8 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-[var(--radius-lg)] p-4 text-center" style={{ background: "var(--neutral-200)" }}>
                <p className="text-2xl font-extrabold">{stats.visitedCount}</p>
                <p className="text-sm text-neutral-500">Visited</p>
              </div>
              <div className="rounded-[var(--radius-lg)] p-4 text-center" style={{ background: "var(--neutral-200)" }}>
                <p className="text-2xl font-extrabold">{stats.wantToGoCount}</p>
                <p className="text-sm text-neutral-500">Want to go</p>
              </div>
              <div className="rounded-[var(--radius-lg)] p-4 text-center" style={{ background: "var(--neutral-200)" }}>
                <p className="text-2xl font-extrabold">{visitedPrefectureIds.length}</p>
                <p className="text-sm text-neutral-500">Prefectures</p>
              </div>
              <div className="rounded-[var(--radius-lg)] p-4 text-center text-white" style={{ background: "var(--accent)" }}>
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
              <div className="flex flex-col gap-8">
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
                        <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--neutral-200)" }}>
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

                {perYear.length > 0 && (
                  <div>
                    <h2 className="mb-3 text-sm font-semibold text-neutral-500">Records per year</h2>
                    <div className="flex h-28 items-end gap-3">
                      {perYear.map((y) => (
                        <div key={y.year} className="flex h-full flex-1 flex-col items-stretch justify-end">
                          <span className="mb-1.5 text-center text-xs font-semibold tabular-nums">
                            {y.count}
                          </span>
                          <span
                            className="block rounded-t-[var(--radius-sm)]"
                            style={{
                              background: "var(--accent)",
                              height: `${(y.count / y.max) * 100}%`,
                              minHeight: 4,
                            }}
                          />
                          <span className="mt-2 text-center text-xs text-neutral-500">{y.year}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-6">
            {dots.length > 0 && (
              <div
                className="rounded-[var(--radius-md)] p-4"
                style={{ background: "var(--surface)", border: "1px solid var(--divider)" }}
              >
                <div className="mb-3 text-[10px] font-semibold tracking-[0.14em] text-neutral-600 uppercase">
                  Coverage
                </div>
                <DotMatrixSvg dots={dots} size={200} />
              </div>
            )}

            {longestGap && (
              <div
                className="rounded-[var(--radius-md)] p-4"
                style={{ background: "var(--surface)", border: "1px solid var(--divider)" }}
              >
                <div className="mb-2 text-[10px] font-semibold tracking-[0.14em] text-neutral-600 uppercase">
                  Longest gap
                </div>
                <p className="text-lg font-extrabold">
                  {longestGap.region} — {longestGap.years} year{longestGap.years === 1 ? "" : "s"}
                </p>
                {longestGap.neverLoggedCount > 0 && (
                  <p className="mt-2 text-sm text-neutral-600">
                    {longestGap.neverLoggedCount} prefecture
                    {longestGap.neverLoggedCount === 1 ? "" : "s"} there{" "}
                    {longestGap.neverLoggedCount === 1 ? "has" : "have"} never been logged.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
