"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useQueries, useQuery } from "@tanstack/react-query";
import { geoApi, geoFilesApi, visitsApi, type Municipality, type Visit } from "@/lib/api";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { placeName } from "@/lib/format";
import { boundsOfFeatureCollection, boundsOfGeometry, type LngLatBounds } from "@/lib/geo";
import { VisitEditor } from "@/components/visit-editor";
import { CoverageDotMatrix } from "@/components/coverage-dot-matrix";
import { AtlasSummaryPanel } from "@/components/atlas-summary-panel";

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
  const [editorRequest, setEditorRequest] = useState<{
    municipality: Municipality | null;
    mode: "list" | "new";
  } | null>(null);
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

  const visitsByMunicipalityId = useMemo(() => {
    const map = new Map<number, Visit[]>();
    for (const visit of visitsQuery.data ?? []) {
      const list = map.get(visit.municipalityId);
      if (list) list.push(visit);
      else map.set(visit.municipalityId, [visit]);
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
  const mixedMunicipalityIds = useMemo(() => {
    const wantSet = new Set(wantMunicipalityIds);
    return Array.from(new Set(visitedMunicipalityIds.filter((id) => wantSet.has(id))));
  }, [visitedMunicipalityIds, wantMunicipalityIds]);
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
  const wantPrefectureIds = useMemo(
    () =>
      Array.from(
        new Set(
          (visitsQuery.data ?? [])
            .filter((v) => v.status === "want_to_go")
            .map((v) => v.municipality.prefectureId),
        ),
      ),
    [visitsQuery.data],
  );
  const mixedPrefectureIds = useMemo(() => {
    const wantSet = new Set(wantPrefectureIds);
    return Array.from(new Set(visitedPrefectureIds.filter((id) => wantSet.has(id))));
  }, [visitedPrefectureIds, wantPrefectureIds]);

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
    // Once a city is selected, its 3D card / photo pins take over as the
    // visual entirely — the flat polygon underneath is hidden rather than
    // shown alongside it.
    const features = selectedMunicipality ? [] : geojson.features;
    return {
      ...geojson,
      features: features.map((f) => ({
        ...f,
        properties: { ...f.properties, name: nameById.get(f.properties?.id) ?? "" },
      })),
    };
  }, [municipalitiesGeoJSONQuery.data, municipalitiesQuery.data, selectedMunicipality]);

  // Feeds the map's in-place preview (photo pins or a tilted polygon card)
  // for whichever city is currently selected — not shown at all otherwise.
  // Looked up independently of municipalitiesGeoJSONWithNames since that
  // collection no longer carries the selected city's own feature.
  const selectedMunicipalityGeometry = useMemo(() => {
    if (!selectedMunicipality) return null;
    const feature = municipalitiesGeoJSONQuery.data?.features.find(
      (f) => f.properties?.id === selectedMunicipality.id,
    );
    return feature?.geometry ?? null;
  }, [selectedMunicipality, municipalitiesGeoJSONQuery.data]);
  // One representative photo per post/visit, not every photo it has — the
  // timeline (list view) is where all of a post's photos actually show.
  const selectedMunicipalityPhotoUrls = useMemo(() => {
    if (!selectedMunicipality) return [];
    const visits = visitsByMunicipalityId.get(selectedMunicipality.id) ?? [];
    return visits.filter((v) => v.photos.length > 0).map((v) => v.photos[0].url);
  }, [selectedMunicipality, visitsByMunicipalityId]);
  // Same status classification the flat polygon fill uses, so the 3D card
  // keeps the same color meaning instead of always rendering neutral gray.
  const selectedMunicipalityStatus = useMemo(() => {
    if (!selectedMunicipality) return "none" as const;
    const id = selectedMunicipality.id;
    if (mixedMunicipalityIds.includes(id)) return "mixed" as const;
    if (visitedMunicipalityIds.includes(id)) return "visited" as const;
    if (wantMunicipalityIds.includes(id)) return "want_to_go" as const;
    return "none" as const;
  }, [selectedMunicipality, mixedMunicipalityIds, visitedMunicipalityIds, wantMunicipalityIds]);

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
    if (selectedMunicipality && selectedMunicipalityGeometry) {
      return boundsOfGeometry(selectedMunicipalityGeometry);
    }
    if (prefectureId !== null && prefecturesGeoJSONWithNames) {
      return boundsOfFeatureCollection(prefecturesGeoJSONWithNames);
    }
    return null;
  }, [selectedMunicipality, selectedMunicipalityGeometry, prefectureId, prefecturesGeoJSONWithNames]);

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
    setEditorRequest(null);
    setSearch("");
    setViewportPrefectureIds([]);
  }

  function backToCountry() {
    setPrefectureId(null);
    setSelectedMunicipality(null);
    setEditorRequest(null);
    setSearch("");
  }

  function backToPrefecture() {
    setSelectedMunicipality(null);
    setEditorRequest(null);
    setSearch("");
  }

  function selectMunicipality(m: Municipality) {
    setSelectedMunicipality(m);
  }

  // Used both by the floating "+ Add data" button and by tapping a city's
  // tilted preview card — either way it's a fresh record, pre-filled to
  // whichever city (if any) is currently selected.
  function openNewEntry() {
    setEditorRequest({ municipality: selectedMunicipality, mode: "new" });
  }

  function openExistingRecords() {
    setEditorRequest({ municipality: selectedMunicipality, mode: "list" });
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
      <aside
        className="flex w-80 flex-col overflow-y-auto border-r p-4"
        style={{ borderColor: "var(--divider)" }}
      >
        {prefectureId === null ? (
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-neutral-500">Prefectures</h2>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search prefectures..."
              className="rounded-[var(--radius-md)] border px-3 py-1.5 text-sm"
              style={{ borderColor: "var(--divider)", background: "var(--surface)" }}
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
                    className="w-full rounded-[var(--radius-sm)] px-3 py-1.5 text-left text-sm hover:bg-[var(--accent-100)]"
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
                className="text-xs hover:underline"
                style={{ color: "var(--accent)" }}
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
                    className="text-xs hover:underline"
                    style={{ color: "var(--accent)" }}
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
              className="rounded-[var(--radius-md)] border px-3 py-1.5 text-sm"
              style={{ borderColor: "var(--divider)", background: "var(--surface)" }}
            />
            {municipalitiesQuery.isLoading && <p className="text-sm">Loading...</p>}
            {municipalitiesQuery.data && filteredMunicipalities.length === 0 && (
              <p className="text-sm text-neutral-500">No matching cities or districts</p>
            )}
            <ul className="flex flex-col gap-1">
              {filteredMunicipalities.map((m) => {
                const visits = visitsByMunicipalityId.get(m.id) ?? [];
                const hasVisited = visits.some((v) => v.status === "visited");
                const hasWant = visits.some((v) => v.status === "want_to_go");
                const isSelected = selectedMunicipality?.id === m.id;
                return (
                  <li
                    key={m.id}
                    className={`rounded-[var(--radius-sm)] ${isSelected ? "" : "hover:bg-[var(--accent-100)]"}`}
                    style={isSelected ? { background: "var(--accent)", color: "#fff" } : undefined}
                  >
                    <button
                      onClick={() => selectMunicipality(m)}
                      className="flex w-full items-center justify-between gap-2 px-3 pt-1.5 text-left text-sm"
                    >
                      <span>{placeName(m.nameEn, m.nameJa)}</span>
                      <span className="flex shrink-0 items-center gap-1">
                        {hasVisited && (
                          <span
                            className="rounded-full px-2 py-0.5 text-xs"
                            style={{ background: "var(--accent-100)", color: "var(--accent-700)" }}
                          >
                            Visited
                          </span>
                        )}
                        {hasWant && (
                          <span
                            className="rounded-full px-2 py-0.5 text-xs"
                            style={{ background: "var(--plan-100)", color: "var(--plan-700)" }}
                          >
                            Want to go
                          </span>
                        )}
                      </span>
                    </button>
                    <Link
                      href={`/city/${m.prefectureId}/${m.id}`}
                      className="block px-3 pb-1.5 text-right text-xs hover:underline"
                      style={{ color: isSelected ? "#fff" : "var(--accent)" }}
                    >
                      View city page →
                    </Link>
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
          mixedPrefectureIds={mixedPrefectureIds}
          mixedMunicipalityIds={mixedMunicipalityIds}
          selectedPrefectureId={prefectureId}
          selectedMunicipalityGeometry={selectedMunicipalityGeometry}
          selectedMunicipalityPhotoUrls={selectedMunicipalityPhotoUrls}
          selectedMunicipalityStatus={selectedMunicipalityStatus}
          onPrefectureClick={selectPrefecture}
          onMunicipalityClick={handleMunicipalityPolygonClick}
          onPreviewMunicipalityClick={handlePreviewMunicipalityClick}
          onViewportPrefecturesChange={setViewportPrefectureIds}
          onEmptyAreaClick={openNewEntry}
          onPhotoAreaClick={openExistingRecords}
        />

        {prefectureId === null && !selectedMunicipality && (
          <CoverageDotMatrix
            prefecturesGeoJSON={prefecturesGeoJSONQuery.data ?? null}
            visitedPrefectureIds={visitedPrefectureIds}
            wantPrefectureIds={wantPrefectureIds}
            mixedPrefectureIds={mixedPrefectureIds}
          />
        )}

        <button
          type="button"
          onClick={openNewEntry}
          className="absolute bottom-6 right-6 z-10 flex h-14 w-14 items-center justify-center rounded-full text-2xl text-white shadow-lg"
          style={{ background: "var(--accent)" }}
          aria-label="Add data"
          title="Add data"
        >
          +
        </button>
      </main>

      {prefectureId === null && !selectedMunicipality && (
        <AtlasSummaryPanel visits={visitsQuery.data ?? []} />
      )}

      {editorRequest && (
        <VisitEditor
          initialMunicipality={editorRequest.municipality}
          visits={
            editorRequest.municipality
              ? (visitsByMunicipalityId.get(editorRequest.municipality.id) ?? [])
              : []
          }
          mode={editorRequest.mode}
          onClose={() => setEditorRequest(null)}
        />
      )}
    </div>
  );
}
