"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { visitsApi, type Visit, type VisitStatus } from "@/lib/api";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { dayAndMonth, placeName } from "@/lib/format";

type Filter = "all" | VisitStatus | "with_photos";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "visited", label: "Visited" },
  { value: "want_to_go", label: "Want to go" },
  { value: "with_photos", label: "With photos" },
];

function matchesFilter(visit: Visit, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "with_photos") return visit.photos.length > 0;
  return visit.status === filter;
}

export default function VisitsPage() {
  const { user, loading } = useRequireAuth();
  const [filter, setFilter] = useState<Filter>("all");
  const [newestFirst, setNewestFirst] = useState(true);
  const visitsQuery = useQuery({
    queryKey: ["visits"],
    queryFn: () => visitsApi.list(),
    enabled: !!user,
  });

  const groups = useMemo(() => {
    const filtered = (visitsQuery.data ?? []).filter((v) => matchesFilter(v, filter));
    const dated = filtered
      .filter((v) => v.visitedOn)
      .sort((a, b) => {
        const cmp = a.visitedOn! < b.visitedOn! ? -1 : 1;
        return newestFirst ? -cmp : cmp;
      });
    const undated = filtered.filter((v) => !v.visitedOn);

    const byYear = new Map<string, Visit[]>();
    for (const v of dated) {
      const year = v.visitedOn!.slice(0, 4);
      const list = byYear.get(year);
      if (list) list.push(v);
      else byYear.set(year, [v]);
    }
    const years = Array.from(byYear.keys()).sort((a, b) =>
      newestFirst ? b.localeCompare(a) : a.localeCompare(b),
    );
    const result = years.map((year) => {
      const visits = byYear.get(year)!;
      const prefectures = new Set(visits.map((v) => v.municipality.prefectureId));
      return { year, visits, prefectureCount: prefectures.size };
    });
    if (undated.length > 0) {
      result.push({ year: "Undated", visits: undated, prefectureCount: 0 });
    }
    return result;
  }, [visitsQuery.data, filter, newestFirst]);

  if (loading || !user) return null;

  return (
    <main className="mx-auto max-w-4xl px-6 py-8 sm:px-10">
      <h1 className="mb-6 text-2xl font-extrabold tracking-tight">Your visits</h1>

      {visitsQuery.isLoading && <p>Loading...</p>}

      {visitsQuery.data && visitsQuery.data.length === 0 && (
        <p className="text-neutral-500">
          No visits yet — head to the map and pick a city to log one.
        </p>
      )}

      {visitsQuery.data && visitsQuery.data.length > 0 && (
        <>
          <div
            className="mb-6 flex flex-wrap items-center gap-2 border-b pb-4"
            style={{ borderColor: "var(--divider)" }}
          >
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className="rounded-full px-3 py-1 text-xs font-semibold"
                style={
                  filter === f.value
                    ? { background: "var(--accent-100)", color: "var(--accent-700)" }
                    : { border: "1px solid var(--accent)", color: "var(--accent)" }
                }
              >
                {f.label}
              </button>
            ))}
            <div className="flex-1" />
            <button
              onClick={() => setNewestFirst((v) => !v)}
              className="text-xs font-semibold tracking-wide text-neutral-600 uppercase"
            >
              Sort · {newestFirst ? "Newest" : "Oldest"}
            </button>
          </div>

          {groups.length === 0 && (
            <p className="text-neutral-500">No visits match this filter.</p>
          )}

          {groups.map((group) => (
            <section key={group.year} className="mb-2">
              <div
                className="flex items-baseline gap-4 border-b pb-3 pt-6 first:pt-0"
                style={{ borderColor: "var(--divider)" }}
              >
                <span className="text-4xl font-black tracking-tight tabular-nums">
                  {group.year}
                </span>
                <span className="text-xs font-semibold tracking-wide text-neutral-600 uppercase">
                  {group.visits.length} record{group.visits.length === 1 ? "" : "s"}
                  {group.prefectureCount > 0 &&
                    ` · ${group.prefectureCount} prefecture${group.prefectureCount === 1 ? "" : "s"}`}
                </span>
              </div>

              {group.visits.map((visit) => {
                const dm = visit.visitedOn ? dayAndMonth(visit.visitedOn) : null;
                const extraPhotos = visit.photos.length - 2;
                return (
                  <article
                    key={visit.id}
                    className="grid grid-cols-[64px_1fr] gap-5 border-b py-5 sm:grid-cols-[96px_1fr_260px] sm:gap-7"
                    style={{ borderColor: "var(--neutral-300)" }}
                  >
                    <div>
                      {dm ? (
                        <>
                          <div className="text-lg font-bold tabular-nums">{dm.day}</div>
                          <div className="mt-0.5 text-xs font-semibold tracking-wide text-neutral-600 uppercase">
                            {dm.month}
                          </div>
                        </>
                      ) : (
                        <div className="text-lg text-neutral-400">—</div>
                      )}
                    </div>

                    <div>
                      <div className="flex flex-wrap items-baseline gap-2">
                        <h3 className="text-xl font-extrabold tracking-tight sm:text-2xl">
                          {visit.municipality.nameEn}
                        </h3>
                        <span className="text-sm text-neutral-600">
                          {placeName(
                            visit.municipality.prefecture.nameEn,
                            visit.municipality.prefecture.nameJa,
                          )}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <span
                          className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
                          style={
                            visit.status === "visited"
                              ? { background: "var(--accent-100)", color: "var(--accent-700)" }
                              : { background: "var(--plan-100)", color: "var(--plan-700)" }
                          }
                        >
                          {visit.status === "visited" ? "Visited" : "Want to go"}
                        </span>
                        {visit.rating ? (
                          <span style={{ color: "var(--accent)" }}>
                            {"★".repeat(visit.rating)}
                          </span>
                        ) : null}
                      </div>
                      {visit.note && (
                        <p className="mt-3 max-w-[52ch] text-sm text-neutral-800">{visit.note}</p>
                      )}
                    </div>

                    {visit.photos.length > 0 && (
                      <div className="col-span-2 grid grid-cols-2 gap-0.5 sm:col-span-1">
                        {visit.photos.slice(0, 2).map((photo, i) => (
                          <div
                            key={photo.id}
                            className="relative aspect-[4/3] overflow-hidden rounded-[var(--radius-sm)]"
                            style={{ background: "var(--neutral-200)" }}
                          >
                            <Image src={photo.url} alt="" fill sizes="150px" className="object-cover" />
                            {i === 1 && extraPhotos > 0 && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm font-semibold text-white">
                                +{extraPhotos}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
            </section>
          ))}
        </>
      )}
    </main>
  );
}
