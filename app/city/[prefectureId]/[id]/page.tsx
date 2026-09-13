"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { geoApi, geoFilesApi, visitsApi, type Municipality } from "@/lib/api";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { formatDate, placeName } from "@/lib/format";
import { boundsOfGeometry, geometryToSvgPath, haversineKm } from "@/lib/geo";
import { VisitEditor } from "@/components/visit-editor";

export default function CityDetailPage() {
  const { user, loading } = useRequireAuth();
  const params = useParams<{ prefectureId: string; id: string }>();
  const prefectureId = Number(params.prefectureId);
  const municipalityId = Number(params.id);
  const [showEditor, setShowEditor] = useState(false);

  const prefecturesQuery = useQuery({ queryKey: ["prefectures"], queryFn: geoApi.prefectures, enabled: !!user });
  const municipalitiesQuery = useQuery({
    queryKey: ["municipalities", prefectureId],
    queryFn: () => geoApi.municipalities(prefectureId),
    enabled: !!user && Number.isFinite(prefectureId),
  });
  const municipalitiesGeoJSONQuery = useQuery({
    queryKey: ["geo-files", "municipalities", prefectureId],
    queryFn: () => geoFilesApi.municipalities(prefectureId),
    enabled: !!user && Number.isFinite(prefectureId),
    staleTime: Infinity,
  });
  // All visits, not just this city's — needed to know which OTHER
  // municipalities in the prefecture already have a visited record, so
  // "Nearby, not yet visited" can exclude them.
  const visitsQuery = useQuery({ queryKey: ["visits"], queryFn: () => visitsApi.list(), enabled: !!user });

  const prefecture = prefecturesQuery.data?.find((p) => p.id === prefectureId);
  const municipality = municipalitiesQuery.data?.find((m) => m.id === municipalityId);
  const geometry = municipalitiesGeoJSONQuery.data?.features.find(
    (f) => f.properties?.id === municipalityId,
  )?.geometry;

  const cityVisits = useMemo(
    () =>
      (visitsQuery.data ?? [])
        .filter((v) => v.municipalityId === municipalityId)
        .sort((a, b) => (b.visitedOn ?? "").localeCompare(a.visitedOn ?? "")),
    [visitsQuery.data, municipalityId],
  );

  const stats = useMemo(() => {
    const visitedRecords = cityVisits.filter((v) => v.status === "visited");
    const photos = cityVisits.flatMap((v) => v.photos);
    const ratings = cityVisits.map((v) => v.rating).filter((r): r is number => r != null);
    const avg = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
    return { visitsCount: visitedRecords.length, photos, avg };
  }, [cityVisits]);

  const heroPhotoUrl = stats.photos[0]?.url ?? null;

  const nearbyNotYetVisited = useMemo(() => {
    if (!municipality || municipality.centroidLat === null || municipality.centroidLng === null) {
      return [];
    }
    const visitedElsewhereIds = new Set(
      (visitsQuery.data ?? []).filter((v) => v.status === "visited").map((v) => v.municipalityId),
    );
    const origin = { lat: municipality.centroidLat, lng: municipality.centroidLng };
    return (municipalitiesQuery.data ?? [])
      .filter(
        (m): m is Municipality & { centroidLat: number; centroidLng: number } =>
          m.id !== municipalityId &&
          !visitedElsewhereIds.has(m.id) &&
          m.centroidLat !== null &&
          m.centroidLng !== null,
      )
      .map((m) => ({ m, km: haversineKm(origin, { lat: m.centroidLat, lng: m.centroidLng }) }))
      .sort((a, b) => a.km - b.km)
      .slice(0, 4);
  }, [municipality, municipalitiesQuery.data, visitsQuery.data, municipalityId]);

  const cityShape = useMemo(() => {
    if (!geometry) return null;
    const bounds = boundsOfGeometry(geometry);
    if (!bounds) return null;
    return geometryToSvgPath(geometry, bounds, 200);
  }, [geometry]);

  if (loading || !user) return null;
  if (!municipality || !prefecture) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-8">
        <Link href="/map" className="text-sm hover:underline" style={{ color: "var(--accent)" }}>
          ← Back to Atlas
        </Link>
        <p className="mt-4 text-neutral-500">Loading city…</p>
      </main>
    );
  }

  return (
    <div className="flex h-[calc(100vh-57px)]">
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div
          className="relative h-[252px] flex-none border-b"
          style={{ borderColor: "var(--divider)", background: "var(--neutral-200)" }}
        >
          {heroPhotoUrl && (
            <Image src={heroPhotoUrl} alt="" fill sizes="800px" className="object-cover" />
          )}
        </div>

        <div className="flex flex-col gap-5 px-6 py-6 sm:px-10">
          <div
            className="flex flex-wrap items-end justify-between gap-6 border-b pb-4"
            style={{ borderColor: "var(--divider)" }}
          >
            <div>
              <Link href="/map" className="text-sm hover:underline" style={{ color: "var(--accent)" }}>
                ← Atlas
              </Link>
              <div className="mt-2 text-xs font-semibold tracking-[0.14em] text-neutral-600 uppercase">
                {placeName(prefecture.nameEn, prefecture.nameJa)} · {prefecture.region}
              </div>
              <h1 className="mt-1 text-5xl font-black tracking-tight">
                {municipality.nameEn}
                <span className="ml-3 text-2xl font-normal tracking-normal text-neutral-600">
                  {municipality.nameJa}
                </span>
              </h1>
            </div>
            <div className="flex gap-0.5">
              <div className="rounded-[var(--radius-md)] px-4 py-3 text-white" style={{ background: "var(--accent)" }}>
                <div className="text-3xl font-extrabold tabular-nums">{stats.visitsCount}</div>
                <div className="mt-1 text-xs font-semibold uppercase">Visits</div>
              </div>
              <div className="rounded-[var(--radius-md)] px-4 py-3" style={{ background: "var(--neutral-200)" }}>
                <div className="text-3xl font-extrabold tabular-nums">{stats.photos.length}</div>
                <div className="mt-1 text-xs font-semibold text-neutral-600 uppercase">Photos</div>
              </div>
              <div className="rounded-[var(--radius-md)] px-4 py-3" style={{ background: "var(--neutral-200)" }}>
                <div className="text-3xl font-extrabold tabular-nums">
                  {stats.avg !== null ? stats.avg.toFixed(1) : "—"}
                </div>
                <div className="mt-1 text-xs font-semibold text-neutral-600 uppercase">Avg</div>
              </div>
              <button
                type="button"
                onClick={() => setShowEditor(true)}
                className="ml-2 self-center rounded-[var(--radius-md)] px-4 py-2.5 text-sm font-semibold text-white"
                style={{ background: "var(--accent)" }}
              >
                Add record
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-7 md:grid-cols-2">
            <div>
              <h2 className="mb-3 text-xs font-semibold tracking-[0.14em] text-neutral-600 uppercase">
                Records
              </h2>
              {cityVisits.length === 0 ? (
                <p className="text-sm text-neutral-500">No records yet for this city.</p>
              ) : (
                <ul>
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
                        {v.note && <div className="mt-0.5 text-sm text-neutral-600">{v.note}</div>}
                      </div>
                      {v.status === "visited" && v.rating ? (
                        <span className="flex-none" style={{ color: "var(--accent)" }}>
                          {"★".repeat(v.rating)}
                        </span>
                      ) : v.status === "want_to_go" ? (
                        <span className="flex-none text-xs font-semibold text-neutral-600 uppercase">
                          Planned
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h2 className="mb-3 text-xs font-semibold tracking-[0.14em] text-neutral-600 uppercase">
                All photographs
              </h2>
              {stats.photos.length === 0 ? (
                <p className="text-sm text-neutral-500">No photos yet.</p>
              ) : (
                <div className="grid grid-cols-4 gap-0.5">
                  {stats.photos.slice(0, 3).map((photo) => (
                    <div
                      key={photo.id}
                      className="relative aspect-square overflow-hidden rounded-[var(--radius-sm)]"
                      style={{ background: "var(--neutral-200)" }}
                    >
                      <Image src={photo.url} alt="" fill sizes="150px" className="object-cover" />
                    </div>
                  ))}
                  {stats.photos.length > 3 && (
                    <div
                      className="flex aspect-square items-center justify-center rounded-[var(--radius-sm)] text-xs font-semibold text-neutral-600"
                      style={{ background: "var(--neutral-200)" }}
                    >
                      +{stats.photos.length - 3}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <aside
        className="flex w-[320px] flex-none flex-col border-l"
        style={{ borderColor: "var(--divider)" }}
      >
        <div
          className="flex h-[300px] flex-none items-center justify-center border-b"
          style={{ borderColor: "var(--divider)", background: "var(--neutral-200)" }}
        >
          {cityShape && (
            <svg viewBox="0 0 200 200" width={180} height={180}>
              <path d={cityShape} fill="var(--accent)" fillRule="evenodd" opacity={0.85} />
            </svg>
          )}
        </div>
        <div className="p-5">
          <h2 className="mb-3 text-xs font-semibold tracking-[0.14em] text-neutral-600 uppercase">
            Nearby, not yet visited
          </h2>
          {nearbyNotYetVisited.length === 0 ? (
            <p className="text-sm text-neutral-500">Nothing nearby left to log.</p>
          ) : (
            <ul>
              {nearbyNotYetVisited.map(({ m, km }) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-2 border-b py-2"
                  style={{ borderColor: "var(--neutral-300)" }}
                >
                  <Link
                    href={`/city/${prefectureId}/${m.id}`}
                    className="text-sm font-semibold hover:underline"
                  >
                    {m.nameEn} {m.nameJa}
                  </Link>
                  <span className="flex-none text-xs text-neutral-600">{Math.round(km)} km</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {showEditor && (
        <VisitEditor
          initialMunicipality={municipality}
          visits={cityVisits}
          mode={cityVisits.length > 0 ? "list" : "new"}
          onClose={() => setShowEditor(false)}
        />
      )}
    </div>
  );
}
