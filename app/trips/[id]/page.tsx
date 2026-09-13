"use client";

import { use, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { geoApi, geoFilesApi, tripsApi, visitsApi, type Municipality } from "@/lib/api";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { formatDate, placeName } from "@/lib/format";
import { boundsOfPoints, type LngLatBounds } from "@/lib/geo";
import { DotMapSvg, useDotGrid, type DotStatus, type LngLat } from "@/components/dot-map";

const JAPAN_BOUNDS: LngLatBounds = [
  [128.5, 30.5],
  [146.5, 45.7],
];

export default function TripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tripId } = use(params);
  const { user, loading } = useRequireAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [addingDay, setAddingDay] = useState(false);
  const [dayPrefectureId, setDayPrefectureId] = useState<number | null>(null);
  const [dayMunicipalityId, setDayMunicipalityId] = useState<number | null>(null);
  const [dayNote, setDayNote] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const tripQuery = useQuery({
    queryKey: ["trips", tripId],
    queryFn: () => tripsApi.get(tripId),
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
    enabled: !!user && addingDay,
  });
  const municipalitiesQuery = useQuery({
    queryKey: ["municipalities", dayPrefectureId],
    queryFn: () => geoApi.municipalities(dayPrefectureId!),
    enabled: !!user && dayPrefectureId !== null,
  });
  const prefecturesGeoJSONQuery = useQuery({
    queryKey: ["geo-files", "prefectures"],
    queryFn: geoFilesApi.prefectures,
    enabled: !!user,
    staleTime: Infinity,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["trips"] });

  const updateTitleMutation = useMutation({
    mutationFn: (title: string) => tripsApi.update(tripId, { title }),
    onSuccess: () => {
      invalidate();
      setEditingTitle(false);
    },
  });
  const addDayMutation = useMutation({
    mutationFn: (data: { dayNumber: number; municipalityId: number; note?: string }) =>
      tripsApi.addDay(tripId, data),
    onSuccess: () => {
      invalidate();
      setAddingDay(false);
      setDayPrefectureId(null);
      setDayMunicipalityId(null);
      setDayNote("");
    },
  });
  const removeDayMutation = useMutation({
    mutationFn: (dayId: string) => tripsApi.removeDay(tripId, dayId),
    onSuccess: invalidate,
  });
  const removeTripMutation = useMutation({
    mutationFn: () => tripsApi.remove(tripId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trips"] });
      router.push("/trips");
    },
  });

  const trip = tripQuery.data;
  const days = useMemo(
    () => (trip ? [...trip.days].sort((a, b) => a.dayNumber - b.dayNumber) : []),
    [trip],
  );

  const route: LngLat[] = useMemo(
    () =>
      days
        .filter((d) => d.municipality.centroidLng !== null && d.municipality.centroidLat !== null)
        .map((d) => [d.municipality.centroidLng!, d.municipality.centroidLat!]),
    [days],
  );
  const routeBounds = useMemo(() => boundsOfPoints(route) ?? JAPAN_BOUNDS, [route]);

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
    bounds: routeBounds,
    classify,
    cols: 36,
    rows: 28,
    viewSize: 320,
  });

  const nextDayNumber = days.length > 0 ? Math.max(...days.map((d) => d.dayNumber)) + 1 : 1;

  function startAddDay() {
    setAddingDay(true);
    setDayPrefectureId(null);
    setDayMunicipalityId(null);
    setDayNote("");
  }

  function submitAddDay() {
    if (!dayMunicipalityId) return;
    addDayMutation.mutate({
      dayNumber: nextDayNumber,
      municipalityId: dayMunicipalityId,
      note: dayNote.trim() || undefined,
    });
  }

  function exportTrip() {
    if (!trip) return;
    const blob = new Blob([JSON.stringify(trip, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${trip.title.replace(/\s+/g, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading || !user) return null;

  if (tripQuery.isLoading) {
    return (
      <main className="p-8">
        <p className="text-neutral-500">Loading...</p>
      </main>
    );
  }

  if (!trip) {
    return (
      <main className="p-8">
        <p className="text-neutral-500">Trip not found.</p>
        <Link href="/trips" className="mt-2 inline-block text-sm underline" style={{ color: "var(--accent)" }}>
          ← Back to trips
        </Link>
      </main>
    );
  }

  return (
    <div className="flex h-[calc(100vh-57px)]">
      <div className="flex flex-1 flex-col overflow-y-auto px-10 py-8">
        <Link href="/trips" className="mb-4 self-start text-xs hover:underline" style={{ color: "var(--accent)" }}>
          ← All trips
        </Link>

        <div
          className="flex items-end justify-between border-b pb-[18px]"
          style={{ borderColor: "var(--divider)" }}
        >
          <div>
            <p className="mb-2.5 text-[10px] font-semibold tracking-[0.14em] text-neutral-500 uppercase">
              {trip.startDate ? formatDate(trip.startDate) : "No dates yet"}
              {trip.endDate ? ` – ${formatDate(trip.endDate)}` : ""} · {trip.dayCount} day
              {trip.dayCount === 1 ? "" : "s"}
            </p>
            {editingTitle ? (
              <input
                type="text"
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={() => titleDraft.trim() && updateTitleMutation.mutate(titleDraft.trim())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") setEditingTitle(false);
                }}
                className="rounded-[var(--radius-md)] border px-2 py-1 text-[40px] leading-[0.9] font-black tracking-tight"
                style={{ borderColor: "var(--divider)", background: "var(--surface)" }}
              />
            ) : (
              <h1
                className="cursor-pointer text-[54px] leading-[0.9] font-black tracking-tight hover:opacity-70"
                onClick={() => {
                  setTitleDraft(trip.title);
                  setEditingTitle(true);
                }}
                title="Click to rename"
              >
                {trip.title}
              </h1>
            )}
          </div>
          <div className="flex items-center gap-6">
            <div className="flex gap-6 text-left">
              <div>
                <p className="text-[40px] leading-none font-extrabold tabular-nums">{trip.cityCount}</p>
                <p className="mt-1.5 text-xs font-semibold tracking-wide text-neutral-500 uppercase">Cities</p>
              </div>
              <div>
                <p className="text-[40px] leading-none font-extrabold tabular-nums">{trip.dayCount}</p>
                <p className="mt-1.5 text-xs font-semibold tracking-wide text-neutral-500 uppercase">Days</p>
              </div>
              <div>
                <p className="text-[40px] leading-none font-extrabold tabular-nums">{trip.totalKm}</p>
                <p className="mt-1.5 text-xs font-semibold tracking-wide text-neutral-500 uppercase">km</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="text-xs font-medium hover:underline"
              style={{ color: "var(--plan-700)" }}
            >
              Delete trip
            </button>
          </div>
        </div>

        <ul className="mt-2">
          {days.map((d) => (
            <li
              key={d.id}
              className="grid grid-cols-[78px_1fr_auto] items-center gap-6 border-b py-4"
              style={{ borderColor: "var(--neutral-300)" }}
            >
              <div>
                <p className="text-xs font-semibold text-neutral-500 uppercase">Day</p>
                <p className="mt-1 text-[28px] leading-none font-extrabold">{d.dayNumber}</p>
              </div>
              <div>
                <div className="flex items-baseline gap-2.5">
                  <Link
                    href={`/city/${d.municipality.id}?prefectureId=${d.municipality.prefectureId}`}
                    className="text-lg font-bold hover:underline"
                  >
                    {d.municipality.nameEn}
                  </Link>
                  <span className="text-[13px] text-neutral-500">{d.municipality.nameJa}</span>
                </div>
                {d.note && <p className="mt-1 text-[13px] text-neutral-600">{d.note}</p>}
              </div>
              <button
                type="button"
                onClick={() => removeDayMutation.mutate(d.id)}
                disabled={removeDayMutation.isPending}
                className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>

        {addingDay ? (
          <div
            className="mt-4 flex flex-col gap-3 rounded-[var(--radius-lg)] p-5"
            style={{ background: "var(--surface)", border: "1px solid var(--divider)" }}
          >
            <div className="flex gap-3">
              <label className="flex flex-1 flex-col gap-1 text-sm">
                Prefecture
                <select
                  value={dayPrefectureId ?? ""}
                  onChange={(e) => {
                    setDayPrefectureId(Number(e.target.value));
                    setDayMunicipalityId(null);
                  }}
                  className="rounded-[var(--radius-md)] border px-3 py-2"
                  style={{ borderColor: "var(--divider)", background: "var(--background)" }}
                >
                  <option value="" disabled>
                    Select prefecture
                  </option>
                  {prefecturesQuery.data?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {placeName(p.nameEn, p.nameJa)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-1 flex-col gap-1 text-sm">
                City / district
                <select
                  value={dayMunicipalityId ?? ""}
                  disabled={dayPrefectureId === null}
                  onChange={(e) => setDayMunicipalityId(Number(e.target.value))}
                  className="rounded-[var(--radius-md)] border px-3 py-2 disabled:opacity-60"
                  style={{ borderColor: "var(--divider)", background: "var(--background)" }}
                >
                  <option value="" disabled>
                    Select city/district
                  </option>
                  {municipalitiesQuery.data?.map((m: Municipality) => (
                    <option key={m.id} value={m.id}>
                      {placeName(m.nameEn, m.nameJa)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              Note (optional)
              <input
                type="text"
                value={dayNote}
                onChange={(e) => setDayNote(e.target.value)}
                className="rounded-[var(--radius-md)] border px-3 py-2"
                style={{ borderColor: "var(--divider)", background: "var(--background)" }}
              />
            </label>
            {addDayMutation.isError && (
              <p className="text-sm" style={{ color: "var(--plan-700)" }}>
                Failed to add day. Please try again.
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={submitAddDay}
                disabled={!dayMunicipalityId || addDayMutation.isPending}
                className="rounded-[var(--radius-md)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: "var(--accent)" }}
              >
                {addDayMutation.isPending ? "Adding..." : `Add day ${nextDayNumber}`}
              </button>
              <button
                type="button"
                onClick={() => setAddingDay(false)}
                className="rounded-[var(--radius-md)] border px-4 py-2 text-sm font-semibold"
                style={{ borderColor: "var(--divider)" }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={startAddDay}
            className="mt-4 self-start rounded-[var(--radius-md)] border px-4 py-2 text-sm font-semibold"
            style={{ borderColor: "var(--divider)" }}
          >
            + Add a day
          </button>
        )}
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
              route={route.length > 1 ? route : undefined}
            />
          )}
        </div>
        <div className="flex gap-2 border-t p-5" style={{ borderColor: "var(--divider)" }}>
          <button
            type="button"
            onClick={exportTrip}
            className="flex-1 rounded-[var(--radius-md)] px-4 py-2 text-sm font-semibold text-white"
            style={{ background: "var(--accent)" }}
          >
            Export trip
          </button>
          <button
            type="button"
            onClick={startAddDay}
            className="flex-1 rounded-[var(--radius-md)] border px-4 py-2 text-sm font-semibold"
            style={{ borderColor: "var(--divider)" }}
          >
            Add a day
          </button>
        </div>
      </aside>

      {confirmDelete && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4">
          <div
            className="w-full max-w-sm rounded-[var(--radius-lg)] p-5"
            style={{ background: "var(--surface)" }}
          >
            <p className="mb-4 text-sm">
              Delete &quot;{trip.title}&quot;? This removes all {trip.dayCount} day
              {trip.dayCount === 1 ? "" : "s"} too — this can&apos;t be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-[var(--radius-md)] border px-4 py-2 text-sm font-medium"
                style={{ borderColor: "var(--divider)" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => removeTripMutation.mutate()}
                disabled={removeTripMutation.isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {removeTripMutation.isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
