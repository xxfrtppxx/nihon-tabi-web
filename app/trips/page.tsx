"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tripsApi } from "@/lib/api";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { formatDate } from "@/lib/format";

export default function TripsPage() {
  const { user, loading } = useRequireAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");

  const tripsQuery = useQuery({
    queryKey: ["trips"],
    queryFn: tripsApi.list,
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: () => tripsApi.create({ title: title.trim() }),
    onSuccess: (trip) => {
      queryClient.invalidateQueries({ queryKey: ["trips"] });
      router.push(`/trips/${trip.id}`);
    },
  });

  if (loading || !user) return null;

  const trips = tripsQuery.data ?? [];

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6 flex items-end justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight">Your trips</h1>
        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded-[var(--radius-md)] px-4 py-2 text-sm font-semibold text-white"
            style={{ background: "var(--accent)" }}
          >
            + New trip
          </button>
        )}
      </div>

      {creating && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim()) createMutation.mutate();
          }}
          className="mb-8 flex flex-col gap-3 rounded-[var(--radius-lg)] p-5"
          style={{ background: "var(--surface)", border: "1px solid var(--divider)" }}
        >
          <label className="flex flex-col gap-1 text-sm">
            Trip title
            <input
              type="text"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Kansai loop"
              className="rounded-[var(--radius-md)] border px-3 py-2"
              style={{ borderColor: "var(--divider)", background: "var(--background)" }}
            />
          </label>
          {createMutation.isError && (
            <p className="text-sm" style={{ color: "var(--plan-700)" }}>
              Failed to create trip. Please try again.
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!title.trim() || createMutation.isPending}
              className="rounded-[var(--radius-md)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--accent)" }}
            >
              {createMutation.isPending ? "Creating..." : "Create trip"}
            </button>
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setTitle("");
              }}
              className="rounded-[var(--radius-md)] border px-4 py-2 text-sm font-semibold"
              style={{ borderColor: "var(--divider)" }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {tripsQuery.isLoading && <p className="text-neutral-500">Loading...</p>}

      {tripsQuery.data && trips.length === 0 && (
        <p className="text-neutral-500">
          No trips yet — group a few visits into a journey to see it here.
        </p>
      )}

      <ul className="flex flex-col">
        {trips.map((trip) => (
          <li key={trip.id}>
            <Link
              href={`/trips/${trip.id}`}
              className="flex items-center justify-between gap-4 border-b py-5 hover:bg-[var(--accent-100)]"
              style={{ borderColor: "var(--divider)" }}
            >
              <div>
                <h2 className="text-xl font-extrabold tracking-tight">{trip.title}</h2>
                <p className="mt-1 text-sm text-neutral-600">
                  {trip.startDate ? formatDate(trip.startDate) : "No dates yet"}
                  {trip.endDate ? ` – ${formatDate(trip.endDate)}` : ""}
                </p>
              </div>
              <div className="flex flex-none gap-5 text-right">
                <div>
                  <p className="text-lg font-extrabold tabular-nums">{trip.dayCount}</p>
                  <p className="text-xs text-neutral-500 uppercase">Days</p>
                </div>
                <div>
                  <p className="text-lg font-extrabold tabular-nums">{trip.cityCount}</p>
                  <p className="text-xs text-neutral-500 uppercase">Cities</p>
                </div>
                <div>
                  <p className="text-lg font-extrabold tabular-nums">{trip.totalKm}</p>
                  <p className="text-xs text-neutral-500 uppercase">km</p>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
