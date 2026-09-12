"use client";

import { useQuery } from "@tanstack/react-query";
import { visitsApi } from "@/lib/api";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { formatDate, placeName } from "@/lib/format";

export default function VisitsPage() {
  const { user, loading } = useRequireAuth();
  const visitsQuery = useQuery({
    queryKey: ["visits"],
    queryFn: () => visitsApi.list(),
    enabled: !!user,
  });

  if (loading || !user) return null;

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-bold">Your visits</h1>

      {visitsQuery.isLoading && <p>Loading...</p>}
      {visitsQuery.data?.length === 0 && (
        <p className="text-neutral-500">
          No visits yet — head to the map and pick a city to log one.
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {visitsQuery.data?.map((visit) => (
          <li
            key={visit.id}
            className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">
                  {placeName(visit.municipality.nameEn, visit.municipality.nameJa)}{" "}
                  <span className="text-sm font-normal text-neutral-500">
                    {placeName(
                      visit.municipality.prefecture.nameEn,
                      visit.municipality.prefecture.nameJa,
                    )}
                  </span>
                </p>
                {visit.visitedOn && (
                  <p className="text-sm text-neutral-500">
                    {formatDate(visit.visitedOn)}
                  </p>
                )}
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  visit.status === "visited"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
                }`}
              >
                {visit.status === "visited" ? "Visited" : "Want to go"}
              </span>
            </div>
            {visit.rating ? (
              <p className="mt-1 text-amber-500">{"★".repeat(visit.rating)}</p>
            ) : null}
            {visit.note && <p className="mt-2 text-sm">{visit.note}</p>}
          </li>
        ))}
      </ul>
    </main>
  );
}
