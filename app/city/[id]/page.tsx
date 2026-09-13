"use client";

import { use, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { geoApi, geoFilesApi, visitsApi, type Municipality } from "@/lib/api";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { placeName, formatDate } from "@/lib/format";
import { boundsOfFeatureCollection, haversineKm } from "@/lib/geo";
import { VisitEditor } from "@/components/visit-editor";
import { DotMapSvg, geometryToPath, useDotGrid, type DotStatus } from "@/components/dot-map";

export default function CityDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ prefectureId?: string }>;
}) {
  const { id } = use(params);
  const { prefectureId: prefectureIdParam } = use(searchParams);
  const municipalityId = Number(id);

  const { user, loading } = useRequireAuth();
  const [addingRecord, setAddingRecord] = useState(false);

  const visitsQuery = useQuery({
    queryKey: ["visits"],
    queryFn: () => visitsApi.list(),
    enabled: !!user,
  });

  const cityVisits = useMemo(
    () => (visitsQuery.data ?? []).filter((v) => v.municipalityId === municipalityId),
    [visitsQuery.data, municipalityId],
  );

  // A visit already carries its municipality (and prefecture) embedded, so
  // a city with at least one record needs no extra lookup at all — the
  // `?prefectureId=` query param (set by the Atlas's "Open city" link) only
  // matters for a city with zero records yet.
  const prefectureId = cityVisits[0]?.municipality.prefectureId ?? Number(prefectureIdParam);

  const municipalitiesQuery = useQuery({
    queryKey: ["municipalities", prefectureId],
    queryFn: () => geoApi.municipalities(prefectureId),
    enabled: !!user && Number.isFinite(prefectureId),
  });
  const prefecturesQuery = useQuery({
    queryKey: ["prefectures"],
    queryFn: geoApi.prefectures,
    enabled: !!user,
  });
  const municipalitiesGeoJSONQuery = useQuery({
    queryKey: ["geo-files", "municipalities", prefectureId],
    queryFn: () => geoFilesApi.municipalities(prefectureId),
    enabled: !!user && Number.isFinite(prefectureId),
    staleTime: Infinity,
  });

  const municipality: Municipality | undefined =
    municipalitiesQuery.data?.find((m) => m.id === municipalityId) ?? cityVisits[0]?.municipality;
  const prefecture = prefecturesQuery.data?.find((p) => p.id === prefectureId);

  const photos = useMemo(() => cityVisits.flatMap((v) => v.photos), [cityVisits]);
  const avgRating = useMemo(() => {
    const rated = cityVisits.filter((v) => v.rating);
    if (rated.length === 0) return null;
    return (rated.reduce((sum, v) => sum + (v.rating ?? 0), 0) / rated.length).toFixed(1);
  }, [cityVisits]);

  // Same prefecture, no record of any kind yet, nearest first — mirrors the
  // suggestion ranking already used in the quick-log modal.
  const nearby = useMemo(() => {
    if (!municipality || municipality.centroidLat === null || municipality.centroidLng === null) return [];
    const visitedIds = new Set((visitsQuery.data ?? []).map((v) => v.municipalityId));
    const origin = { lat: municipality.centroidLat, lng: municipality.centroidLng };
    return (municipalitiesQuery.data ?? [])
      .filter(
        (m): m is Municipality & { centroidLat: number; centroidLng: number } =>
          m.id !== municipality.id && !visitedIds.has(m.id) && m.centroidLat !== null && m.centroidLng !== null,
      )
      .map((m) => ({ m, km: haversineKm(origin, { lat: m.centroidLat, lng: m.centroidLng }) }))
      .sort((a, b) => a.km - b.km)
      .slice(0, 4);
  }, [municipality, municipalitiesQuery.data, visitsQuery.data]);

  const classify = useMemo(() => {
    const visited = new Set(
      (visitsQuery.data ?? []).filter((v) => v.status === "visited").map((v) => v.municipalityId),
    );
    const want = new Set(
      (visitsQuery.data ?? []).filter((v) => v.status === "want_to_go").map((v) => v.municipalityId),
    );
    return (mId: number): DotStatus =>
      visited.has(mId) && want.has(mId) ? "mixed" : visited.has(mId) ? "visited" : want.has(mId) ? "want_to_go" : "none";
  }, [visitsQuery.data]);
  const bounds = useMemo(
    () => (municipalitiesGeoJSONQuery.data ? boundsOfFeatureCollection(municipalitiesGeoJSONQuery.data) : null),
    [municipalitiesGeoJSONQuery.data],
  );
  const grid = useDotGrid({
    geojson: municipalitiesGeoJSONQuery.data ?? null,
    bounds,
    classify,
    cols: 40,
    rows: 40,
    viewSize: 320,
  });

  // This city's own real polygon, so the sidebar map traces its exact
  // shape instead of marking a generic square at its centroid.
  const highlightPath = useMemo(() => {
    const geometry = municipalitiesGeoJSONQuery.data?.features.find(
      (f) => f.properties?.id === municipalityId,
    )?.geometry;
    return geometry ? geometryToPath(geometry, grid.project) : undefined;
  }, [municipalitiesGeoJSONQuery.data, municipalityId, grid.project]);

  if (loading || !user) return null;

  if (!municipality) {
    return (
      <main className="p-8">
        <p className="text-neutral-500">
          {municipalitiesQuery.isLoading ? "Loading..." : "City not found."}
        </p>
      </main>
    );
  }

  const heroPhoto = photos[0];

  return (
    <div className="flex h-[calc(100vh-57px)]">
      <div className="flex flex-1 flex-col overflow-y-auto">
        <div className="relative h-[252px] flex-none border-b" style={{ borderColor: "var(--divider)" }}>
          {heroPhoto ? (
            <Image src={heroPhoto.url} alt="" fill sizes="1000px" className="object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center" style={{ background: "var(--neutral-200)" }}>
              <span className="text-sm text-neutral-500">No photos yet</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => setAddingRecord(true)}
            className="absolute top-4 right-4 h-10 rounded-full px-5 text-sm font-semibold text-white"
            style={{ background: "var(--accent)" }}
          >
            Add record
          </button>
        </div>

        <div className="flex flex-col gap-5 px-10 py-6">
          <div
            className="flex items-end justify-between gap-6 border-b pb-[18px]"
            style={{ borderColor: "var(--divider)" }}
          >
            <div>
              <div className="mb-2.5 text-[10px] font-semibold tracking-[0.14em] text-neutral-600 uppercase">
                {prefecture ? `${placeName(prefecture.nameEn, prefecture.nameJa)} · ${prefecture.region}` : ""}
              </div>
              <h1 className="text-[52px] leading-[0.9] font-black tracking-tight">
                {municipality.nameEn}
                <span className="ml-3.5 text-2xl font-medium tracking-normal text-neutral-600">
                  {municipality.nameJa}
                </span>
              </h1>
            </div>
            <div className="flex gap-0.5 text-left">
              <div className="rounded-[var(--radius-md)] px-4 py-3.5 text-white" style={{ background: "var(--accent)" }}>
                <div className="text-[32px] leading-none font-extrabold tabular-nums">{cityVisits.length}</div>
                <div className="mt-1.5 text-[11px] font-semibold uppercase">Visits</div>
              </div>
              <div className="rounded-[var(--radius-md)] px-4 py-3.5" style={{ background: "var(--neutral-200)" }}>
                <div className="text-[32px] leading-none font-extrabold tabular-nums">{photos.length}</div>
                <div className="mt-1.5 text-[11px] font-semibold text-neutral-600 uppercase">Photos</div>
              </div>
              <div className="rounded-[var(--radius-md)] px-4 py-3.5" style={{ background: "var(--neutral-200)" }}>
                <div className="text-[32px] leading-none font-extrabold tabular-nums">{avgRating ?? "—"}</div>
                <div className="mt-1.5 text-[11px] font-semibold text-neutral-600 uppercase">Avg</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-7">
            <div>
              <div className="mb-3 text-[10px] font-semibold tracking-[0.14em] text-neutral-600 uppercase">
                Records
              </div>
              {cityVisits.length === 0 && (
                <p className="text-sm text-neutral-500">No records yet for this city.</p>
              )}
              <ul className="flex flex-col">
                {cityVisits.map((v) => (
                  <li
                    key={v.id}
                    className="flex items-center justify-between gap-3 border-b py-2.5"
                    style={{ borderColor: "var(--neutral-300)" }}
                  >
                    <div>
                      <div className="text-sm font-semibold">
                        {v.visitedOn ? formatDate(v.visitedOn) : "Undated"} ·{" "}
                        {v.status === "visited" ? "Visited" : "Want to go"}
                      </div>
                      {v.note && (
                        <div className="mt-0.5 text-[13px] text-neutral-600">{v.note}</div>
                      )}
                    </div>
                    {v.rating ? (
                      <span className="flex-none" style={{ color: "var(--accent)" }}>
                        {"★".repeat(v.rating)}
                      </span>
                    ) : v.status === "want_to_go" ? (
                      <span className="flex-none text-xs font-semibold tracking-wide text-neutral-600 uppercase">
                        Planned
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="mb-3 text-[10px] font-semibold tracking-[0.14em] text-neutral-600 uppercase">
                All photographs
              </div>
              {photos.length === 0 ? (
                <p className="text-sm text-neutral-500">No photos yet.</p>
              ) : (
                <div className="grid grid-cols-4 gap-0.5">
                  {photos.slice(0, 3).map((photo) => (
                    <div key={photo.id} className="relative aspect-square overflow-hidden rounded-[var(--radius-sm)]">
                      <Image src={photo.url} alt="" fill sizes="150px" className="object-cover" />
                    </div>
                  ))}
                  {photos.length > 3 && (
                    <div
                      className="flex aspect-square items-center justify-center rounded-[var(--radius-sm)]"
                      style={{ background: "var(--neutral-200)" }}
                    >
                      <span className="text-xs font-semibold text-neutral-600 uppercase">
                        +{photos.length - 3}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <aside className="flex w-[320px] flex-none flex-col border-l" style={{ borderColor: "var(--divider)" }}>
        <div className="relative h-[300px] flex-none border-b" style={{ borderColor: "var(--divider)" }}>
          {grid.dots.length > 0 && (
            <DotMapSvg
              dots={grid.dots}
              viewSize={320}
              cellSize={grid.cellSize}
              project={grid.project}
              boundary={grid.boundaryPath}
              highlight={highlightPath}
            />
          )}
        </div>
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-5">
          <div className="text-[10px] font-semibold tracking-[0.14em] text-neutral-600 uppercase">
            Nearby, not yet visited
          </div>
          {nearby.length === 0 && <p className="text-sm text-neutral-500">Nothing nearby left to log.</p>}
          {nearby.map(({ m, km }) => (
            <Link
              key={m.id}
              href={`/city/${m.id}?prefectureId=${prefectureId}`}
              className="flex items-center justify-between gap-2 border-b py-2.5 text-sm"
              style={{ borderColor: "var(--neutral-300)" }}
            >
              <span className="font-semibold">{placeName(m.nameEn, m.nameJa)}</span>
              <span className="text-xs font-medium text-neutral-600">{Math.round(km)} km</span>
            </Link>
          ))}
        </div>
      </aside>

      {addingRecord && (
        <VisitEditor
          initialMunicipality={municipality}
          visits={cityVisits}
          mode="new"
          onClose={() => setAddingRecord(false)}
        />
      )}
    </div>
  );
}
