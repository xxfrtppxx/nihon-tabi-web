"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Map, {
  Layer,
  Marker,
  NavigationControl,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import type { StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { boundsOfGeometry, centerOfBounds, geometryToSvgPath } from "@/lib/geo";

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
// Matches the app's warm-paper background token (--background in
// app/globals.css) — kept as a literal here since maplibre's paint
// properties can't read CSS custom properties.
const MAP_BACKGROUND_COLOR = "#f7f4ef";

const BLANK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": MAP_BACKGROUND_COLOR },
    },
  ],
};

const LABEL_FONT = ["Noto Sans Regular"];

// Zoom level past which the country view starts revealing municipality
// detail for whatever prefectures are on screen, like a normal slippy map
// showing more detail as you zoom in — no selection required.
const DETAIL_ZOOM = 6;
// Cap how many prefectures' municipality data we'll load at once for that
// preview. There are only 47 total, so this is just a safety ceiling, not
// a real limit — it must never cut off prefectures actually on screen.
const MAX_PREVIEW_PREFECTURES = 47;

// Matches --accent / --plan / --neutral-400 in app/globals.css (pine-green
// visited, amber want-to-go, warm neutral) — literal hex since maplibre
// paint properties can't read CSS custom properties.
const VISITED_COLOR = "#2f7d63";
const WANT_COLOR = "#c2871f";
const NEUTRAL_COLOR = "#bdb8ad";
// Literal midpoint of VISITED_COLOR and WANT_COLOR — a place with both a
// visit and a want-to-go plan gets this blended color rather than picking
// one status to represent it.
const MIXED_COLOR = "#79852e";

// The flat municipality fill uses these same hex constants but at 45%
// opacity over the map's background — so a solid-fill model card in the
// raw hex would look far more saturated than the map ever does. Blending
// each color against that same background up front keeps the model's
// color matched to what the map actually shows, not just the constant.
const MUNICIPALITY_FILL_OPACITY = 0.45;
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function blendOverBackground(colorHex: string, alpha: number, backgroundHex: string): string {
  const [r, g, b] = hexToRgb(colorHex);
  const [br, bg, bb] = hexToRgb(backgroundHex);
  const mix = (fg: number, back: number) => Math.round(fg * alpha + back * (1 - alpha));
  return `#${[mix(r, br), mix(g, bg), mix(b, bb)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
}
const MODEL_COLOR = {
  visited: blendOverBackground(VISITED_COLOR, MUNICIPALITY_FILL_OPACITY, MAP_BACKGROUND_COLOR),
  want_to_go: blendOverBackground(WANT_COLOR, MUNICIPALITY_FILL_OPACITY, MAP_BACKGROUND_COLOR),
  mixed: blendOverBackground(MIXED_COLOR, MUNICIPALITY_FILL_OPACITY, MAP_BACKGROUND_COLOR),
  none: blendOverBackground(NEUTRAL_COLOR, MUNICIPALITY_FILL_OPACITY, MAP_BACKGROUND_COLOR),
};

// Caps how many photo pins render on the model card at once — this only
// limits the map preview, not how many photos a visit can actually have
// (uploading is unlimited; the timeline list shows every one of them).
const MAX_PHOTO_PINS = 10;

export function MapView({
  fitBounds,
  prefecturesGeoJSON,
  municipalitiesGeoJSON,
  previewMunicipalitiesGeoJSON,
  visitedPrefectureIds,
  visitedMunicipalityIds,
  wantMunicipalityIds,
  mixedPrefectureIds,
  mixedMunicipalityIds,
  selectedPrefectureId,
  selectedMunicipalityGeometry,
  selectedMunicipalityPhotoUrls,
  selectedMunicipalityStatus,
  onPrefectureClick,
  onMunicipalityClick,
  onPreviewMunicipalityClick,
  onViewportPrefecturesChange,
  onEmptyAreaClick,
  onPhotoAreaClick,
}: {
  fitBounds: [[number, number], [number, number]] | null;
  prefecturesGeoJSON: GeoJSON.FeatureCollection | null;
  municipalitiesGeoJSON: GeoJSON.FeatureCollection | null;
  previewMunicipalitiesGeoJSON: GeoJSON.FeatureCollection | null;
  visitedPrefectureIds: number[];
  visitedMunicipalityIds: number[];
  wantMunicipalityIds: number[];
  mixedPrefectureIds: number[];
  mixedMunicipalityIds: number[];
  selectedPrefectureId: number | null;
  selectedMunicipalityGeometry: GeoJSON.Geometry | null;
  selectedMunicipalityPhotoUrls: string[];
  selectedMunicipalityStatus: "visited" | "want_to_go" | "mixed" | "none";
  onPrefectureClick: (id: number) => void;
  onMunicipalityClick: (id: number) => void;
  onPreviewMunicipalityClick: (id: number) => void;
  onViewportPrefecturesChange: (ids: number[]) => void;
  onEmptyAreaClick: () => void;
  onPhotoAreaClick: () => void;
}) {
  const mapRef = useRef<MapRef>(null);
  const hasFitRef = useRef(false);
  // Whatever the map is currently fit to (a selection's bounds, or the
  // whole country) — kept so a container resize can redo the same fit
  // instead of leaving the old view letterboxed or cropped.
  const currentFitRef = useRef<{
    bounds: [[number, number], [number, number]];
    padding: number;
  }>({ bounds: JAPAN_BOUNDS, padding: 24 });

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (fitBounds) {
      currentFitRef.current = { bounds: fitBounds, padding: 40 };
      map.fitBounds(fitBounds, { padding: 40, duration: 1000 });
      hasFitRef.current = true;
    } else if (hasFitRef.current) {
      // Selection got cleared — fit back out to the whole-country view
      // instead of leaving the camera wherever it last was.
      currentFitRef.current = { bounds: JAPAN_BOUNDS, padding: 24 };
      map.fitBounds(JAPAN_BOUNDS, { padding: 24, duration: 1000 });
    }
  }, [fitBounds]);

  // Selecting a city no longer opens an edit form directly — instead it
  // shows a tilted 3D card of the polygon shape in place of the flat map,
  // colored the same as visited/want_to_go/mixed would have been, with any
  // visit photos pinned on top of it Google-Maps-style. Clickable to jump
  // into the right part of the editor.
  const selectionBounds = useMemo(
    () => (selectedMunicipalityGeometry ? boundsOfGeometry(selectedMunicipalityGeometry) : null),
    [selectedMunicipalityGeometry],
  );
  const tiltedCard = useMemo(() => {
    if (!selectedMunicipalityGeometry || !selectionBounds) return null;
    const color = MODEL_COLOR[selectedMunicipalityStatus];
    return {
      center: centerOfBounds(selectionBounds),
      path: geometryToSvgPath(selectedMunicipalityGeometry, selectionBounds),
      color,
    };
  }, [selectedMunicipalityGeometry, selectionBounds, selectedMunicipalityStatus]);

  // Sized to match how big the polygon itself would have appeared on the
  // flat map at the current zoom — reset to "unknown" on every new
  // selection (the React-documented "adjust state during render" pattern,
  // rather than an effect) so the card doesn't flash at the previous
  // city's size before the fit-bounds animation's moveend recomputes it.
  const [modelSizePx, setModelSizePx] = useState<number | null>(null);
  const [sizedForGeometry, setSizedForGeometry] = useState(selectedMunicipalityGeometry);
  if (selectedMunicipalityGeometry !== sizedForGeometry) {
    setSizedForGeometry(selectedMunicipalityGeometry);
    setModelSizePx(null);
  }
  function updateModelSize() {
    const map = mapRef.current?.getMap();
    if (!map || !selectionBounds) return;
    const nw = map.project([selectionBounds[0][0], selectionBounds[1][1]]);
    const se = map.project([selectionBounds[1][0], selectionBounds[0][1]]);
    const size = Math.max(Math.abs(se.x - nw.x), Math.abs(se.y - nw.y));
    if (Number.isFinite(size) && size > 0) setModelSizePx(size);
  }

  function handleClick(e: MapLayerMouseEvent) {
    const feature = e.features?.[0];
    const id = feature?.properties?.id;
    if (typeof id !== "number") return;
    if (feature!.layer.id === "municipalities-fill") onMunicipalityClick(id);
    else if (feature!.layer.id === "preview-municipalities-fill")
      onPreviewMunicipalityClick(id);
    else if (feature!.layer.id === "prefectures-fill") onPrefectureClick(id);
  }

  // The "whole country" fit is itself the zoomed-out limit — pin minZoom to
  // whatever zoom fitBounds actually lands on, so users can zoom in freely
  // but never back out past the starting view.
  function handleLoad() {
    const map = mapRef.current?.getMap();
    if (!map) return;
    map.setMinZoom(map.getZoom());

    // The container isn't always the same size (window resize, orientation
    // change, sidebar toggling) — redo the current fit whenever it changes
    // so the map always fills 100% of it instead of leaving stale
    // letterboxing from whatever size it was last fit at.
    map.on("resize", () => {
      const countryCamera = map.cameraForBounds(JAPAN_BOUNDS, { padding: 24 });
      if (countryCamera && typeof countryCamera.zoom === "number" && Number.isFinite(countryCamera.zoom)) {
        // A very narrow or short container can compute a zoom outside
        // maplibre's own valid range — clamp instead of letting setMinZoom throw.
        const clamped = Math.min(Math.max(countryCamera.zoom, -2), map.getMaxZoom());
        map.setMinZoom(clamped);
      }
      const { bounds, padding } = currentFitRef.current;
      map.fitBounds(bounds, { padding, duration: 0 });
    });
  }

  // Zooming in on the country view without picking a prefecture first
  // should still reveal more detail, the way an ordinary map does — report
  // whichever prefectures are currently on screen so the page can load
  // their municipality boundaries, without collapsing to a single selection.
  function handleMoveEnd() {
    const map = mapRef.current?.getMap();
    if (!map) return;
    updateModelSize();
    if (selectedPrefectureId !== null || map.getZoom() < DETAIL_ZOOM) {
      onViewportPrefecturesChange([]);
      return;
    }
    const features = map.queryRenderedFeatures(undefined, {
      layers: ["prefectures-fill"],
    });
    const ids = Array.from(
      new Set(
        features
          .map((f) => f.properties?.id)
          .filter((id): id is number => typeof id === "number"),
      ),
    ).slice(0, MAX_PREVIEW_PREFECTURES);
    onViewportPrefecturesChange(ids);
  }

  return (
    <Map
      ref={mapRef}
      initialViewState={{ bounds: JAPAN_BOUNDS, fitBoundsOptions: { padding: 24 } }}
      maxBounds={JAPAN_MAX_BOUNDS}
      mapStyle={BLANK_STYLE}
      style={{ width: "100%", height: "100%" }}
      interactiveLayerIds={[
        "prefectures-fill",
        "municipalities-fill",
        "preview-municipalities-fill",
      ]}
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
                ["in", ["get", "id"], ["literal", mixedPrefectureIds]],
                MIXED_COLOR,
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
            paint={{ "line-color": "#334340", "line-width": 1 }}
          />
          <Layer
            id="prefectures-line-selected"
            type="line"
            filter={["==", ["get", "id"], selectedPrefectureId ?? -1]}
            paint={{ "line-color": "#2f7d63", "line-width": 3 }}
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
              "text-color": "#334340",
              "text-halo-color": "#f7f4ef",
              "text-halo-width": 1.5,
            }}
          />
        </Source>
      )}

      {previewMunicipalitiesGeoJSON && (
        <Source
          id="preview-municipalities"
          type="geojson"
          data={previewMunicipalitiesGeoJSON}
        >
          <Layer
            id="preview-municipalities-fill"
            type="fill"
            minzoom={DETAIL_ZOOM}
            paint={{
              "fill-color": [
                "case",
                ["in", ["get", "id"], ["literal", mixedMunicipalityIds]],
                MIXED_COLOR,
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
            id="preview-municipalities-line"
            type="line"
            minzoom={DETAIL_ZOOM}
            paint={{ "line-color": "#334340", "line-width": 1 }}
          />
          <Layer
            id="preview-municipalities-label"
            type="symbol"
            minzoom={DETAIL_ZOOM}
            layout={{
              "text-field": ["get", "name"],
              "text-font": LABEL_FONT,
              "text-size": 11,
            }}
            paint={{
              "text-color": "#334340",
              "text-halo-color": "#f7f4ef",
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
                ["in", ["get", "id"], ["literal", mixedMunicipalityIds]],
                MIXED_COLOR,
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
            paint={{ "line-color": "#334340", "line-width": 1 }}
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
              "text-color": "#334340",
              "text-halo-color": "#f7f4ef",
              "text-halo-width": 1.5,
            }}
          />
        </Source>
      )}

      {tiltedCard && modelSizePx && (
        <Marker
          longitude={tiltedCard.center[0]}
          latitude={tiltedCard.center[1]}
          onClick={selectedMunicipalityPhotoUrls.length > 0 ? onPhotoAreaClick : onEmptyAreaClick}
        >
          <div
            className="relative cursor-pointer"
            style={{ width: modelSizePx, height: modelSizePx, perspective: modelSizePx * 4 }}
          >
            {/* A single flat, tilted shape reads as a squished 2D blob rather
                than a 3D object — a second darker copy underneath, pushed
                back in Z, gives the top face something to visibly float
                above so the tilt actually looks like a raised card. */}
            <svg
              viewBox="0 0 200 200"
              width={modelSizePx}
              height={modelSizePx}
              style={{
                position: "absolute",
                inset: 0,
                transform: "rotateX(50deg) rotateZ(-8deg) translateZ(0px)",
              }}
            >
              <path d={tiltedCard.path} fill="#0f172a" fillRule="evenodd" />
            </svg>
            <svg
              viewBox="0 0 200 200"
              width={modelSizePx}
              height={modelSizePx}
              style={{
                position: "absolute",
                inset: 0,
                transform: `rotateX(50deg) rotateZ(-8deg) translateZ(${modelSizePx * 0.22}px)`,
                filter: "drop-shadow(0 8px 8px rgba(0,0,0,0.4))",
              }}
            >
              <path d={tiltedCard.path} fill={tiltedCard.color} stroke="#334340" strokeWidth={2} fillRule="evenodd" />
            </svg>

            {/* Visit photos pinned on top of the model, Google-Maps-style —
                a rounded square card with a small pointed tail underneath,
                scattered at a stable (seeded, not re-rolled per render)
                random spot over the model so a handful of photos don't
                all land in an identical tidy row.

                The visible top face isn't just sitting flat in this div —
                it's displaced by the same rotateX/rotateZ/translateZ used
                to tilt it, so plain percentage-based positioning here would
                float outside the shape it's meant to sit on. Each pin's
                anchor gets that identical 3D transform (with the scatter
                offset applied in the same pre-rotation local plane as the
                polygon's own path coordinates) so it tracks the tilted
                surface exactly; a counter-rotation on the pin's own content
                then cancels that tilt back out so the photo itself renders
                upright rather than skewed. */}
            {selectedMunicipalityPhotoUrls.slice(0, MAX_PHOTO_PINS).map((url, i) => {
              const seed = i + 1;
              const rand = (n: number) => {
                const x = Math.sin(seed * n) * 10000;
                return x - Math.floor(x);
              };
              const offsetX = (rand(12.9898) - 0.5) * modelSizePx * 0.42;
              const offsetY = (rand(78.233) - 0.5) * modelSizePx * 0.24;
              const rotation = (rand(37.719) - 0.5) * 20;
              const topFaceZ = modelSizePx * 0.22;
              return (
                <div
                  key={i}
                  className="absolute left-1/2 top-1/2 z-10"
                  style={{
                    transform: `rotateX(50deg) rotateZ(-8deg) translate3d(${offsetX}px, ${offsetY}px, ${topFaceZ}px)`,
                    // Without this, the counter-rotation below gets
                    // flattened into this div's own plane instead of
                    // composing in true 3D, and the "undo" no longer
                    // cancels cleanly — the photo renders squashed.
                    transformStyle: "preserve-3d",
                  }}
                >
                  <div
                    className="drop-shadow-lg"
                    style={{ transform: `rotateZ(8deg) rotateX(-50deg) translate(-50%, -100%) rotate(${rotation}deg)` }}
                  >
                    <div className="flex flex-col items-center">
                      <div className="relative h-11 w-11 overflow-hidden rounded-lg border-2 border-white bg-neutral-200">
                        <Image src={url} alt="" fill sizes="44px" className="object-cover" />
                      </div>
                      <div
                        className="h-0 w-0 border-x-[6px] border-t-[8px] border-x-transparent border-t-white"
                        style={{ marginTop: -1 }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Marker>
      )}
    </Map>
  );
}
