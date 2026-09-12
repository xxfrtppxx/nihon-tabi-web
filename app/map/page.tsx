"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useQueries, useQuery } from "@tanstack/react-query";
import { geoApi, geoFilesApi, visitsApi, type Municipality, type Visit } from "@/lib/api";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { placeName } from "@/lib/format";
import { boundsOfFeatureCollection, type LngLatBounds } from "@/lib/geo";
import { VisitEditor } from "@/components/visit-editor";

const MapView = dynamic(
  () => import("@/components/map-view").then((mod) => mod.MapView),
  { ssr: false },
);

function matchesSearch(nameEn: string, nameJa: string, query: string) {
  const q = query.trim();
  if (!q) return true;
  return nameEn.toLowerCase().includes(q.toLowerCase()) || nameJa.includes(q);
}

export default function MapPage() {
  const { user, loading } = useRequireAuth();
  const [prefectureId, setPrefectureId] = useState<number | null>(null);
  const [selectedMunicipality, setSelectedMunicipality] = useState<Municipality | null>(
    null,
  );
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [viewportPrefectureIds, setViewportPrefectureIds] = useState<number[]>([]);

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

  // Zoomed into the country view without picking a prefecture yet: load
  // municipality data for whatever prefectures are currently on screen, so
  // the map can show more detail the way an ordinary map would.
  const previewEnabled = !!user && prefectureId === null;
  const previewMunicipalityQueries = useQueries({
    queries: viewportPrefectureIds.map((id) => ({
      queryKey: ["municipalities", id],
      queryFn: () => geoApi.municipalities(id),
      enabled: previewEnabled,
    })),
  });
  const previewGeoJSONQueries = useQueries({
    queries: viewportPrefectureIds.map((id) => ({
      queryKey: ["geo-files", "municipalities", id],
      queryFn: () => geoFilesApi.municipalities(id),
      enabled: previewEnabled,
      staleTime: Infinity,
    })),
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
    // Once a municipality is picked, the prefecture polygon is redundant —
    // drop it entirely so only the municipality's own polygon shows.
    const features = selectedMunicipality
      ? []
      : prefectureId === null
        ? geojson.features
        : geojson.features.filter((f) => f.properties?.id === prefectureId);
    return {
      ...geojson,
      features: features.map((f) => ({
        ...f,
        properties: { ...f.properties, name: nameById.get(f.properties?.id) ?? "" },
      })),
    };
  }, [
    prefecturesGeoJSONQuery.data,
    prefecturesQuery.data,
    prefectureId,
    selectedMunicipality,
  ]);

  const municipalitiesGeoJSONWithNames = useMemo(() => {
    const geojson = municipalitiesGeoJSONQuery.data;
    if (!geojson || !municipalitiesQuery.data) return null;
    const nameById = new Map(
      municipalitiesQuery.data.map((m) => [m.id, placeName(m.nameEn, m.nameJa)]),
    );
    const features = selectedMunicipality
      ? geojson.features.filter((f) => f.properties?.id === selectedMunicipality.id)
      : geojson.features;
    return {
      ...geojson,
      features: features.map((f) => ({
        ...f,
        properties: { ...f.properties, name: nameById.get(f.properties?.id) ?? "" },
      })),
    };
  }, [municipalitiesGeoJSONQuery.data, municipalitiesQuery.data, selectedMunicipality]);

  const previewMunicipalities = useMemo(
    () => previewMunicipalityQueries.flatMap((q) => q.data ?? []),
    [previewMunicipalityQueries],
  );

  const previewMunicipalitiesGeoJSON = useMemo(() => {
    if (prefectureId !== null) return null;
    const features = previewGeoJSONQueries.flatMap((q) => q.data?.features ?? []);
    if (features.length === 0) return null;
    const nameById = new Map(
      previewMunicipalities.map((m) => [m.id, placeName(m.nameEn, m.nameJa)]),
    );
    return {
      type: "FeatureCollection" as const,
      features: features.map((f) => ({
        ...f,
        properties: { ...f.properties, name: nameById.get(f.properties?.id) ?? "" },
      })),
    };
  }, [previewGeoJSONQueries, previewMunicipalities, prefectureId]);

  // Fit to whichever is the more specific current selection: a picked
  // municipality first, else the picked prefecture, else the whole country.
  const fitBounds: LngLatBounds | null = useMemo(() => {
    if (selectedMunicipality && municipalitiesGeoJSONWithNames) {
      return boundsOfFeatureCollection(municipalitiesGeoJSONWithNames);
    }
    if (prefectureId !== null && prefecturesGeoJSONWithNames) {
      return boundsOfFeatureCollection(prefecturesGeoJSONWithNames);
    }
    return null;
  }, [selectedMunicipality, municipalitiesGeoJSONWithNames, prefectureId, prefecturesGeoJSONWithNames]);

  const selectedPrefecture = prefecturesQuery.data?.find((p) => p.id === prefectureId);

  const filteredPrefectures = useMemo(
    () => (prefecturesQuery.data ?? []).filter((p) => matchesSearch(p.nameEn, p.nameJa, search)),
    [prefecturesQuery.data, search],
  );
  const filteredMunicipalities = useMemo(
    () =>
      (municipalitiesQuery.data ?? []).filter((m) => matchesSearch(m.nameEn, m.nameJa, search)),
    [municipalitiesQuery.data, search],
  );

  function selectPrefecture(id: number) {
    setPrefectureId(id);
    setSelectedMunicipality(null);
    setIsEditorOpen(false);
    setSearch("");
    setViewportPrefectureIds([]);
  }

  function backToCountry() {
    setPrefectureId(null);
    setSelectedMunicipality(null);
    setIsEditorOpen(false);
    setSearch("");
  }

  function backToPrefecture() {
    setSelectedMunicipality(null);
    setIsEditorOpen(false);
    setSearch("");
  }

  function selectMunicipality(m: Municipality) {
    setSelectedMunicipality(m);
    setIsEditorOpen(true);
  }

  function handleMunicipalityPolygonClick(id: number) {
    const municipality = municipalitiesQuery.data?.find((m) => m.id === id);
    if (municipality) selectMunicipality(municipality);
  }

  // A municipality clicked straight from the country-level detail preview,
  // before any prefecture was explicitly picked — jump directly into that
  // prefecture's drill-down with this municipality already selected.
  function handlePreviewMunicipalityClick(id: number) {
    const municipality = previewMunicipalities.find((m) => m.id === id);
    if (!municipality) return;
    setPrefectureId(municipality.prefectureId);
    setSearch("");
    setViewportPrefectureIds([]);
    selectMunicipality(municipality);
  }

  if (loading || !user) return null;

  return (
    <div className="flex h-[calc(100vh-57px)]">
      <aside className="flex w-80 flex-col overflow-y-auto border-r border-neutral-200 p-4 dark:border-neutral-800">
        {prefectureId === null ? (
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-neutral-500">Prefectures</h2>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search prefectures..."
              className="rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
            {prefecturesQuery.isLoading && <p className="text-sm">Loading...</p>}
            {prefecturesQuery.data?.length === 0 && (
              <p className="text-sm text-neutral-500">
                No prefecture data yet (waiting on the GADM seed)
              </p>
            )}
            {prefecturesQuery.data && filteredPrefectures.length === 0 && (
              <p className="text-sm text-neutral-500">No matching prefectures</p>
            )}
            <ul className="flex flex-col gap-1">
              {filteredPrefectures.map((pref) => (
                <li key={pref.id}>
                  <button
                    onClick={() => selectPrefecture(pref.id)}
                    className="w-full rounded px-3 py-1.5 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    {placeName(pref.nameEn, pref.nameJa)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div>
              <button
                onClick={backToCountry}
                className="text-xs text-blue-600 hover:underline dark:text-blue-400"
              >
                ← View whole country
              </button>
              <div className="mt-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-neutral-500">
                  Cities &amp; districts
                  {selectedPrefecture && (
                    <span className="ml-1 font-normal">
                      in {placeName(selectedPrefecture.nameEn, selectedPrefecture.nameJa)}
                    </span>
                  )}
                </h2>
                {selectedMunicipality !== null && (
                  <button
                    onClick={backToPrefecture}
                    className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                  >
                    View whole prefecture
                  </button>
                )}
              </div>
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search cities & districts..."
              className="rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
            {municipalitiesQuery.isLoading && <p className="text-sm">Loading...</p>}
            {municipalitiesQuery.data && filteredMunicipalities.length === 0 && (
              <p className="text-sm text-neutral-500">No matching cities or districts</p>
            )}
            <ul className="flex flex-col gap-1">
              {filteredMunicipalities.map((m) => {
                const visit = visitByMunicipalityId.get(m.id);
                return (
                  <li key={m.id}>
                    <button
                      onClick={() => selectMunicipality(m)}
                      className={`flex w-full items-center justify-between rounded px-3 py-1.5 text-left text-sm ${
                        selectedMunicipality?.id === m.id
                          ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                          : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
                      }`}
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
                          {visit.status === "visited" ? "Visited" : "Want to go"}
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
          fitBounds={fitBounds}
          prefecturesGeoJSON={prefecturesGeoJSONWithNames}
          municipalitiesGeoJSON={municipalitiesGeoJSONWithNames}
          previewMunicipalitiesGeoJSON={previewMunicipalitiesGeoJSON}
          visitedPrefectureIds={visitedPrefectureIds}
          visitedMunicipalityIds={visitedMunicipalityIds}
          wantMunicipalityIds={wantMunicipalityIds}
          selectedPrefectureId={prefectureId}
          onPrefectureClick={selectPrefecture}
          onMunicipalityClick={handleMunicipalityPolygonClick}
          onPreviewMunicipalityClick={handlePreviewMunicipalityClick}
          onViewportPrefecturesChange={setViewportPrefectureIds}
        />
      </main>

      {isEditorOpen && selectedMunicipality && (
        <VisitEditor
          municipality={selectedMunicipality}
          existingVisit={visitByMunicipalityId.get(selectedMunicipality.id)}
          onClose={() => setIsEditorOpen(false)}
        />
      )}
    </div>
  );
}
