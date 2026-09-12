"use client";

import { useEffect, useRef } from "react";
import Map, {
  Layer,
  NavigationControl,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import type { StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// Japan's full extent (mainland + Okinawa), from the GADM dataset's own bounds.
const JAPAN_BOUNDS: [[number, number], [number, number]] = [
  [122.7, 23.8],
  [154.3, 45.7],
];
// Same bounds, flattened — maplibre's `maxBounds` prop wants [w, s, e, n]
// rather than the [[w,s],[e,n]] pair form `fitBounds` takes.
const JAPAN_MAX_BOUNDS: [number, number, number, number] = [
  JAPAN_BOUNDS[0][0],
  JAPAN_BOUNDS[0][1],
  JAPAN_BOUNDS[1][0],
  JAPAN_BOUNDS[1][1],
];

// No basemap — just a flat background. We only want our own boundary
// polygons on screen, not OpenFreeMap's streets/labels underneath them.
const BLANK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#f8fafc" },
    },
  ],
};

const LABEL_FONT = ["Noto Sans Regular"];

// Zoom level past which "no prefecture selected yet" should still resolve
// to whatever prefecture is under the middle of the screen, instead of
// leaving the municipality layer empty until the user picks one explicitly.
const AUTO_SELECT_ZOOM = 6;

const VISITED_COLOR = "#22c55e";
const WANT_COLOR = "#f59e0b";
const NEUTRAL_COLOR = "#94a3b8";

export function MapView({
  fitBounds,
  prefecturesGeoJSON,
  municipalitiesGeoJSON,
  visitedPrefectureIds,
  visitedMunicipalityIds,
  wantMunicipalityIds,
  selectedPrefectureId,
  onPrefectureClick,
  onMunicipalityClick,
}: {
  fitBounds: [[number, number], [number, number]] | null;
  prefecturesGeoJSON: GeoJSON.FeatureCollection | null;
  municipalitiesGeoJSON: GeoJSON.FeatureCollection | null;
  visitedPrefectureIds: number[];
  visitedMunicipalityIds: number[];
  wantMunicipalityIds: number[];
  selectedPrefectureId: number | null;
  onPrefectureClick: (id: number) => void;
  onMunicipalityClick: (id: number) => void;
}) {
  const mapRef = useRef<MapRef>(null);
  const hasFitRef = useRef(false);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (fitBounds) {
      map.fitBounds(fitBounds, { padding: 40, duration: 1000 });
      hasFitRef.current = true;
    } else if (hasFitRef.current) {
      // Selection got cleared — fit back out to the whole-country view
      // instead of leaving the camera wherever it last was.
      map.fitBounds(JAPAN_BOUNDS, { padding: 24, duration: 1000 });
    }
  }, [fitBounds]);

  function handleClick(e: MapLayerMouseEvent) {
    const feature = e.features?.[0];
    const id = feature?.properties?.id;
    if (typeof id !== "number") return;
    if (feature!.layer.id === "municipalities-fill") onMunicipalityClick(id);
    else if (feature!.layer.id === "prefectures-fill") onPrefectureClick(id);
  }

  // The "whole country" fit is itself the zoomed-out limit — pin minZoom to
  // whatever zoom fitBounds actually lands on, so users can zoom in freely
  // but never back out past the starting view.
  function handleLoad() {
    const map = mapRef.current?.getMap();
    if (map) map.setMinZoom(map.getZoom());
  }

  // Scrolling/pinching in on the blank country view (without clicking a
  // prefecture first) should still resolve to whatever prefecture ends up
  // under the middle of the screen, instead of showing nothing until the
  // user picks one from the list.
  function handleMoveEnd() {
    if (selectedPrefectureId !== null) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    if (map.getZoom() < AUTO_SELECT_ZOOM) return;
    const center = map.project(map.getCenter());
    const [feature] = map.queryRenderedFeatures([center.x, center.y], {
      layers: ["prefectures-fill"],
    });
    const id = feature?.properties?.id;
    if (typeof id === "number") onPrefectureClick(id);
  }

  return (
    <Map
      ref={mapRef}
      initialViewState={{ bounds: JAPAN_BOUNDS, fitBoundsOptions: { padding: 24 } }}
      maxBounds={JAPAN_MAX_BOUNDS}
      mapStyle={BLANK_STYLE}
      style={{ width: "100%", height: "100%" }}
      interactiveLayerIds={["prefectures-fill", "municipalities-fill"]}
      onClick={handleClick}
      onLoad={handleLoad}
      onMoveEnd={handleMoveEnd}
    >
      <NavigationControl position="top-right" />

      {prefecturesGeoJSON && (
        <Source id="prefectures" type="geojson" data={prefecturesGeoJSON}>
          <Layer
            id="prefectures-fill"
            type="fill"
            paint={{
              "fill-color": [
                "case",
                ["in", ["get", "id"], ["literal", visitedPrefectureIds]],
                VISITED_COLOR,
                "transparent",
              ],
              "fill-opacity": 0.25,
            }}
          />
          <Layer
            id="prefectures-line"
            type="line"
            paint={{ "line-color": "#334155", "line-width": 1 }}
          />
          <Layer
            id="prefectures-line-selected"
            type="line"
            filter={["==", ["get", "id"], selectedPrefectureId ?? -1]}
            paint={{ "line-color": "#2563eb", "line-width": 3 }}
          />
          <Layer
            id="prefectures-label"
            type="symbol"
            maxzoom={7}
            layout={{
              "text-field": ["get", "name"],
              "text-font": LABEL_FONT,
              "text-size": 13,
            }}
            paint={{
              "text-color": "#1e293b",
              "text-halo-color": "#f8fafc",
              "text-halo-width": 1.5,
            }}
          />
        </Source>
      )}

      {municipalitiesGeoJSON && (
        <Source id="municipalities" type="geojson" data={municipalitiesGeoJSON}>
          <Layer
            id="municipalities-fill"
            type="fill"
            paint={{
              "fill-color": [
                "case",
                ["in", ["get", "id"], ["literal", visitedMunicipalityIds]],
                VISITED_COLOR,
                ["in", ["get", "id"], ["literal", wantMunicipalityIds]],
                WANT_COLOR,
                NEUTRAL_COLOR,
              ],
              "fill-opacity": 0.45,
            }}
          />
          <Layer
            id="municipalities-line"
            type="line"
            paint={{ "line-color": "#1e293b", "line-width": 1 }}
          />
          <Layer
            id="municipalities-label"
            type="symbol"
            layout={{
              "text-field": ["get", "name"],
              "text-font": LABEL_FONT,
              "text-size": 11,
            }}
            paint={{
              "text-color": "#1e293b",
              "text-halo-color": "#f8fafc",
              "text-halo-width": 1.5,
            }}
          />
        </Source>
      )}
    </Map>
  );
}
