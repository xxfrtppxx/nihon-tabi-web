"use client";

import { useEffect, useRef, useState } from "react";
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
  const [visitId, setVisitId] = useState<string | null>(existingVisit?.id ?? null);
  const [status, setStatus] = useState<VisitStatus>(
    existingVisit?.status ?? "visited",
  );
  const [visitedOn, setVisitedOn] = useState(existingVisit?.visitedOn ?? "");
  const [note, setNote] = useState(existingVisit?.note ?? "");
  const [rating, setRating] = useState(existingVisit?.rating ?? 0);
  const [photos, setPhotos] = useState<VisitPhoto[]>(existingVisit?.photos ?? []);
  const [photoError, setPhotoError] = useState(false);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          Prefecture
          <select
            value={pickerPrefectureId ?? ""}
            disabled={municipalityLocked}
            onChange={(e) => setPickerPrefectureId(Number(e.target.value))}
            className="rounded-[var(--radius-md)] border px-3 py-2 disabled:opacity-60"
            style={{ borderColor: "var(--divider)", background: "var(--surface)" }}
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
            value={municipality?.id ?? ""}
            disabled={municipalityLocked || pickerPrefectureId === null}
            onChange={(e) => {
              const m = municipalitiesQuery.data?.find((m) => m.id === Number(e.target.value));
              if (m) onMunicipalityChange(m);
            }}
            className="rounded-[var(--radius-md)] border px-3 py-2 disabled:opacity-60"
            style={{ borderColor: "var(--divider)", background: "var(--surface)" }}
          >
            <option value="" disabled>
              Select city/district
            </option>
            {municipalitiesQuery.data?.map((m) => (
              <option key={m.id} value={m.id}>
                {placeName(m.nameEn, m.nameJa)}
              </option>
            ))}
          </select>
        </label>
      </div>

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
