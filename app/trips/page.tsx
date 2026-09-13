"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { geoFilesApi, visitsApi } from "@/lib/api";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { DotMapSvg, useDotGrid, type DotStatus, type LngLat } from "@/components/dot-map";

// Static placeholder — Trips (grouping visits into a journey) has no
// backend support yet (would need a new entity in the separate
// nihon-tabi-api repo). This page exists only so the nav's Trips tab has
// somewhere to land; the data below is illustrative, not real.
const SAMPLE_TRIP = {
  season: "Spring 2025",
  days: 9,
  title: "Kansai loop",
  cityCount: 7,
  photoCount: 41,
  km: 612,
  itinerary: [
    { day: 1, city: "Osaka", ja: "大阪市", note: "Landed, first taste of takoyaki in Dotonbori." },
    { day: 2, city: "Osaka", ja: "大阪市", note: "Osaka Castle, Shinsekai at night." },
    { day: 3, city: "Kyoto", ja: "京都市", note: "Fushimi Inari at 5am — empty gates all the way up." },
    { day: 4, city: "Kyoto", ja: "京都市", note: "Arashiyama, too many people." },
    { day: 5, city: "Nara", ja: "奈良市", note: "Deer park, Todai-ji." },
  ],
};

// Approximate real centroids for the sample itinerary's cities — the trip
// itself is illustrative, but the route it draws is a genuine path.
const ROUTE: LngLat[] = [
  [135.5, 34.69], // Osaka
  [135.77, 35.01], // Kyoto
  [135.83, 34.69], // Nara
  [135.2, 34.69], // Kobe
  [132.46, 34.39], // Hiroshima
];
const ROUTE_BOUNDS: [[number, number], [number, number]] = [
  [131.6, 33.6],
  [136.8, 36.1],
];

export default function TripsPage() {
  const { user, loading } = useRequireAuth();

  const visitsQuery = useQuery({
    queryKey: ["visits"],
    queryFn: () => visitsApi.list(),
    enabled: !!user,
  });
  const prefecturesGeoJSONQuery = useQuery({
    queryKey: ["geo-files", "prefectures"],
    queryFn: geoFilesApi.prefectures,
    enabled: !!user,
    staleTime: Infinity,
  });

  const classify = useMemo(() => {
    const visited = new Set(
      (visitsQuery.data ?? [])
        .filter((v) => v.status === "visited")
        .map((v) => v.municipality.prefectureId),
    );
    return (id: number): DotStatus => (visited.has(id) ? "visited" : "none");
  }, [visitsQuery.data]);

  const grid = useDotGrid({
    geojson: prefecturesGeoJSONQuery.data ?? null,
    bounds: ROUTE_BOUNDS,
    classify,
    cols: 36,
    rows: 28,
    viewSize: 320,
  });

  if (loading || !user) return null;

  return (
    <div className="flex h-[calc(100vh-57px)]">
      <div className="flex flex-1 flex-col overflow-y-auto px-10 py-8">
        <div
          className="mb-6 rounded-[var(--radius-md)] px-4 py-2 text-xs"
          style={{ background: "var(--plan-100)", color: "var(--plan-700)" }}
        >
          Preview — trips aren&apos;t saved yet. This page shows what grouping
          your visits into a journey could look like.
        </div>

        <div
          className="flex items-end justify-between border-b pb-[18px]"
          style={{ borderColor: "var(--divider)" }}
        >
          <div>
            <p className="mb-2.5 text-[10px] font-semibold tracking-[0.14em] text-neutral-500 uppercase">
              {SAMPLE_TRIP.season} · {SAMPLE_TRIP.days} days
            </p>
            <h1 className="text-[54px] leading-[0.9] font-black tracking-tight">{SAMPLE_TRIP.title}</h1>
          </div>
          <div className="flex gap-6 text-left">
            <div>
              <p className="text-[40px] leading-none font-extrabold">{SAMPLE_TRIP.cityCount}</p>
              <p className="mt-1.5 text-xs font-semibold tracking-wide text-neutral-500 uppercase">Cities</p>
            </div>
            <div>
              <p className="text-[40px] leading-none font-extrabold">{SAMPLE_TRIP.photoCount}</p>
              <p className="mt-1.5 text-xs font-semibold tracking-wide text-neutral-500 uppercase">Photos</p>
            </div>
            <div>
              <p className="text-[40px] leading-none font-extrabold">{SAMPLE_TRIP.km}</p>
              <p className="mt-1.5 text-xs font-semibold tracking-wide text-neutral-500 uppercase">km</p>
            </div>
          </div>
        </div>

        <ul className="mt-2">
          {SAMPLE_TRIP.itinerary.map((d) => (
            <li
              key={d.day}
              className="grid grid-cols-[78px_1fr_220px] items-center gap-6 border-b py-4"
              style={{ borderColor: "var(--neutral-300)" }}
            >
              <div>
                <p className="text-xs font-semibold text-neutral-500 uppercase">Day</p>
                <p className="mt-1 text-[28px] leading-none font-extrabold">{d.day}</p>
              </div>
              <div>
                <div className="flex items-baseline gap-2.5">
                  <span className="text-lg font-bold">{d.city}</span>
                  <span className="text-[13px] text-neutral-500">{d.ja}</span>
                </div>
                <p className="mt-1 text-[13px] text-neutral-600">{d.note}</p>
              </div>
              <div className="flex justify-start gap-0.5">
                <div className="h-[74px] w-[98px] rounded-[var(--radius-md)]" style={{ background: "var(--neutral-200)" }} />
                <div className="h-[74px] w-[98px] rounded-[var(--radius-md)]" style={{ background: "var(--neutral-200)" }} />
              </div>
            </li>
          ))}
        </ul>
      </div>

      <aside className="flex w-[400px] flex-none flex-col border-l" style={{ borderColor: "var(--divider)" }}>
        <div className="relative flex-1">
          {grid.dots.length > 0 && (
            <DotMapSvg
              dots={grid.dots}
              viewSize={320}
              cellSize={grid.cellSize}
              project={grid.project}
              boundary={grid.boundaryPath}
              route={ROUTE}
            />
          )}
        </div>
        <div className="flex gap-2 border-t p-5" style={{ borderColor: "var(--divider)" }}>
          <button
            type="button"
            disabled
            title="Trips aren't saved yet"
            className="flex-1 cursor-not-allowed rounded-[var(--radius-md)] px-4 py-2 text-sm font-semibold text-white opacity-60"
            style={{ background: "var(--accent)" }}
          >
            Export trip
          </button>
          <button
            type="button"
            disabled
            title="Trips aren't saved yet"
            className="flex-1 cursor-not-allowed rounded-[var(--radius-md)] border px-4 py-2 text-sm font-semibold opacity-60"
            style={{ borderColor: "var(--divider)" }}
          >
            Add a day
          </button>
        </div>
      </aside>
    </div>
  );
}
