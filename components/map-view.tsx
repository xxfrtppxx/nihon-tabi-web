"use client";

import { useEffect, useRef } from "react";
import Map, { NavigationControl, type MapRef } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";

const JAPAN_VIEW = { longitude: 138.25, latitude: 36.5, zoom: 4.5 };

export interface FlyToTarget {
  lng: number;
  lat: number;
}

export function MapView({ flyTo }: { flyTo: FlyToTarget | null }) {
  const mapRef = useRef<MapRef>(null);

  useEffect(() => {
    (window as unknown as { __debugMap?: unknown }).__debugMap = mapRef.current;
    if (flyTo) {
      mapRef.current?.flyTo({ center: [flyTo.lng, flyTo.lat], zoom: 9, duration: 1000 });
    }
  }, [flyTo]);

  return (
    <Map
      ref={mapRef}
      initialViewState={JAPAN_VIEW}
      mapStyle="https://tiles.openfreemap.org/styles/liberty"
      style={{ width: "100%", height: "100%" }}
      onLoad={() => console.log("[map-debug] load event fired")}
      onError={(e) => console.error("[map-debug] error event", e)}
      onStyleData={() => console.log("[map-debug] styledata event fired")}
    >
      <NavigationControl position="top-right" />
    </Map>
  );
}
