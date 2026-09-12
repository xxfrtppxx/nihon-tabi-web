"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { visitsApi, type Municipality, type Visit, type VisitStatus } from "@/lib/api";
import { formatDate, placeName } from "@/lib/format";

export function VisitEditor({
  municipality,
  existingVisit,
  onClose,
}: {
  municipality: Municipality;
  existingVisit: Visit | undefined;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<VisitStatus>(
    existingVisit?.status ?? "visited",
  );
  const [visitedOn, setVisitedOn] = useState(existingVisit?.visitedOn ?? "");
  const [note, setNote] = useState(existingVisit?.note ?? "");
  const [rating, setRating] = useState(existingVisit?.rating ?? 0);
  const dateInputRef = useRef<HTMLInputElement>(null);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["visits"] });
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const data = {
        status,
        visitedOn: visitedOn || undefined,
        note: note || undefined,
        rating: rating || undefined,
      };
      return existingVisit
        ? visitsApi.update(existingVisit.id, data)
        : visitsApi.create({ municipalityId: municipality.id, ...data });
    },
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => visitsApi.remove(existingVisit!.id),
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl bg-white p-6 dark:bg-neutral-900 sm:rounded-2xl">
        <div className="mb-4">
          <h2 className="text-lg font-bold">
            {placeName(municipality.nameEn, municipality.nameJa)}
          </h2>
        </div>

        <div className="flex flex-col gap-4">
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
                onClick={() => setStatus(option.value)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                  status === option.value
                    ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                    : "border-neutral-300 dark:border-neutral-700"
                }`}
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
                className="w-full cursor-pointer rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800"
              />
            </div>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Note
            <textarea
              value={note ?? ""}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800"
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
                  className={n <= rating ? "text-amber-500" : "text-neutral-300 dark:text-neutral-700"}
                >
                  ★
                </button>
              ))}
            </div>
          </div>

          {saveMutation.isError && (
            <p className="text-sm text-red-600">Failed to save. Please try again.</p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="flex-1 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
            >
              {saveMutation.isPending ? "Saving..." : "Save"}
            </button>
            {existingVisit && (
              <button
                type="button"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 disabled:opacity-50 dark:border-red-800 dark:text-red-400"
              >
                Delete
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium dark:border-neutral-700"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
