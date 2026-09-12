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
