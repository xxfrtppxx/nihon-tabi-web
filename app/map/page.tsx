"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { geoApi, geoFilesApi, visitsApi, type Municipality, type Visit } from "@/lib/api";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { placeName } from "@/lib/format";
import { boundsOfFeatureCollection } from "@/lib/geo";
import { VisitEditor } from "@/components/visit-editor";
import { DotMapFill, type DotStatus, type LngLat } from "@/components/dot-map";
import { AtlasSummaryPanel } from "@/components/atlas-summary-panel";

function matchesSearch(nameEn: string, nameJa: string, query: string) {
  const q = query.trim();
  if (!q) return true;
  return nameEn.toLowerCase().includes(q.toLowerCase()) || nameJa.includes(q);
}

// The prefecture boundary data's true bbox stretches out to Minami-Torishima
// (~154E, a speck 1,800km from Tokyo) — real for an interactive map, but it
// squeezes the whole visible archipelago into a small corner of a decorative
// dot grid sized off that bbox. Curated to the main islands + Okinawa, the
// same visible extent an illustrative "map of Japan" normally shows.
const COUNTRY_DOT_BOUNDS: [[number, number], [number, number]] = [
  [122.7, 24.0],
  [148.9, 45.7],
];

// Major-city leader-line callouts on the country view, per the design's
// own country-scope label set.
const COUNTRY_LABELS: { name: string; point: LngLat }[] = [
  { name: "Sapporo", point: [141.35, 43.06] },
  { name: "Sendai", point: [140.87, 38.27] },
  { name: "Tokyo", point: [139.69, 35.69] },
  { name: "Kyoto", point: [135.77, 35.01] },
  { name: "Hiroshima", point: [132.46, 34.39] },
  { name: "Fukuoka", point: [130.4, 33.59] },
  { name: "Naha", point: [127.68, 26.21] },
];

export default function MapPage() {
  const router = useRouter();
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
  // How many distinct municipalities have at least one visited record, per
  // prefecture — powers the sidebar's "x/total" progress bar.
  const visitedCountByPrefecture = useMemo(() => {
    const byPrefecture = new Map<number, Set<number>>();
    for (const v of visitsQuery.data ?? []) {
      if (v.status !== "visited") continue;
      const prefId = v.municipality.prefectureId;
      const set = byPrefecture.get(prefId) ?? new Set<number>();
      set.add(v.municipalityId);
      byPrefecture.set(prefId, set);
    }
    return new Map(Array.from(byPrefecture, ([id, set]) => [id, set.size]));
  }, [visitsQuery.data]);

  const classifyPrefecture = useMemo(() => {
    const visited = new Set(visitedPrefectureIds);
    const want = new Set(wantPrefectureIds);
    return (id: number): DotStatus =>
      visited.has(id) && want.has(id) ? "mixed" : visited.has(id) ? "visited" : want.has(id) ? "want_to_go" : "none";
  }, [visitedPrefectureIds, wantPrefectureIds]);

  const classifyMunicipality = useMemo(() => {
    const visited = new Set(visitedMunicipalityIds);
    const want = new Set(wantMunicipalityIds);
    return (id: number): DotStatus =>
      visited.has(id) && want.has(id) ? "mixed" : visited.has(id) ? "visited" : want.has(id) ? "want_to_go" : "none";
  }, [visitedMunicipalityIds, wantMunicipalityIds]);

  const prefectureBounds = useMemo(
    () => (municipalitiesGeoJSONQuery.data ? boundsOfFeatureCollection(municipalitiesGeoJSONQuery.data) : null),
    [municipalitiesGeoJSONQuery.data],
  );

  // The selected city's own real polygon, so the dot map can trace its
  // exact shape instead of marking a generic square at its centroid.
  const selectedMunicipalityGeometry = useMemo(() => {
    if (!selectedMunicipality || !municipalitiesGeoJSONQuery.data) return null;
    return (
      municipalitiesGeoJSONQuery.data.features.find(
        (f) => f.properties?.id === selectedMunicipality.id,
      )?.geometry ?? null
    );
  }, [selectedMunicipality, municipalitiesGeoJSONQuery.data]);

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

  function openNewEntry() {
    setEditorRequest({ municipality: selectedMunicipality, mode: "new" });
  }

  function openCity() {
    if (selectedMunicipality) {
      router.push(`/city/${selectedMunicipality.id}?prefectureId=${selectedMunicipality.prefectureId}`);
    }
  }

  if (loading || !user) return null;

  const selectedVisits = selectedMunicipality
    ? (visitsByMunicipalityId.get(selectedMunicipality.id) ?? [])
    : [];
  const selectedPhotos = selectedVisits.flatMap((v) => v.photos).slice(0, 3);
  const latestNote = [...selectedVisits].reverse().find((v) => v.note)?.note ?? null;

  return (
    <div className="flex h-[calc(100vh-57px)]">
      <aside
        className="flex w-[340px] flex-none flex-col overflow-y-auto border-r"
        style={{ borderColor: "var(--divider)" }}
      >
        {prefectureId === null ? (
          <>
            <div
              className="flex-none border-b px-5 pt-5 pb-4"
              style={{ borderColor: "var(--neutral-300)" }}
            >
              <div className="mb-3 text-[10px] font-semibold tracking-[0.14em] text-neutral-600 uppercase">
                {prefecturesQuery.data?.length ?? 47} Prefectures
              </div>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search prefecture or city"
                className="w-full rounded-[var(--radius-md)] border px-3 py-1.5 text-sm"
                style={{ borderColor: "var(--divider)", background: "var(--surface)" }}
              />
            </div>
            <div className="flex-1 px-5 py-1">
              {prefecturesQuery.isLoading && <p className="py-3 text-sm">Loading...</p>}
              {prefecturesQuery.data?.length === 0 && (
                <p className="py-3 text-sm text-neutral-500">
                  No prefecture data yet (waiting on the GADM seed)
                </p>
              )}
              {prefecturesQuery.data && filteredPrefectures.length === 0 && (
                <p className="py-3 text-sm text-neutral-500">No matching prefectures</p>
              )}
              {filteredPrefectures.map((pref) => {
                const visited = visitedCountByPrefecture.get(pref.id) ?? 0;
                const pct = pref.municipalityCount > 0 ? (visited / pref.municipalityCount) * 100 : 0;
                return (
                  <button
                    key={pref.id}
                    onClick={() => selectPrefecture(pref.id)}
                    className="flex w-full items-center justify-between gap-3 border-b py-2.5 text-left"
                    style={{ borderColor: "var(--neutral-300)" }}
                  >
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="text-sm font-semibold">{pref.nameEn}</span>
                      <span className="text-xs text-neutral-600">{pref.nameJa}</span>
                    </span>
                    <span className="flex flex-none items-center gap-2.5">
                      <span className="text-[11px] font-medium tabular-nums text-neutral-600">
                        {visited}/{pref.municipalityCount}
                      </span>
                      <span
                        className="block h-1.5 w-11 rounded-full"
                        style={{ background: "var(--neutral-200)" }}
                      >
                        <span
                          className="block h-1.5 rounded-full"
                          style={{ background: "var(--accent)", width: `${pct}%` }}
                        />
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-3 p-5">
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
                  {municipalitiesQuery.data?.length ?? "…"} cities &amp; districts
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
              placeholder={`Search in ${selectedPrefecture?.nameEn ?? ""}`}
              className="rounded-[var(--radius-md)] border px-3 py-1.5 text-sm"
              style={{ borderColor: "var(--divider)", background: "var(--surface)" }}
            />
            {municipalitiesQuery.isLoading && <p className="text-sm">Loading...</p>}
            {municipalitiesQuery.data && filteredMunicipalities.length === 0 && (
              <p className="text-sm text-neutral-500">No matching cities or districts</p>
            )}
            <ul className="flex flex-col">
              {filteredMunicipalities.map((m) => {
                const visits = visitsByMunicipalityId.get(m.id) ?? [];
                const hasVisited = visits.some((v) => v.status === "visited");
                const hasWant = visits.some((v) => v.status === "want_to_go");
                const selected = selectedMunicipality?.id === m.id;
                return (
                  <li key={m.id}>
                    <button
                      onClick={() => setSelectedMunicipality(m)}
                      className="flex w-full items-center justify-between gap-2 border-b px-1 py-2.5 text-left text-sm"
                      style={{
                        borderColor: "var(--neutral-300)",
                        background: selected ? "#1a2624" : "transparent",
                        color: selected ? "#f7f4ef" : "var(--foreground)",
                      }}
                    >
                      <span className="flex items-baseline gap-2">
                        <span className="font-semibold">{m.nameEn}</span>
                        <span className="text-xs opacity-70">{m.nameJa}</span>
                      </span>
                      {(hasVisited || hasWant) && (
                        <span
                          className="flex-none rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase"
                          style={{ borderColor: "currentColor" }}
                        >
                          {hasVisited ? "Visited" : "Planned"}
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

      <main className="relative flex-1" style={{ background: "var(--background)" }}>
        {prefectureId !== null && (
          <div
            className="flex h-11 flex-none items-center gap-2.5 border-b px-6 text-[11px] font-semibold tracking-wide uppercase"
            style={{ borderColor: "var(--divider)", background: "var(--neutral-200)" }}
          >
            <button onClick={backToCountry} style={{ color: "var(--accent-700)" }}>
              Japan
            </button>
            <span className="text-neutral-500">/</span>
            <span style={{ color: "var(--accent-700)" }}>{selectedPrefecture?.region}</span>
            <span className="text-neutral-500">/</span>
            <button onClick={backToPrefecture} style={{ color: selectedMunicipality ? "var(--accent-700)" : undefined }}>
              {selectedPrefecture && placeName(selectedPrefecture.nameEn, selectedPrefecture.nameJa)}
            </button>
            {selectedMunicipality && (
              <>
                <span className="text-neutral-500">/</span>
                <span>{placeName(selectedMunicipality.nameEn, selectedMunicipality.nameJa)}</span>
              </>
            )}
          </div>
        )}

        {prefectureId === null ? (
          <DotMapFill
            key="country"
            className="absolute inset-0"
            geojson={prefecturesGeoJSONQuery.data ?? null}
            bounds={COUNTRY_DOT_BOUNDS}
            classify={classifyPrefecture}
            cols={64}
            rows={64}
            labels={COUNTRY_LABELS}
            onFeatureClick={selectPrefecture}
          />
        ) : (
          <DotMapFill
            key={prefectureId}
            className="absolute inset-0"
            style={{ top: 44 }}
            geojson={municipalitiesGeoJSONQuery.data ?? null}
            bounds={prefectureBounds}
            classify={classifyMunicipality}
            cols={54}
            rows={54}
            highlightGeometry={selectedMunicipalityGeometry}
            onFeatureClick={(id) => {
              const m = municipalitiesQuery.data?.find((m) => m.id === id);
              if (m) setSelectedMunicipality(m);
            }}
          />
        )}

        {prefectureId === null && (
          <div
            className="absolute top-6 left-6 rounded-[var(--radius-md)] px-4 py-3.5"
            style={{ background: "var(--background)", border: "1px solid var(--divider)" }}
          >
            <div className="mb-2.5 text-[10px] font-semibold tracking-[0.14em] text-neutral-600 uppercase">
              Legend
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="block h-2.5 w-2.5 rounded-[3px]" style={{ background: "var(--accent)" }} />
                <span className="text-xs font-medium">Visited</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="block h-2.5 w-2.5 rounded-[3px] border box-border" style={{ borderColor: "var(--divider)" }} />
                <span className="text-xs font-medium">Want to go</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="block h-2.5 w-2.5 rounded-[3px]" style={{ background: "var(--neutral-300)" }} />
                <span className="text-xs font-medium">Not yet</span>
              </div>
            </div>
          </div>
        )}

        {prefectureId === null && !selectedMunicipality && (
          <div className="absolute right-6 bottom-6 flex items-end gap-3">
            <div
              className="rounded-[var(--radius-md)] px-4 py-3"
              style={{ background: "var(--background)", border: "1px solid var(--divider)" }}
            >
              <div className="text-[10px] font-semibold tracking-[0.14em] text-neutral-600 uppercase">
                Coverage
              </div>
              <div className="mt-1.5 text-[30px] leading-none font-extrabold tabular-nums">
                {visitedMunicipalityIds.length > 0 && prefecturesQuery.data
                  ? `${((visitedPrefectureIds.length / prefecturesQuery.data.length) * 100).toFixed(1)}%`
                  : "0%"}
              </div>
            </div>
            <button
              type="button"
              onClick={openNewEntry}
              className="h-[52px] rounded-full px-[22px] text-sm font-semibold text-white"
              style={{ background: "var(--accent)" }}
            >
              Log a place
            </button>
          </div>
        )}

        {selectedMunicipality && (
          <div
            className="absolute bottom-6 left-6 w-[420px] overflow-hidden rounded-[var(--radius-lg)]"
            style={{ background: "var(--background)", border: "1px solid var(--divider)", boxShadow: "0 14px 40px rgba(29,42,42,.18)" }}
          >
            <div className="flex gap-0.5 p-0.5" style={{ background: "var(--foreground)" }}>
              {[0, 1, 2].map((i) => {
                const photo = selectedPhotos[i];
                return (
                  <div key={i} className="relative h-[120px] min-w-0 flex-1 overflow-hidden rounded-[10px] bg-neutral-700">
                    {photo && <Image src={photo.url} alt="" fill sizes="140px" className="object-cover" />}
                  </div>
                );
              })}
            </div>
            <div className="p-[18px]">
              <div className="flex items-baseline justify-between gap-2.5">
                <h3 className="text-2xl leading-none font-extrabold tracking-tight">
                  {selectedMunicipality.nameEn}{" "}
                  <span className="text-base font-medium text-neutral-600">
                    {selectedMunicipality.nameJa}
                  </span>
                </h3>
                <span className="flex-none text-xs font-medium tabular-nums text-neutral-600">
                  {selectedVisits.length} record{selectedVisits.length === 1 ? "" : "s"}
                </span>
              </div>
              {latestNote && (
                <p className="mt-2.5 max-w-[44ch] text-[13px] leading-relaxed text-neutral-800">
                  {latestNote}
                </p>
              )}
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={openCity}
                  className="flex-1 rounded-[var(--radius-md)] px-4 py-2 text-sm font-semibold text-white"
                  style={{ background: "var(--accent)" }}
                >
                  Open city
                </button>
                <button
                  type="button"
                  onClick={openNewEntry}
                  className="flex-1 rounded-[var(--radius-md)] border px-4 py-2 text-sm font-semibold"
                  style={{ borderColor: "var(--divider)" }}
                >
                  Add record
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {prefectureId === null && <AtlasSummaryPanel visits={visitsQuery.data ?? []} />}

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
