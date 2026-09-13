"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type WheelEvent } from "react";
import { boundsOfFeatureCollection, boundsOfGeometry, pointInGeometry, type LngLatBounds } from "@/lib/geo";

// General-purpose dot-matrix rendering of a GeoJSON region — the Atlas's
// primary map visual (per the redesign), not just a decorative overlay.
// One cell per sampled grid point: filled = visited, open ring = want to
// go, faint = not yet. A point only renders when it falls inside some
// feature's real geometry, so the dots trace the actual coastline/border
// rather than a synthetic shape. Works at country scope (prefectures) and
// at prefecture scope (municipalities) by passing a different geojson +
// classify function + bbox.
export type DotStatus = "visited" | "want_to_go" | "mixed" | "none";
export type Dot = { x: number; y: number; status: DotStatus };
export type LngLat = [number, number];

// The whole-region fit is the zoomed-out limit (there's nothing further out
// to show); zooming in tops out at 4x size.
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

// Fits the real lng/lat bounds into a viewW x viewH box (not necessarily
// square) — using the container's actual aspect ratio, rather than padding
// a square, is what lets an elongated shape like Japan's archipelago fill
// most of the box instead of leaving large empty margins.
function project(
  [lng, lat]: LngLat,
  bounds: LngLatBounds,
  viewW: number,
  viewH: number,
): [number, number] {
  const [[minLng, minLat], [maxLng, maxLat]] = bounds;
  const w = maxLng - minLng || 1;
  const h = maxLat - minLat || 1;
  const scale = Math.min((viewW * 0.94) / w, (viewH * 0.94) / h);
  const offsetX = (viewW - w * scale) / 2;
  const offsetY = (viewH - h * scale) / 2;
  const x = (lng - minLng) * scale + offsetX;
  const y = viewH - ((lat - minLat) * scale + offsetY);
  return [x, y];
}

// Inverse of project() — turns a click's on-screen position back into a
// real lng/lat, so the map can be clicked directly instead of only picked
// from the sidebar list.
function unproject(
  [x, y]: [number, number],
  bounds: LngLatBounds,
  viewW: number,
  viewH: number,
): LngLat {
  const [[minLng, minLat], [maxLng, maxLat]] = bounds;
  const w = maxLng - minLng || 1;
  const h = maxLat - minLat || 1;
  const scale = Math.min((viewW * 0.94) / w, (viewH * 0.94) / h);
  const offsetX = (viewW - w * scale) / 2;
  const offsetY = (viewH - h * scale) / 2;
  const lng = minLng + (x - offsetX) / scale;
  const lat = minLat + (viewH - y - offsetY) / scale;
  return [lng, lat];
}

// Which feature (if any) a real lng/lat point falls inside — a single-point
// version of the same test the grid sampling uses, for hit-testing a click.
function findFeatureIdAt(geojson: GeoJSON.FeatureCollection, point: LngLat): number | undefined {
  for (const f of geojson.features) {
    if (pointInGeometry(point, f.geometry)) return f.properties?.id as number | undefined;
  }
  return undefined;
}

// A faint outline of the real coastline/borders underneath the dots — on
// its own, a scatter of status dots with gaps for ocean doesn't read as
// "a map" at a glance (especially once most dots are the same "not
// visited" faint color). Traces every ring of every feature, not just the
// sampled grid, so the shape stays crisp regardless of dot density.
function ringToPath(ring: number[][], projectFn: (p: LngLat) => [number, number]): string {
  return ring.map((pt, i) => `${i === 0 ? "M" : "L"}${projectFn(pt as LngLat).join(",")}`).join(" ") + "Z";
}

// One feature's real outline as an SVG path — used both for the whole
// map's coastline wash and for tracing a single selected prefecture or
// municipality's actual shape (rather than a generic marker) on top of it.
export function geometryToPath(
  geometry: GeoJSON.Geometry,
  projectFn: (p: LngLat) => [number, number],
): string {
  if (geometry.type === "Polygon") {
    return geometry.coordinates.map((ring) => ringToPath(ring, projectFn)).join(" ");
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates
      .flatMap((polygon) => polygon.map((ring) => ringToPath(ring, projectFn)))
      .join(" ");
  }
  return "";
}
function boundaryPathFromGeoJSON(
  geojson: GeoJSON.FeatureCollection,
  projectFn: (p: LngLat) => [number, number],
): string {
  return geojson.features.map((f) => geometryToPath(f.geometry, projectFn)).join(" ");
}

export function useDotGrid({
  geojson,
  bounds: boundsOverride,
  classify,
  cols = 34,
  rows = 34,
  viewSize = 120,
  viewW,
  viewH,
}: {
  geojson: GeoJSON.FeatureCollection | null;
  bounds?: LngLatBounds | null;
  classify: (id: number) => DotStatus;
  cols?: number;
  rows?: number;
  viewSize?: number;
  viewW?: number;
  viewH?: number;
}): {
  dots: Dot[];
  project: (point: LngLat) => [number, number];
  bounds: LngLatBounds | null;
  boundaryPath: string;
  cellSize: number;
} {
  const bounds = boundsOverride ?? (geojson ? boundsOfFeatureCollection(geojson) : null);
  const w = viewW ?? viewSize;
  const h = viewH ?? viewSize;
  // How much space (in viewBox units) each sampled grid point actually
  // owns — dot sizes are drawn as a fraction of this so they read as a
  // dense, nearly-touching texture (per the design) at any grid resolution
  // or container size, instead of a fixed pixel size that only looks right
  // at one specific density.
  const cellSize = Math.min(w / cols, h / rows);

  const dots = useMemo(() => {
    if (!geojson || geojson.features.length === 0 || !bounds) return [];

    const features = geojson.features
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

    for (let row = 0; row < rows; row++) {
      const lat = minLat + ((row + 0.5) / rows) * (maxLat - minLat);
      for (let col = 0; col < cols; col++) {
        const lng = minLng + ((col + 0.5) / cols) * (maxLng - minLng);

        let status: DotStatus | null = null;
        for (const f of features) {
          const [[bMinLng, bMinLat], [bMaxLng, bMaxLat]] = f.bbox;
          if (lng < bMinLng || lng > bMaxLng || lat < bMinLat || lat > bMaxLat) continue;
          if (!pointInGeometry([lng, lat], f.geometry)) continue;
          status = f.id !== undefined ? classify(f.id) : "none";
          break;
        }
        if (status === null) continue;
        const [x, y] = project([lng, lat], bounds, w, h);
        result.push({ x, y, status });
      }
    }
    return result;
  }, [geojson, bounds, classify, cols, rows, w, h]);

  const projectPoint = useMemo(
    () => (point: LngLat) => (bounds ? project(point, bounds, w, h) : [0, 0] as [number, number]),
    [bounds, w, h],
  );

  const boundaryPath = useMemo(() => {
    if (!geojson || !bounds) return "";
    return boundaryPathFromGeoJSON(geojson, projectPoint);
  }, [geojson, bounds, projectPoint]);

  return { dots, project: projectPoint, bounds, boundaryPath, cellSize };
}

export function DotMapSvg({
  dots,
  size,
  viewSize = 120,
  viewW,
  viewH,
  cellSize,
  focus,
  highlight,
  project: projectFn,
  labels,
  route,
  boundary,
  ink = "var(--foreground)",
  style,
}: {
  style?: CSSProperties;
  dots: Dot[];
  size?: number | string;
  viewSize?: number;
  viewW?: number;
  viewH?: number;
  cellSize?: number;
  focus?: LngLat;
  highlight?: string;
  project?: (point: LngLat) => [number, number];
  labels?: { name: string; point: LngLat }[];
  route?: LngLat[];
  boundary?: string;
  ink?: string;
}) {
  const px = size ?? "100%";
  const vw = viewW ?? viewSize;
  const vh = viewH ?? viewSize;
  const unit = Math.min(vw, vh);
  // Fixed pixel widths, not scaled by container size — a coastline or a
  // selection outline should read as a thin line at any map size, the same
  // way it would drawn by hand, rather than growing with the viewBox.
  const cell = cellSize ?? viewSize / 34;
  const bigDot = cell * 0.58;
  // Kept noticeably smaller than the visited/want-to-go dots — at this grid
  // density, a "not yet visited" square this size on every empty cell reads
  // as noise next to the map's own (thin, fixed-width) boundary line.
  const dimDot = cell * 0.2;
  return (
    <svg
      width={px}
      height={px}
      viewBox={`0 0 ${vw} ${vh}`}
      preserveAspectRatio="xMidYMid meet"
      style={style}
    >
      {boundary && <path d={boundary} fill="none" stroke="var(--dot-coast)" strokeWidth={0.75} />}

      {dots.map((d, i) => {
        if (d.status === "visited" || d.status === "mixed") {
          return (
            <rect
              key={i}
              x={d.x - bigDot / 2}
              y={d.y - bigDot / 2}
              width={bigDot}
              height={bigDot}
              rx={bigDot * 0.22}
              fill="var(--accent)"
            />
          );
        }
        if (d.status === "want_to_go") {
          return (
            <rect
              key={i}
              x={d.x - bigDot / 2}
              y={d.y - bigDot / 2}
              width={bigDot}
              height={bigDot}
              rx={bigDot * 0.22}
              fill="none"
              stroke="var(--plan)"
              strokeWidth={Math.max(0.5, cell * 0.12)}
            />
          );
        }
        return (
          <rect
            key={i}
            x={d.x - dimDot / 2}
            y={d.y - dimDot / 2}
            width={dimDot}
            height={dimDot}
            rx={dimDot * 0.25}
            fill="var(--dot-dim)"
          />
        );
      })}

      {route && projectFn && route.length > 1 && (
        <>
          <path
            d={"M" + route.map((p) => projectFn(p).join(",")).join("L")}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={unit / 60}
            strokeDasharray={`${unit / 20} ${unit / 30}`}
          />
          {route.map((p, i) => {
            const [x, y] = projectFn(p);
            return (
              <g key={i}>
                <circle cx={x} cy={y} r={unit / 13} fill="var(--accent)" />
                <text
                  x={x}
                  y={y + unit / 60}
                  textAnchor="middle"
                  fontFamily="Archivo, sans-serif"
                  fontSize={unit / 12}
                  fontWeight={700}
                  fill="#fff"
                >
                  {i + 1}
                </text>
              </g>
            );
          })}
        </>
      )}

      {highlight && (
        <path
          d={highlight}
          fill={ink}
          fillOpacity={0.08}
          stroke={ink}
          strokeWidth={1.25}
          strokeLinejoin="round"
        />
      )}

      {focus && !highlight && projectFn && (
        <rect
          x={projectFn(focus)[0] - cell * 1.6}
          y={projectFn(focus)[1] - cell * 1.6}
          width={cell * 3.2}
          height={cell * 3.2}
          rx={cell * 0.7}
          fill="none"
          stroke={ink}
          strokeWidth={1.25}
        />
      )}

      {labels && projectFn && (
        <>
          {labels.map(({ name, point }, i) => {
            const [x, y] = projectFn(point);
            return (
              <g key={i}>
                <line x1={x + 4} y1={y} x2={x + 10} y2={y} stroke={ink} strokeWidth={1} />
                <text
                  x={x + 13}
                  y={y + 3}
                  fontFamily="Archivo, sans-serif"
                  fontSize={10}
                  fontWeight={600}
                  letterSpacing="0.02em"
                  fill={ink}
                >
                  {name}
                </text>
              </g>
            );
          })}
        </>
      )}
    </svg>
  );
}

// Measures its own box and renders the dot grid at that exact aspect ratio
// — for a full-bleed map pane (Atlas), fitting the projection to the
// pane's real (non-square) shape uses far more of the available space than
// padding a square viewBox and letting `preserveAspectRatio` letterbox it.
export function DotMapFill({
  geojson,
  bounds,
  classify,
  cols = 40,
  rows = 40,
  focus,
  highlightGeometry,
  labels,
  onFeatureClick,
  className,
  style,
}: {
  geojson: GeoJSON.FeatureCollection | null;
  bounds?: LngLatBounds | null;
  classify: (id: number) => DotStatus;
  cols?: number;
  rows?: number;
  focus?: LngLat;
  highlightGeometry?: GeoJSON.Geometry | null;
  labels?: { name: string; point: LngLat }[];
  onFeatureClick?: (id: number) => void;
  className?: string;
  style?: CSSProperties;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  // The current fit (whole country, or whole prefecture) is the most
  // zoomed-out view there is — no reason to zoom out further and shrink it.
  // Zooming in is allowed up to 4x, and dragging around is only possible
  // (and only needed) once zoomed past that base fit.
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number; moved: boolean } | null>(
    null,
  );

  // Keeps the zoomed content covering the whole box — panned past its own
  // edge would otherwise leave bare background showing.
  function clampPan(p: { x: number; y: number }, z: number, s: { w: number; h: number }) {
    const maxX = (s.w * (z - 1)) / 2;
    const maxY = (s.h * (z - 1)) / 2;
    return { x: Math.min(maxX, Math.max(-maxX, p.x)), y: Math.min(maxY, Math.max(-maxY, p.y)) };
  }

  function handleWheel(e: WheelEvent<HTMLDivElement>) {
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom - e.deltaY * 0.0015));
    setZoom(nextZoom);
    if (size) setPan((p) => clampPan(p, nextZoom, size));
  }

  function handlePointerDown(e: MouseEvent<HTMLDivElement>) {
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPanX: pan.x, startPanY: pan.y, moved: false };
  }

  function handlePointerMove(e: MouseEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || !size) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) > 3) {
      drag.moved = true;
      setDragging(true);
    }
    if (drag.moved) {
      setPan(clampPan({ x: drag.startPanX + dx, y: drag.startPanY + dy }, zoom, size));
    }
  }

  function endDrag() {
    dragRef.current = null;
    setDragging(false);
  }

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ w: width, h: height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const grid = useDotGrid({
    geojson,
    bounds,
    classify,
    cols,
    rows,
    viewW: size?.w ?? 1,
    viewH: size?.h ?? 1,
  });

  const highlightPath = useMemo(
    () => (highlightGeometry ? geometryToPath(highlightGeometry, grid.project) : undefined),
    [highlightGeometry, grid.project],
  );

  function handlePointerUp(e: MouseEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    endDrag();
    // A completed drag pans the map — it shouldn't also fire a selection
    // for whatever happened to be under the pointer when it lifted.
    if (drag?.moved) return;
    if (!onFeatureClick || !geojson || !grid.bounds || !size) return;
    const rect = containerRef.current!.getBoundingClientRect();
    // The click lands in on-screen (post-zoom, post-pan) space — undo the
    // same center-anchored scale-then-translate the CSS transform below
    // applies, to get back to the coordinate space the SVG (and
    // unproject) actually use.
    const cx = size.w / 2;
    const cy = size.h / 2;
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const point = unproject(
      [cx + (screenX - pan.x - cx) / zoom, cy + (screenY - pan.y - cy) / zoom],
      grid.bounds,
      size.w,
      size.h,
    );
    const id = findFeatureIdAt(geojson, point);
    if (id !== undefined) onFeatureClick(id);
  }

  const cursor = dragging ? "grabbing" : zoom > 1 ? "grab" : onFeatureClick ? "pointer" : undefined;

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ ...style, cursor, overflow: "hidden" }}
      onWheel={handleWheel}
      onMouseDown={handlePointerDown}
      onMouseMove={handlePointerMove}
      onMouseUp={handlePointerUp}
      onMouseLeave={endDrag}
    >
      {size && grid.dots.length > 0 && (
        <DotMapSvg
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "center center",
          }}
          dots={grid.dots}
          viewW={size.w}
          viewH={size.h}
          cellSize={grid.cellSize}
          project={grid.project}
          focus={focus}
          highlight={highlightPath}
          boundary={grid.boundaryPath}
          labels={labels}
        />
      )}
    </div>
  );
}
