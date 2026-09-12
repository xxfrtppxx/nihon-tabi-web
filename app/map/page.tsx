"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { geoApi, geoFilesApi, visitsApi, type Municipality, type Visit } from "@/lib/api";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { placeName } from "@/lib/format";
import { VisitEditor } from "@/components/visit-editor";
import type { FlyToTarget } from "@/components/map-view";

const MapView = dynamic(
  () => import("@/components/map-view").then((mod) => mod.MapView),
  { ssr: false },
);

export default function MapPage() {
  const { user, loading } = useRequireAuth();
  const [prefectureId, setPrefectureId] = useState<number | null>(null);
  const [activeMunicipality, setActiveMunicipality] = useState<Municipality | null>(
    null,
  );

  const prefecturesQuery = useQuery({
    queryKey: ["prefectures"],
    queryFn: geoApi.prefectures,
    enabled: !!user,
  });

  const municipalitiesQuery = useQuery({
    queryKey: ["municipalities", prefectureId],
    queryFn: () => geoApi.municipalities(prefectureId!),
    enabled: !!user && prefectureId !== null,
  });

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

  const municipalitiesGeoJSONQuery = useQuery({
    queryKey: ["geo-files", "municipalities", prefectureId],
    queryFn: () => geoFilesApi.municipalities(prefectureId!),
    enabled: !!user && prefectureId !== null,
    staleTime: Infinity,
  });

  const visitByMunicipalityId = useMemo(() => {
    const map = new Map<number, Visit>();
    for (const visit of visitsQuery.data ?? []) {
      map.set(visit.municipalityId, visit);
    }
    return map;
  }, [visitsQuery.data]);

  const visitedMunicipalityIds = useMemo(
    () =>
      (visitsQuery.data ?? [])
        .filter((v) => v.status === "visited")
        .map((v) => v.municipalityId),
    [visitsQuery.data],
  );
  const wantMunicipalityIds = useMemo(
    () =>
      (visitsQuery.data ?? [])
        .filter((v) => v.status === "want_to_go")
        .map((v) => v.municipalityId),
    [visitsQuery.data],
  );
  const visitedPrefectureIds = useMemo(
    () =>
      Array.from(
        new Set(
          (visitsQuery.data ?? [])
            .filter((v) => v.status === "visited")
            .map((v) => v.municipality.prefectureId),
        ),
      ),
    [visitsQuery.data],
  );

  const prefecturesGeoJSONWithNames = useMemo(() => {
    const geojson = prefecturesGeoJSONQuery.data;
    if (!geojson || !prefecturesQuery.data) return null;
    const nameById = new Map(
      prefecturesQuery.data.map((p) => [p.id, placeName(p.nameEn, p.nameJa)]),
    );
    return {
      ...geojson,
      features: geojson.features.map((f) => ({
        ...f,
        properties: { ...f.properties, name: nameById.get(f.properties?.id) ?? "" },
      })),
    };
  }, [prefecturesGeoJSONQuery.data, prefecturesQuery.data]);

  const municipalitiesGeoJSONWithNames = useMemo(() => {
    const geojson = municipalitiesGeoJSONQuery.data;
    if (!geojson || !municipalitiesQuery.data) return null;
    const nameById = new Map(
      municipalitiesQuery.data.map((m) => [m.id, placeName(m.nameEn, m.nameJa)]),
    );
    return {
      ...geojson,
      features: geojson.features.map((f) => ({
        ...f,
        properties: { ...f.properties, name: nameById.get(f.properties?.id) ?? "" },
      })),
    };
  }, [municipalitiesGeoJSONQuery.data, municipalitiesQuery.data]);

  const selectedPrefecture = prefecturesQuery.data?.find((p) => p.id === prefectureId);
  const flyTo: FlyToTarget | null =
    selectedPrefecture?.centroidLat != null && selectedPrefecture?.centroidLng != null
      ? { lat: selectedPrefecture.centroidLat, lng: selectedPrefecture.centroidLng }
      : null;

  function handleMunicipalityPolygonClick(id: number) {
    const municipality = municipalitiesQuery.data?.find((m) => m.id === id);
    if (municipality) setActiveMunicipality(municipality);
  }

  if (loading || !user) return null;

  return (
    <div className="flex h-[calc(100vh-57px)]">
      <aside className="flex w-80 flex-col gap-4 overflow-y-auto border-r border-neutral-200 p-4 dark:border-neutral-800">
        <div>
          <h2 className="mb-2 text-sm font-semibold text-neutral-500">จังหวัด</h2>
          {prefecturesQuery.isLoading && <p className="text-sm">กำลังโหลด...</p>}
          {prefecturesQuery.data?.length === 0 && (
            <p className="text-sm text-neutral-500">
              ยังไม่มีข้อมูลจังหวัด (รอ seed ข้อมูลจาก GADM)
            </p>
          )}
          <ul className="flex flex-col gap-1">
            {prefecturesQuery.data?.map((pref) => (
              <li key={pref.id}>
                <button
                  onClick={() => setPrefectureId(pref.id)}
                  className={`w-full rounded px-3 py-1.5 text-left text-sm ${
                    prefectureId === pref.id
                      ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                      : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  }`}
                >
                  {placeName(pref.nameEn, pref.nameJa)}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {prefectureId !== null && (
          <div>
            <h2 className="mb-2 text-sm font-semibold text-neutral-500">เมือง/เขต</h2>
            {municipalitiesQuery.isLoading && <p className="text-sm">กำลังโหลด...</p>}
            <ul className="flex flex-col gap-1">
              {municipalitiesQuery.data?.map((m) => {
                const visit = visitByMunicipalityId.get(m.id);
                return (
                  <li key={m.id}>
                    <button
                      onClick={() => setActiveMunicipality(m)}
                      className="flex w-full items-center justify-between rounded px-3 py-1.5 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    >
                      <span>{placeName(m.nameEn, m.nameJa)}</span>
                      {visit && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            visit.status === "visited"
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
                              : "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
                          }`}
                        >
                          {visit.status === "visited" ? "ไปแล้ว" : "อยากไป"}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </aside>

      <main className="relative flex-1">
        <MapView
          flyTo={flyTo}
          prefecturesGeoJSON={prefecturesGeoJSONWithNames}
          municipalitiesGeoJSON={municipalitiesGeoJSONWithNames}
          visitedPrefectureIds={visitedPrefectureIds}
          visitedMunicipalityIds={visitedMunicipalityIds}
          wantMunicipalityIds={wantMunicipalityIds}
          selectedPrefectureId={prefectureId}
          onPrefectureClick={setPrefectureId}
          onMunicipalityClick={handleMunicipalityPolygonClick}
        />
      </main>

      {activeMunicipality && (
        <VisitEditor
          municipality={activeMunicipality}
          existingVisit={visitByMunicipalityId.get(activeMunicipality.id)}
          onClose={() => setActiveMunicipality(null)}
        />
      )}
    </div>
  );
}
