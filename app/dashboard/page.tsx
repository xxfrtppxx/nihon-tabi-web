"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { geoApi, geoFilesApi, statsApi, visitsApi } from "@/lib/api";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { DotMapFill, type DotStatus } from "@/components/dot-map";

// See app/map/page.tsx's COUNTRY_DOT_BOUNDS for why this excludes the
// prefecture data's true (Minami-Torishima-stretched) bbox.
const COUNTRY_DOT_BOUNDS: [[number, number], [number, number]] = [
  [122.7, 24.0],
  [148.9, 45.7],
];

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

  const classify = useMemo(() => {
    const visited = new Set(visitedPrefectureIds);
    const want = new Set(wantPrefectureIds);
    const mixed = new Set(mixedPrefectureIds);
    return (id: number): DotStatus =>
      mixed.has(id) ? "mixed" : visited.has(id) ? "visited" : want.has(id) ? "want_to_go" : "none";
  }, [visitedPrefectureIds, wantPrefectureIds, mixedPrefectureIds]);

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
    <div className="flex h-[calc(100vh-57px)]" style={{ background: "var(--background)" }}>
      {statsQuery.isLoading && (
        <p className="p-8">Loading...</p>
      )}

      {stats && (
        <>
          <div
            className="flex flex-[2] flex-col border-r"
            style={{ borderColor: "var(--divider)" }}
          >
            <div
              className="grid flex-none grid-cols-4 border-b"
              style={{ borderColor: "var(--divider)" }}
            >
              <div className="border-r px-6 py-6" style={{ borderColor: "var(--neutral-300)" }}>
                <p className="text-[40px] leading-[0.86] font-extrabold tracking-tight tabular-nums">
                  {stats.visitedCount}
                </p>
                <p className="mt-2.5 text-[11px] font-semibold tracking-wide text-neutral-600 uppercase">
                  Visited
                </p>
              </div>
              <div className="border-r px-6 py-6" style={{ borderColor: "var(--neutral-300)" }}>
                <p className="text-[40px] leading-[0.86] font-extrabold tracking-tight tabular-nums">
                  {stats.wantToGoCount}
                </p>
                <p className="mt-2.5 text-[11px] font-semibold tracking-wide text-neutral-600 uppercase">
                  Want to go
                </p>
              </div>
              <div className="border-r px-6 py-6" style={{ borderColor: "var(--neutral-300)" }}>
                <p className="text-[40px] leading-[0.86] font-extrabold tracking-tight tabular-nums">
                  {visitedPrefectureIds.length}
                </p>
                <p className="mt-2.5 text-[11px] font-semibold tracking-wide text-neutral-600 uppercase">
                  Prefectures
                </p>
              </div>
              <div className="px-6 py-6 text-white" style={{ background: "var(--accent)" }}>
                <p className="text-[40px] leading-[0.86] font-extrabold tracking-tight tabular-nums">
                  {stats.percentageVisited}%
                </p>
                <p className="mt-2.5 text-[11px] font-semibold tracking-wide uppercase">
                  Of all Japan
                </p>
              </div>
            </div>

            {stats.totalMunicipalities === 0 ? (
              <p className="p-6 text-neutral-500">
                No municipality data yet (waiting on the GADM seed). Stats will be
                fully available after that.
              </p>
            ) : (
              <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-6">
                <div>
                  <div className="mb-3.5 text-[10px] font-semibold tracking-[0.14em] text-neutral-600 uppercase">
                    By region
                  </div>
                  <ul className="flex flex-col">
                    {stats.byRegion.map((r) => (
                      <li
                        key={r.region}
                        className="grid grid-cols-[150px_1fr_84px] items-center gap-4 border-b py-2"
                        style={{ borderColor: "var(--neutral-300)" }}
                      >
                        <span className="text-[13px] font-semibold">{r.region}</span>
                        <span className="block h-3.5 overflow-hidden rounded-full" style={{ background: "var(--neutral-200)" }}>
                          <span
                            className="block h-3.5 rounded-full"
                            style={{
                              background: "var(--accent)",
                              width: `${r.total > 0 ? (r.visited / r.total) * 100 : 0}%`,
                            }}
                          />
                        </span>
                        <span className="text-right text-xs font-medium tabular-nums text-neutral-600">
                          {r.visited}/{r.total}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {perYear.length > 0 && (
                  <div>
                    <div className="mb-3.5 text-[10px] font-semibold tracking-[0.14em] text-neutral-600 uppercase">
                      Records per year
                    </div>
                    <div className="flex h-28 items-end gap-3">
                      {perYear.map((y) => (
                        <div key={y.year} className="flex h-full flex-1 flex-col items-stretch justify-end">
                          <span className="mb-1.5 text-center text-xs font-semibold tabular-nums">
                            {y.count}
                          </span>
                          <span
                            className="block"
                            style={{
                              background: "var(--accent)",
                              height: `${(y.count / y.max) * 100}%`,
                              minHeight: 4,
                            }}
                          />
                          <span className="mt-2 text-center text-xs font-semibold tracking-wide text-neutral-600 uppercase">
                            {y.year}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex w-[420px] flex-none flex-col">
            <div className="relative flex-1 border-b" style={{ borderColor: "var(--divider)" }}>
              <DotMapFill
                className="absolute inset-0"
                geojson={prefecturesGeoJSONQuery.data ?? null}
                bounds={COUNTRY_DOT_BOUNDS}
                classify={classify}
                cols={50}
                rows={50}
              />
            </div>
            {longestGap && (
              <div className="p-6">
                <div className="mb-3 text-[10px] font-semibold tracking-[0.14em] text-neutral-600 uppercase">
                  Longest gap
                </div>
                <p className="text-[22px] leading-[1.1] font-extrabold">
                  {longestGap.region} — {longestGap.years} year{longestGap.years === 1 ? "" : "s"}
                </p>
                {longestGap.neverLoggedCount > 0 && (
                  <p className="mt-2.5 text-sm text-neutral-600">
                    {longestGap.neverLoggedCount} prefecture
                    {longestGap.neverLoggedCount === 1 ? "" : "s"} there{" "}
                    {longestGap.neverLoggedCount === 1 ? "has" : "have"} never been logged.
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
