"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  geoApi,
  photosApi,
  visitsApi,
  type Municipality,
  type Visit,
  type VisitPhoto,
  type VisitStatus,
} from "@/lib/api";
import { formatDate, placeName } from "@/lib/format";
import { haversineKm } from "@/lib/geo";

// Local calendar day, not UTC — the date picker limits should match what
// the user considers "today" on their own device.
function dateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function todayStr(): string {
  return dateStr(new Date());
}

function maxFutureDateStr(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 3);
  return dateStr(d);
}

const MIN_VISITED_DATE = "1990-01-01";

export function VisitEditor({
  initialMunicipality,
  visits,
  mode,
  onClose,
}: {
  initialMunicipality: Municipality | null;
  visits: Visit[];
  mode: "list" | "new";
  onClose: () => void;
}) {
  const [municipality, setMunicipality] = useState<Municipality | null>(initialMunicipality);
  const [editing, setEditing] = useState<Visit | "new" | null>(mode === "list" ? null : "new");
  const hasExistingRecords = visits.length > 0;

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center">
      <div
        className="w-full max-w-md rounded-t-[var(--radius-lg)] p-6 sm:rounded-[var(--radius-lg)]"
        style={{ background: "var(--surface)" }}
      >
        {municipality && (
          <div className="mb-4">
            <h2 className="text-lg font-bold">
              {placeName(municipality.nameEn, municipality.nameJa)}
            </h2>
          </div>
        )}

        {editing === null ? (
          <VisitList
            visits={visits}
            onSelect={setEditing}
            onAddNew={() => setEditing("new")}
            onClose={onClose}
          />
        ) : (
          <VisitEntryForm
            municipality={municipality}
            municipalityLocked={initialMunicipality !== null}
            onMunicipalityChange={setMunicipality}
            existingVisit={editing === "new" ? undefined : editing}
            onBack={hasExistingRecords ? () => setEditing(null) : undefined}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  );
}

function VisitList({
  visits,
  onSelect,
  onAddNew,
  onClose,
}: {
  visits: Visit[];
  onSelect: (visit: Visit) => void;
  onAddNew: () => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState<Visit | null>(null);
  const [lightbox, setLightbox] = useState<{ photos: VisitPhoto[]; index: number } | null>(null);
  const deleteMutation = useMutation({
    mutationFn: (visitId: string) => visitsApi.remove(visitId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["visits"] });
      setConfirmDelete(null);
    },
  });

  // Wraps around at both ends — going "next" from the last photo loops
  // back to the first, matching how most gallery viewers behave.
  function showRelativePhoto(delta: number) {
    setLightbox((current) => {
      if (!current) return current;
      const count = current.photos.length;
      const index = (current.index + delta + count) % count;
      return { ...current, index };
    });
  }

  useEffect(() => {
    if (!lightbox || lightbox.photos.length <= 1) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowRight") showRelativePhoto(1);
      else if (e.key === "ArrowLeft") showRelativePhoto(-1);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightbox]);

  return (
    <div className="flex flex-col gap-3">
      {visits.length === 0 && (
        <p className="text-sm text-neutral-500">No records yet for this city.</p>
      )}
      <ul className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
        {visits.map((visit) => (
          <li
            key={visit.id}
            className="flex flex-col gap-2 rounded-[var(--radius-md)] border p-3 text-sm"
            style={{ borderColor: "var(--divider)" }}
          >
            <div className="flex items-center justify-between">
              <span
                className="rounded-full px-2 py-0.5 text-xs"
                style={
                  visit.status === "visited"
                    ? { background: "var(--accent-100)", color: "var(--accent-700)" }
                    : { background: "var(--plan-100)", color: "var(--plan-700)" }
                }
              >
                {visit.status === "visited" ? "Visited" : "Want to go"}
              </span>
              {visit.visitedOn && (
                <span className="text-xs text-neutral-500">{formatDate(visit.visitedOn)}</span>
              )}
            </div>

            {visit.photos.length > 0 && (
              <div className="grid grid-cols-2 gap-1">
                {visit.photos.map((photo, index) => (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => setLightbox({ photos: visit.photos, index })}
                    className="relative aspect-square overflow-hidden rounded-md bg-neutral-200"
                  >
                    <Image src={photo.url} alt="" fill sizes="200px" className="object-cover" />
                  </button>
                ))}
              </div>
            )}

            {visit.rating ? (
              <p style={{ color: "var(--accent)" }}>{"★".repeat(visit.rating)}</p>
            ) : null}
            {visit.note && (
              <p className="text-neutral-600 dark:text-neutral-400">{visit.note}</p>
            )}

            <div
              className="flex items-center gap-4 border-t pt-2"
              style={{ borderColor: "var(--divider)" }}
            >
              <button
                type="button"
                onClick={() => onSelect(visit)}
                className="text-xs font-medium hover:underline"
                style={{ color: "var(--accent)" }}
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(visit)}
                className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onAddNew}
          className="flex-1 rounded-[var(--radius-md)] px-4 py-2 text-sm font-medium text-white"
          style={{ background: "var(--accent)" }}
        >
          + Add new record
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-[var(--radius-md)] border px-4 py-2 text-sm font-medium"
          style={{ borderColor: "var(--divider)" }}
        >
          Close
        </button>
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4">
          <div
            className="w-full max-w-sm rounded-[var(--radius-lg)] p-5"
            style={{ background: "var(--surface)" }}
          >
            <p className="mb-4 text-sm">Delete this record? This can&apos;t be undone.</p>
            {deleteMutation.isError && (
              <p className="mb-4 text-sm text-red-600">Failed to delete. Please try again.</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="rounded-[var(--radius-md)] border px-4 py-2 text-sm font-medium"
                style={{ borderColor: "var(--divider)" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(confirmDelete.id)}
                disabled={deleteMutation.isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-xl text-white"
            aria-label="Close"
          >
            ×
          </button>

          {lightbox.photos.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  showRelativePhoto(-1);
                }}
                className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/20 text-2xl text-white sm:left-4"
                aria-label="Previous photo"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  showRelativePhoto(1);
                }}
                className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/20 text-2xl text-white sm:right-4"
                aria-label="Next photo"
              >
                ›
              </button>
              <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/20 px-3 py-1 text-xs text-white">
                {lightbox.index + 1} / {lightbox.photos.length}
              </span>
            </>
          )}

          <div onClick={(e) => e.stopPropagation()}>
            <Image
              src={lightbox.photos[lightbox.index].url}
              alt=""
              width={1200}
              height={1200}
              className="max-h-[85vh] w-auto max-w-full rounded-lg object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function VisitEntryForm({
  municipality,
  municipalityLocked,
  onMunicipalityChange,
  existingVisit,
  onBack,
  onClose,
}: {
  municipality: Municipality | null;
  municipalityLocked: boolean;
  onMunicipalityChange: (municipality: Municipality) => void;
  existingVisit: Visit | undefined;
  onBack: (() => void) | undefined;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [pickerPrefectureId, setPickerPrefectureId] = useState<number | null>(
    municipality?.prefectureId ?? null,
  );
  const prefecturesQuery = useQuery({ queryKey: ["prefectures"], queryFn: geoApi.prefectures });
  const municipalitiesQuery = useQuery({
    queryKey: ["municipalities", pickerPrefectureId],
    queryFn: () => geoApi.municipalities(pickerPrefectureId!),
    enabled: pickerPrefectureId !== null,
  });
  // Already fetched (and cached) by the map page whenever the editor is
  // opened from there — this just reuses that cache, no extra request in
  // the common case.
  const allVisitsQuery = useQuery({ queryKey: ["visits"], queryFn: () => visitsApi.list() });

  // Recently logged cities, most-recent first, excluding whichever city is
  // currently selected — a quick way to log a second record for a place
  // you were just at without hunting through the prefecture/city selects.
  const recentMunicipalities = useMemo(() => {
    const byId = new Map<number, { municipality: Municipality; visitedOn: string | null }>();
    for (const v of allVisitsQuery.data ?? []) {
      if (v.municipalityId === municipality?.id) continue;
      const existing = byId.get(v.municipalityId);
      if (!existing || (v.visitedOn && (!existing.visitedOn || v.visitedOn > existing.visitedOn))) {
        byId.set(v.municipalityId, { municipality: v.municipality, visitedOn: v.visitedOn });
      }
    }
    return Array.from(byId.values())
      .sort((a, b) => (b.visitedOn ?? "").localeCompare(a.visitedOn ?? ""))
      .slice(0, 2)
      .map((e) => e.municipality);
  }, [allVisitsQuery.data, municipality?.id]);

  // Other municipalities in the same prefecture, ranked by centroid
  // distance from the currently selected one — "nearby" is scoped to the
  // current prefecture rather than a nationwide search, since that's the
  // data already on hand (no extra requests per keystroke).
  const nearbyMunicipalities = useMemo(() => {
    if (!municipality || municipality.centroidLat === null || municipality.centroidLng === null) {
      return [];
    }
    const origin = { lat: municipality.centroidLat, lng: municipality.centroidLng };
    return (municipalitiesQuery.data ?? [])
      .filter(
        (m): m is Municipality & { centroidLat: number; centroidLng: number } =>
          m.id !== municipality.id && m.centroidLat !== null && m.centroidLng !== null,
      )
      .map((m) => ({ m, km: haversineKm(origin, { lat: m.centroidLat, lng: m.centroidLng }) }))
      .sort((a, b) => a.km - b.km)
      .slice(0, 2)
      .map((e) => e.m);
  }, [municipality, municipalitiesQuery.data]);

  function selectSuggestion(m: Municipality) {
    setPickerPrefectureId(m.prefectureId);
    onMunicipalityChange(m);
  }
  const [visitId, setVisitId] = useState<string | null>(existingVisit?.id ?? null);
  const [status, setStatus] = useState<VisitStatus>(
    existingVisit?.status ?? "visited",
  );
  const [visitedOn, setVisitedOn] = useState(existingVisit?.visitedOn ?? "");
  const [note, setNote] = useState(existingVisit?.note ?? "");
  const [rating, setRating] = useState(existingVisit?.rating ?? 0);
  const [photos, setPhotos] = useState<VisitPhoto[]>(existingVisit?.photos ?? []);
  const [photoError, setPhotoError] = useState(false);
  const [savingAnother, setSavingAnother] = useState(false);
  const [whereOpen, setWhereOpen] = useState(false);
  const [whereQuery, setWhereQuery] = useState("");
  const dateInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedPrefectureForDisplay = prefecturesQuery.data?.find(
    (p) => p.id === (municipality?.prefectureId ?? pickerPrefectureId),
  );
  function matchesWhere(nameEn: string, nameJa: string) {
    const q = whereQuery.trim();
    if (!q) return true;
    return nameEn.toLowerCase().includes(q.toLowerCase()) || nameJa.includes(q);
  }
  const prefectureOptions = (prefecturesQuery.data ?? []).filter((p) =>
    matchesWhere(p.nameEn, p.nameJa),
  );
  const municipalityOptions = (municipalitiesQuery.data ?? []).filter((m) =>
    matchesWhere(m.nameEn, m.nameJa),
  );

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["visits"] });
  }

  // Want-to-go dates are constrained to [today, today+3y], visited dates
  // to [1990-01-01, today+3y] — switching status can leave a previously
  // chosen date outside the new range, so drop it rather than keep an
  // invalid one silently selected.
  function handleStatusChange(next: VisitStatus) {
    setStatus(next);
    if (!visitedOn) return;
    const day = visitedOn.slice(0, 10);
    const min = next === "want_to_go" ? todayStr() : MIN_VISITED_DATE;
    const max = maxFutureDateStr();
    if (day < min || day > max) setVisitedOn("");
  }

  function currentData() {
    return {
      status,
      visitedOn: visitedOn || undefined,
      note: note || undefined,
      rating: rating || undefined,
    };
  }

  // Photo upload can happen before the record is ever explicitly saved —
  // the first upload silently creates it so there's a visitId to attach to.
  async function ensureVisitId(): Promise<string> {
    if (visitId) return visitId;
    if (!municipality) throw new Error("No city selected yet");
    const created = await visitsApi.create({
      municipalityId: municipality.id,
      ...currentData(),
    });
    setVisitId(created.id);
    invalidate();
    return created.id;
  }

  function backOrClose() {
    if (onBack) onBack();
    else onClose();
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const id = visitId;
      if (id) return visitsApi.update(id, currentData());
      if (!municipality) throw new Error("No city selected yet");
      return visitsApi.create({ municipalityId: municipality.id, ...currentData() });
    },
    onSuccess: () => {
      invalidate();
      backOrClose();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => visitsApi.remove(visitId!),
    onSuccess: () => {
      invalidate();
      backOrClose();
    },
  });

  // Saves the current record, same as the Save button, but resets the form
  // for a fresh entry instead of closing — for logging several places (or
  // several dates for the same place) in one sitting.
  async function handleSaveAndAddAnother() {
    if (!municipality) return;
    setSavingAnother(true);
    try {
      if (visitId) await visitsApi.update(visitId, currentData());
      else await visitsApi.create({ municipalityId: municipality.id, ...currentData() });
      invalidate();
      setVisitId(null);
      setStatus("visited");
      setVisitedOn("");
      setNote("");
      setRating(0);
      setPhotos([]);
      setPhotoError(false);
    } finally {
      setSavingAnother(false);
    }
  }

  const uploadPhotoMutation = useMutation({
    mutationFn: async (file: File) => {
      const id = await ensureVisitId();
      return photosApi.upload(id, file);
    },
    onMutate: () => setPhotoError(false),
    onSuccess: (photo) => {
      setPhotos((prev) => [...prev, photo]);
      invalidate();
    },
    onError: () => setPhotoError(true),
  });

  const removePhotoMutation = useMutation({
    mutationFn: (photoId: string) => photosApi.remove(photoId),
    onSuccess: (_, photoId) => {
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      invalidate();
    },
  });

  // Uploaded one at a time, awaited in sequence rather than fired
  // concurrently — the first upload lazily creates the visit via
  // ensureVisitId(), and starting several at once before that finishes
  // would race and create duplicate visits.
  async function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    for (const file of files) {
      await uploadPhotoMutation.mutateAsync(file).catch(() => {});
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="self-start text-xs hover:underline"
          style={{ color: "var(--accent)" }}
        >
          ← Back to records
        </button>
      )}

      <div className="relative">
        <label className="flex flex-col gap-1 text-sm">
          Where
          <input
            type="text"
            disabled={municipalityLocked}
            value={
              whereOpen
                ? whereQuery
                : municipality
                  ? `${placeName(municipality.nameEn, municipality.nameJa)}${
                      selectedPrefectureForDisplay
                        ? ` — ${placeName(selectedPrefectureForDisplay.nameEn, selectedPrefectureForDisplay.nameJa)}`
                        : ""
                    }`
                  : whereQuery
            }
            onChange={(e) => setWhereQuery(e.target.value)}
            onFocus={() => {
              setWhereOpen(true);
              setWhereQuery("");
            }}
            onBlur={() => setTimeout(() => setWhereOpen(false), 150)}
            placeholder="Search prefecture or city"
            className="rounded-[var(--radius-md)] border px-3 py-2 font-semibold disabled:opacity-60"
            style={{ borderColor: "var(--divider)", background: "var(--surface)" }}
          />
        </label>

        {whereOpen && !municipalityLocked && (
          <div
            className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-[var(--radius-md)] border py-1"
            style={{ borderColor: "var(--divider)", background: "var(--surface)", boxShadow: "var(--shadow-lg, 0 8px 24px rgba(29,42,42,.18))" }}
          >
            {pickerPrefectureId === null ? (
              prefectureOptions.length === 0 ? (
                <p className="px-3 py-2 text-sm text-neutral-500">No matching prefectures</p>
              ) : (
                prefectureOptions.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setPickerPrefectureId(p.id);
                      setWhereQuery("");
                    }}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--accent-100)]"
                  >
                    {placeName(p.nameEn, p.nameJa)}
                  </button>
                ))
              )
            ) : (
              <>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setPickerPrefectureId(null);
                    setWhereQuery("");
                  }}
                  className="block w-full px-3 py-2 text-left text-xs font-semibold hover:underline"
                  style={{ color: "var(--accent)" }}
                >
                  ← All prefectures
                </button>
                {municipalityOptions.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-neutral-500">No matching cities</p>
                ) : (
                  municipalityOptions.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        onMunicipalityChange(m);
                        setWhereQuery("");
                        setWhereOpen(false);
                      }}
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--accent-100)]"
                    >
                      {placeName(m.nameEn, m.nameJa)}
                    </button>
                  ))
                )}
              </>
            )}
          </div>
        )}
      </div>

      {!municipalityLocked && (recentMunicipalities.length > 0 || nearbyMunicipalities.length > 0) && (
        <div className="-mt-2 flex flex-wrap gap-1.5">
          {recentMunicipalities.map((m) => (
            <button
              key={`recent-${m.id}`}
              type="button"
              onClick={() => selectSuggestion(m)}
              className="rounded-full border px-2.5 py-1 text-xs whitespace-nowrap"
              style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
            >
              Recent · {m.nameEn} {m.nameJa}
            </button>
          ))}
          {nearbyMunicipalities.map((m) => (
            <button
              key={`nearby-${m.id}`}
              type="button"
              onClick={() => selectSuggestion(m)}
              className="rounded-full border px-2.5 py-1 text-xs whitespace-nowrap"
              style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
            >
              Nearby · {m.nameEn} {m.nameJa}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        {(
          [
            { value: "visited", label: "Visited" },
            { value: "want_to_go", label: "Want to go" },
          ] as const
        ).map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => handleStatusChange(option.value)}
            className="flex-1 rounded-[var(--radius-md)] border px-3 py-2 text-sm font-medium"
            style={
              status === option.value
                ? { borderColor: "var(--accent)", background: "var(--accent)", color: "#fff" }
                : { borderColor: "var(--divider)" }
            }
          >
            {option.label}
          </button>
        ))}
      </div>

      <label className="flex flex-col gap-1 text-sm">
        Date visited
        <div className="relative">
          {/* Native date input drives the real value and supplies the
              calendar popup, but its own displayed text follows the
              browser's locale (often mm/dd/yyyy) rather than dd/MM/yyyy —
              so it's kept invisible and a formatted text field sits on
              top, opening the same picker on click. */}
          <input
            ref={dateInputRef}
            type="date"
            value={visitedOn ?? ""}
            onChange={(e) => setVisitedOn(e.target.value)}
            min={status === "want_to_go" ? todayStr() : MIN_VISITED_DATE}
            max={maxFutureDateStr()}
            tabIndex={-1}
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
          />
          <input
            type="text"
            readOnly
            value={visitedOn ? formatDate(visitedOn) : ""}
            placeholder="dd/mm/yyyy"
            onClick={() => dateInputRef.current?.showPicker?.()}
            className="w-full cursor-pointer rounded-[var(--radius-md)] border px-3 py-2"
            style={{ borderColor: "var(--divider)", background: "var(--surface)" }}
          />
        </div>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Note
        <textarea
          value={note ?? ""}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className="rounded-[var(--radius-md)] border px-3 py-2"
          style={{ borderColor: "var(--divider)", background: "var(--surface)" }}
        />
      </label>

      <div className="flex flex-col gap-1 text-sm">
        Rating
        <div className="flex gap-1 text-xl">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n === rating ? 0 : n)}
              style={{ color: n <= rating ? "var(--accent)" : "var(--neutral-400)" }}
            >
              ★
            </button>
          ))}
        </div>
      </div>

      {status === "visited" && (
        <div className="flex flex-col gap-1 text-sm">
          Photos
          <div className="flex flex-wrap gap-2">
            {photos.map((photo) => (
              <div key={photo.id} className="group relative h-16 w-16">
                <Image
                  src={photo.url}
                  alt=""
                  fill
                  sizes="64px"
                  className="rounded object-cover"
                />
                <button
                  type="button"
                  onClick={() => removePhotoMutation.mutate(photo.id)}
                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-neutral-900 text-xs text-white"
                  aria-label="Remove photo"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadPhotoMutation.isPending || !municipality}
              title={!municipality ? "Pick a city first" : undefined}
              className="flex h-16 w-16 items-center justify-center rounded-[var(--radius-sm)] border border-dashed text-2xl text-neutral-400 disabled:opacity-50"
              style={{ borderColor: "var(--divider)" }}
            >
              {uploadPhotoMutation.isPending ? "…" : "+"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={handleFilesSelected}
              className="hidden"
            />
          </div>
          {photoError && (
            <p className="text-sm text-red-600">Failed to upload photo. Please try again.</p>
          )}
        </div>
      )}

      {saveMutation.isError && (
        <p className="text-sm text-red-600">Failed to save. Please try again.</p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !municipality}
          title={!municipality ? "Pick a city first" : undefined}
          className="flex-1 rounded-[var(--radius-md)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          style={{ background: "var(--accent)" }}
        >
          {saveMutation.isPending ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={handleSaveAndAddAnother}
          disabled={savingAnother || !municipality}
          className="rounded-[var(--radius-md)] border px-4 py-2 text-sm font-medium disabled:opacity-50"
          style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
        >
          {savingAnother ? "Saving..." : "Save & add another"}
        </button>
        {visitId && (
          <button
            type="button"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            className="rounded-[var(--radius-md)] border border-red-300 px-4 py-2 text-sm font-medium text-red-600 disabled:opacity-50 dark:border-red-800 dark:text-red-400"
          >
            Delete
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="rounded-[var(--radius-md)] border px-4 py-2 text-sm font-medium"
          style={{ borderColor: "var(--divider)" }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
