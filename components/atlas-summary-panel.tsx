import { useMemo } from "react";
import { formatDate, placeName } from "@/lib/format";
import type { Visit } from "@/lib/api";

// The mockup's Atlas country view has a right-hand "Latest" + "This year"
// panel. Every number here is derived from visits already fetched by the
// map page — no new endpoints, and nothing invented (the mockup's "Trips"
// tile has no backing concept in this app, so it's replaced with "Records",
// a real count of visit entries logged this year).
export function AtlasSummaryPanel({ visits }: { visits: Visit[] }) {
  const latest = useMemo(
    () =>
      [...visits]
        .filter((v) => v.visitedOn)
        .sort((a, b) => (a.visitedOn! < b.visitedOn! ? 1 : -1))
        .slice(0, 4),
    [visits],
  );

  const yearStats = useMemo(() => {
    const thisYear = new Date().getFullYear();
    const thisYearVisits = visits.filter(
      (v) => v.visitedOn && new Date(v.visitedOn).getFullYear() === thisYear,
    );
    const cities = new Set(thisYearVisits.map((v) => v.municipalityId)).size;
    const photos = thisYearVisits.reduce((sum, v) => sum + v.photos.length, 0);
    const records = thisYearVisits.length;

    // A prefecture counts as "new" this year if the earliest dated visit to
    // it (across all years) falls in the current year.
    const firstYearByPrefecture = new Map<number, number>();
    for (const v of visits) {
      if (!v.visitedOn) continue;
      const year = new Date(v.visitedOn).getFullYear();
      const prefId = v.municipality.prefectureId;
      const current = firstYearByPrefecture.get(prefId);
      if (current === undefined || year < current) firstYearByPrefecture.set(prefId, year);
    }
    const newPrefectures = [...firstYearByPrefecture.values()].filter(
      (y) => y === thisYear,
    ).length;

    return { cities, photos, records, newPrefectures };
  }, [visits]);

  return (
    <aside
      className="flex w-[300px] flex-none flex-col gap-5 overflow-y-auto border-l p-5"
      style={{ borderColor: "var(--divider)" }}
    >
      <div>
        <div className="mb-2.5 text-[10px] font-semibold tracking-[0.14em] text-neutral-600 uppercase">
          Latest
        </div>
        {latest.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Log a visit and it&apos;ll show up here.
          </p>
        ) : (
          <ul className="flex flex-col">
            {latest.map((v) => (
              <li
                key={v.id}
                className="border-b py-2.5"
                style={{ borderColor: "var(--neutral-300)" }}
              >
                <div className="flex justify-between gap-2">
                  <span className="text-sm font-semibold">{v.municipality.nameEn}</span>
                  <span className="text-[11px] tabular-nums text-neutral-600">
                    {formatDate(v.visitedOn!)}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-neutral-600">
                  {placeName(v.municipality.prefecture.nameEn, v.municipality.prefecture.nameJa)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="mb-2.5 text-[10px] font-semibold tracking-[0.14em] text-neutral-600 uppercase">
          This year
        </div>
        <div className="grid grid-cols-2 gap-0.5">
          <div className="rounded-[var(--radius-md)] p-3" style={{ background: "var(--neutral-200)" }}>
            <div className="text-[32px] leading-none font-extrabold tabular-nums">
              {yearStats.cities}
            </div>
            <div className="mt-1.5 text-[11px] font-semibold tracking-wide text-neutral-600 uppercase">
              Cities
            </div>
          </div>
          <div className="rounded-[var(--radius-md)] p-3" style={{ background: "var(--neutral-200)" }}>
            <div className="text-[32px] leading-none font-extrabold tabular-nums">
              {yearStats.records}
            </div>
            <div className="mt-1.5 text-[11px] font-semibold tracking-wide text-neutral-600 uppercase">
              Records
            </div>
          </div>
          <div className="rounded-[var(--radius-md)] p-3 text-white" style={{ background: "var(--accent)" }}>
            <div className="text-[32px] leading-none font-extrabold tabular-nums">
              {yearStats.photos}
            </div>
            <div className="mt-1.5 text-[11px] font-semibold tracking-wide uppercase">
              Photos
            </div>
          </div>
          <div className="rounded-[var(--radius-md)] p-3" style={{ background: "var(--neutral-200)" }}>
            <div className="text-[32px] leading-none font-extrabold tabular-nums">
              {yearStats.newPrefectures}
            </div>
            <div className="mt-1.5 text-[11px] font-semibold tracking-wide text-neutral-600 uppercase">
              New prefs
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
