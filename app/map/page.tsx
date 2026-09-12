"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { geoApi, visitsApi, type Municipality, type Visit } from "@/lib/api";
import { useRequireAuth } from "@/hooks/use-require-auth";
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

  const visitByMunicipalityId = useMemo(() => {
    const map = new Map<number, Visit>();
    for (const visit of visitsQuery.data ?? []) {
      map.set(visit.municipalityId, visit);
    }
    return map;
  }, [visitsQuery.data]);

  const selectedPrefecture = prefecturesQuery.data?.find((p) => p.id === prefectureId);
  const flyTo: FlyToTarget | null =
    selectedPrefecture?.centroidLat != null && selectedPrefecture?.centroidLng != null
      ? { lat: selectedPrefecture.centroidLat, lng: selectedPrefecture.centroidLng }
      : null;

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
                  {pref.nameJa}
                  <span className="ml-1 text-xs opacity-60">{pref.nameEn}</span>
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
                      <span>{m.nameJa}</span>
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
        <MapView flyTo={flyTo} />
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
