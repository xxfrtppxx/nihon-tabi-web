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

const JAPAN_VIEW = { longitude: 138.25, latitude: 36.5, zoom: 4.5 };

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

const VISITED_COLOR = "#22c55e";
const WANT_COLOR = "#f59e0b";
const NEUTRAL_COLOR = "#94a3b8";

export interface FlyToTarget {
  lng: number;
  lat: number;
}

export function MapView({
  flyTo,
  prefecturesGeoJSON,
  municipalitiesGeoJSON,
  visitedPrefectureIds,
  visitedMunicipalityIds,
  wantMunicipalityIds,
  selectedPrefectureId,
  onPrefectureClick,
  onMunicipalityClick,
}: {
  flyTo: FlyToTarget | null;
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

  useEffect(() => {
    if (flyTo) {
      mapRef.current?.flyTo({ center: [flyTo.lng, flyTo.lat], zoom: 9, duration: 1000 });
    }
  }, [flyTo]);

  function handleClick(e: MapLayerMouseEvent) {
    const feature = e.features?.[0];
    const id = feature?.properties?.id;
    if (typeof id !== "number") return;
    if (feature!.layer.id === "municipalities-fill") onMunicipalityClick(id);
    else if (feature!.layer.id === "prefectures-fill") onPrefectureClick(id);
  }

  return (
    <Map
      ref={mapRef}
      initialViewState={JAPAN_VIEW}
      mapStyle={BLANK_STYLE}
      style={{ width: "100%", height: "100%" }}
      interactiveLayerIds={["prefectures-fill", "municipalities-fill"]}
      onClick={handleClick}
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
