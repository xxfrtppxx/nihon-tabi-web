"use client";

import { useRequireAuth } from "@/hooks/use-require-auth";

// Static placeholder — Trips (grouping visits into a journey) has no
// backend support yet (would need a new entity in the separate
// nihon-tabi-api repo). This page exists only so the nav's Trips tab has
// somewhere to land; the data below is illustrative, not real.
const SAMPLE_TRIP = {
  season: "Spring 2025",
  days: 9,
  title: "Kansai loop",
  cityCount: 7,
  photoCount: 41,
  km: 612,
  itinerary: [
    { day: 1, city: "Osaka", ja: "大阪市", note: "Landed, first taste of takoyaki in Dotonbori." },
    { day: 2, city: "Osaka", ja: "大阪市", note: "Osaka Castle, Shinsekai at night." },
    { day: 3, city: "Kyoto", ja: "京都市", note: "Fushimi Inari at 5am — empty gates all the way up." },
    { day: 4, city: "Kyoto", ja: "京都市", note: "Arashiyama, too many people." },
    { day: 5, city: "Nara", ja: "奈良市", note: "Deer park, Todai-ji." },
  ],
};

export default function TripsPage() {
  const { user, loading } = useRequireAuth();

  if (loading || !user) return null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <div
        className="mb-6 rounded-[var(--radius-md)] px-4 py-2 text-xs"
        style={{ background: "var(--plan-100)", color: "var(--plan-700)" }}
      >
        Preview — trips aren&apos;t saved yet. This page shows what grouping
        your visits into a journey could look like.
      </div>

      <div
        className="flex items-end justify-between border-b pb-4"
        style={{ borderColor: "var(--divider)" }}
      >
        <div>
          <p className="mb-2 text-xs font-semibold tracking-[0.14em] text-neutral-500 uppercase">
            {SAMPLE_TRIP.season} · {SAMPLE_TRIP.days} days
          </p>
          <h1 className="text-4xl font-black tracking-tight">{SAMPLE_TRIP.title}</h1>
        </div>
        <div className="flex gap-6 text-right">
          <div>
            <p className="text-3xl font-extrabold">{SAMPLE_TRIP.cityCount}</p>
            <p className="text-xs text-neutral-500">Cities</p>
          </div>
          <div>
            <p className="text-3xl font-extrabold">{SAMPLE_TRIP.photoCount}</p>
            <p className="text-xs text-neutral-500">Photos</p>
          </div>
          <div>
            <p className="text-3xl font-extrabold">{SAMPLE_TRIP.km}</p>
            <p className="text-xs text-neutral-500">km</p>
          </div>
        </div>
      </div>

      <ul className="mt-2">
        {SAMPLE_TRIP.itinerary.map((d) => (
          <li
            key={d.day}
            className="grid grid-cols-[56px_1fr] gap-6 border-b py-4"
            style={{ borderColor: "var(--neutral-300)" }}
          >
            <div>
              <p className="text-xs text-neutral-500">Day</p>
              <p className="text-2xl font-extrabold">{d.day}</p>
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="font-bold">{d.city}</span>
                <span className="text-sm text-neutral-500">{d.ja}</span>
              </div>
              <p className="mt-1 text-sm text-neutral-600">{d.note}</p>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
