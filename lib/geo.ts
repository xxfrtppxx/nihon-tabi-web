export type LngLatBounds = [[number, number], [number, number]];

function extendBbox(bbox: number[], lng: number, lat: number) {
  if (lng < bbox[0]) bbox[0] = lng;
  if (lat < bbox[1]) bbox[1] = lat;
  if (lng > bbox[2]) bbox[2] = lng;
  if (lat > bbox[3]) bbox[3] = lat;
}

function extendBboxWithGeometry(bbox: number[], geometry: GeoJSON.Geometry) {
  if (geometry.type === "Polygon") {
    for (const ring of geometry.coordinates) {
      for (const [lng, lat] of ring) extendBbox(bbox, lng, lat);
    }
  } else if (geometry.type === "MultiPolygon") {
    for (const polygon of geometry.coordinates) {
      for (const ring of polygon) {
        for (const [lng, lat] of ring) extendBbox(bbox, lng, lat);
      }
    }
  }
}

export function boundsOfFeatureCollection(
  featureCollection: GeoJSON.FeatureCollection,
): LngLatBounds | null {
  const bbox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const feature of featureCollection.features) {
    extendBboxWithGeometry(bbox, feature.geometry);
  }
  if (!Number.isFinite(bbox[0])) return null;
  return [
    [bbox[0], bbox[1]],
    [bbox[2], bbox[3]],
  ];
}

export function boundsOfGeometry(geometry: GeoJSON.Geometry): LngLatBounds | null {
  const bbox = [Infinity, Infinity, -Infinity, -Infinity];
  extendBboxWithGeometry(bbox, geometry);
  if (!Number.isFinite(bbox[0])) return null;
  return [
    [bbox[0], bbox[1]],
    [bbox[2], bbox[3]],
  ];
}

export function centerOfBounds(bounds: LngLatBounds): [number, number] {
  return [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2];
}

// Bounding box of a handful of [lng, lat] points (a trip's day-by-day
// route, say) rather than a polygon — padded so a route that's a single
// point, or a straight line, still gets a sane box to project into instead
// of a zero-size one.
export function boundsOfPoints(points: [number, number][]): LngLatBounds | null {
  if (points.length === 0) return null;
  const bbox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [lng, lat] of points) extendBbox(bbox, lng, lat);
  const padLng = Math.max(0.3, (bbox[2] - bbox[0]) * 0.2);
  const padLat = Math.max(0.3, (bbox[3] - bbox[1]) * 0.2);
  return [
    [bbox[0] - padLng, bbox[1] - padLat],
    [bbox[2] + padLng, bbox[3] + padLat],
  ];
}

// Projects a polygon's lng/lat rings into a square SVG viewBox (0..viewSize
// on each axis), preserving aspect ratio and flipping the Y axis (SVG grows
// downward, latitude grows upward) — just enough to draw the shape as a
// standalone graphic, not a real map projection.
export function geometryToSvgPath(
  geometry: GeoJSON.Geometry,
  bounds: LngLatBounds,
  viewSize = 200,
): string {
  const [[minLng, minLat], [maxLng, maxLat]] = bounds;
  const w = maxLng - minLng || 1;
  const h = maxLat - minLat || 1;
  const scale = (viewSize * 0.9) / Math.max(w, h);
  const offsetX = (viewSize - w * scale) / 2;
  const offsetY = (viewSize - h * scale) / 2;
  function project([lng, lat]: number[]): [number, number] {
    const x = (lng - minLng) * scale + offsetX;
    const y = viewSize - ((lat - minLat) * scale + offsetY);
    return [x, y];
  }
  function ringToPath(ring: number[][]): string {
    return ring.map((pt, i) => `${i === 0 ? "M" : "L"}${project(pt).join(",")}`).join(" ") + " Z";
  }
  if (geometry.type === "Polygon") {
    return geometry.coordinates.map(ringToPath).join(" ");
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.flatMap((polygon) => polygon.map(ringToPath)).join(" ");
  }
  return "";
}

// Standard ray-casting point-in-ring test (even-odd rule).
function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

// [lng, lat] membership test against a Polygon/MultiPolygon, honoring holes
// (a polygon's first ring is its shell, any further rings are holes cut out
// of it) — used by the dot-matrix coverage panel to classify each sampled
// point against a prefecture's real GADM geometry.
export function pointInGeometry(
  point: [number, number],
  geometry: GeoJSON.Geometry,
): boolean {
  const [lng, lat] = point;
  function inPolygon(rings: number[][][]): boolean {
    if (rings.length === 0 || !pointInRing(lng, lat, rings[0])) return false;
    for (let i = 1; i < rings.length; i++) {
      if (pointInRing(lng, lat, rings[i])) return false;
    }
    return true;
  }
  if (geometry.type === "Polygon") return inPolygon(geometry.coordinates);
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) => inPolygon(polygon));
  }
  return false;
}

// Great-circle distance between two lat/lng points, in kilometers — used
// to rank "nearby" municipalities by their centroid distance from the one
// currently selected in the visit editor.
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}
