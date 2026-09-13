"use client";

import { useMemo } from "react";
import { boundsOfFeatureCollection, boundsOfGeometry, pointInGeometry, type LngLatBounds } from "@/lib/geo";

// Decorative dot-matrix rendering of Japan built from the same real GADM
// prefecture polygons the map already fetches (no extra network calls, no
// d3/topojson dependency). One cell per sampled point: filled = visited,
// open ring = want to go, faint = not yet. A point is only drawn at all
// when it falls inside some prefecture's real geometry, so the dots trace
// the country's actual coastline rather than a synthetic one.
//
// Used two places: as a floating "Coverage" inset over the Atlas map
// (CoverageDotMatrix below) and as the static map-shaped visual in the
// Stats page's right column (dashboard imports useDotMatrix + DotMatrixSvg
// directly) — both need the same dots, only the surrounding chrome differs.
const GRID_COLS = 34;
const GRID_ROWS = 34;
export const DOT_MATRIX_VIEW_SIZE = 120;

type DotStatus = "visited" | "want_to_go" | "mixed" | "none";
export type Dot = { x: number; y: number; status: DotStatus };

function project(
  [lng, lat]: [number, number],
  bounds: LngLatBounds,
  viewSize: number,
): [number, number] {
  const [[minLng, minLat], [maxLng, maxLat]] = bounds;
  const w = maxLng - minLng || 1;
  const h = maxLat - minLat || 1;
  const scale = (viewSize * 0.94) / Math.max(w, h);
  const offsetX = (viewSize - w * scale) / 2;
  const offsetY = (viewSize - h * scale) / 2;
  const x = (lng - minLng) * scale + offsetX;
  const y = viewSize - ((lat - minLat) * scale + offsetY);
  return [x, y];
}

export function useDotMatrix({
  prefecturesGeoJSON,
  visitedPrefectureIds,
  wantPrefectureIds,
  mixedPrefectureIds,
}: {
  prefecturesGeoJSON: GeoJSON.FeatureCollection | null;
  visitedPrefectureIds: number[];
  wantPrefectureIds: number[];
  mixedPrefectureIds: number[];
}): Dot[] {
  return useMemo(() => {
    if (!prefecturesGeoJSON || prefecturesGeoJSON.features.length === 0) return [];
    const bounds = boundsOfFeatureCollection(prefecturesGeoJSON);
    if (!bounds) return [];

    const visited = new Set(visitedPrefectureIds);
    const want = new Set(wantPrefectureIds);
    const mixed = new Set(mixedPrefectureIds);

    const features = prefecturesGeoJSON.features
      .map((f) => ({
        id: f.properties?.id as number | undefined,
        geometry: f.geometry,
        bbox: boundsOfGeometry(f.geometry),
      }))
      .filter((f) => f.bbox !== null) as {
      id: number | undefined;
      geometry: GeoJSON.Geometry;
      bbox: LngLatBounds;
    }[];

    const [[minLng, minLat], [maxLng, maxLat]] = bounds;
    const result: Dot[] = [];

    for (let row = 0; row < GRID_ROWS; row++) {
      const lat = minLat + ((row + 0.5) / GRID_ROWS) * (maxLat - minLat);
      for (let col = 0; col < GRID_COLS; col++) {
        const lng = minLng + ((col + 0.5) / GRID_COLS) * (maxLng - minLng);

        let status: DotStatus | null = null;
        for (const f of features) {
          const [[bMinLng, bMinLat], [bMaxLng, bMaxLat]] = f.bbox;
          if (lng < bMinLng || lng > bMaxLng || lat < bMinLat || lat > bMaxLat) continue;
          if (!pointInGeometry([lng, lat], f.geometry)) continue;
          if (f.id !== undefined) {
            status = mixed.has(f.id)
              ? "mixed"
              : visited.has(f.id)
                ? "visited"
                : want.has(f.id)
                  ? "want_to_go"
                  : "none";
          } else {
            status = "none";
          }
          break;
        }
        if (status === null) continue;
        const [x, y] = project([lng, lat], bounds, DOT_MATRIX_VIEW_SIZE);
        result.push({ x, y, status });
      }
    }
    return result;
  }, [prefecturesGeoJSON, visitedPrefectureIds, wantPrefectureIds, mixedPrefectureIds]);
}

export function DotMatrixSvg({ dots, size = DOT_MATRIX_VIEW_SIZE }: { dots: Dot[]; size?: number }) {
  return (
    <svg width={size} height={size} viewBox={`0 0 ${DOT_MATRIX_VIEW_SIZE} ${DOT_MATRIX_VIEW_SIZE}`}>
      {dots.map((d, i) => {
        if (d.status === "visited" || d.status === "mixed") {
          return <rect key={i} x={d.x - 0.9} y={d.y - 0.9} width={1.8} height={1.8} rx={0.4} fill="var(--accent)" />;
        }
        if (d.status === "want_to_go") {
          return (
            <rect
              key={i}
              x={d.x - 0.9}
              y={d.y - 0.9}
              width={1.8}
              height={1.8}
              rx={0.4}
              fill="none"
              stroke="var(--plan)"
              strokeWidth={0.5}
            />
          );
        }
        return <rect key={i} x={d.x - 0.6} y={d.y - 0.6} width={1.2} height={1.2} rx={0.3} fill="var(--neutral-400)" />;
      })}
    </svg>
  );
}

export function CoverageDotMatrix(props: {
  prefecturesGeoJSON: GeoJSON.FeatureCollection | null;
  visitedPrefectureIds: number[];
  wantPrefectureIds: number[];
  mixedPrefectureIds: number[];
}) {
  const dots = useDotMatrix(props);
  if (dots.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute right-6 top-6 z-10 rounded-[var(--radius-md)] px-3 py-3"
      style={{ background: "var(--background)", border: "1px solid var(--divider)" }}
    >
      <DotMatrixSvg dots={dots} />
    </div>
  );
}
