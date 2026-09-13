import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { boundsForAspect, circlePolygon } from "../../../lib/geo";
import type { SimResult, WhatIfScenario } from "../../../lib/whatIf";

const TILE_TIMEOUT_MS = 4500;

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function severityColor(index: number): string {
  if (index >= 1.8) return "#d03b3b";
  if (index >= 1.3) return "#fab219";
  if (index >= 0.8) return "#76b900";
  return "#4d8fdb";
}

/** A real (tile-based) map for the what-if simulator, mirroring the same
 * basemap/style as Map & Safe Places' TacticalMap — the impact zone,
 * corridor, and landmarks are drawn as live GeoJSON overlays on real
 * geography instead of an illustrative flat-canvas SVG. The map itself is
 * created once per scenario (keyed by the parent) and never re-fit while
 * dragging a slider; only the overlay sources/paint update on `result`. */
export function WhatIfMap({ scenario, result }: { scenario: WhatIfScenario; result: SimResult }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const epicenterMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Mount once per scenario.
  useEffect(() => {
    if (!containerRef.current) return;
    if (!hasWebGL()) {
      setFailed(true);
      return;
    }
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      if (!cancelled && !loaded) setFailed(true);
    }, TILE_TIMEOUT_MS);

    const rect = containerRef.current.getBoundingClientRect();
    const containerAspect = rect.width > 0 && rect.height > 0 ? rect.width / rect.height : 16 / 9;
    const b = boundsForAspect(scenario.fitPoints, containerAspect, 0.35);

    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: {
          version: 8,
          sources: {
            basemap: {
              type: "raster",
              tiles: [
                "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
              ],
              tileSize: 256,
              attribution: "© Esri",
            },
          },
          layers: [{ id: "basemap", type: "raster", source: "basemap" }],
        },
        bounds: [
          [b.minLon, b.minLat],
          [b.maxLon, b.maxLat],
        ],
        attributionControl: { compact: true },
      });
    } catch {
      setFailed(true);
      return;
    }

    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      if (cancelled) return;
      setLoaded(true);
      window.clearTimeout(timeout);

      const color = severityColor(result.severityIndex);

      if (scenario.trackPath) {
        map.addSource("track", {
          type: "geojson",
          data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: scenario.trackPath.map((p) => [p.lon, p.lat]) } },
        });
        map.addLayer({
          id: "track-line",
          type: "line",
          source: "track",
          paint: { "line-color": "#9a9a9a", "line-width": 1.5, "line-dasharray": [3, 2] },
        });
      }

      map.addSource("corridor", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: scenario.corridorPath.map((p) => [p.lon, p.lat]) },
        },
      });
      map.addLayer({
        id: "corridor-glow",
        type: "line",
        source: "corridor",
        paint: { "line-color": "#4d8fdb", "line-width": Math.max(2, result.corridorWidthKm * 3.2), "line-opacity": 0.4 },
      });
      map.addLayer({
        id: "corridor-line",
        type: "line",
        source: "corridor",
        paint: { "line-color": "#8fc7ff", "line-width": 1.5, "line-opacity": 0.85 },
      });

      map.addSource("impact-zone", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "Polygon", coordinates: [circlePolygon(result.center, result.impactRadiusKm)] },
        },
      });
      map.addLayer({
        id: "impact-fill",
        type: "fill",
        source: "impact-zone",
        paint: { "fill-color": color, "fill-opacity": 0.2 },
      });
      map.addLayer({
        id: "impact-outline",
        type: "line",
        source: "impact-zone",
        paint: { "line-color": color, "line-width": 2 },
      });

      for (const lm of scenario.landmarks) {
        const el = document.createElement("div");
        el.style.width = "12px";
        el.style.height = "12px";
        el.style.background = lm.color;
        el.style.border = "2px solid #000";
        new maplibregl.Marker({ element: el })
          .setLngLat([lm.lon, lm.lat])
          .setPopup(new maplibregl.Popup({ closeButton: false }).setText(lm.label))
          .addTo(map);
      }

      const epicenterEl = document.createElement("div");
      epicenterEl.style.width = "16px";
      epicenterEl.style.height = "16px";
      epicenterEl.style.borderRadius = "50%";
      epicenterEl.style.background = color;
      epicenterEl.style.border = "2px solid #000";
      epicenterEl.style.boxShadow = `0 0 0 6px ${color}33`;
      epicenterMarkerRef.current = new maplibregl.Marker({ element: epicenterEl })
        .setLngLat([result.center.lon, result.center.lat])
        .addTo(map);
    });

    map.on("error", () => {
      if (!cancelled) setFailed(true);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      epicenterMarkerRef.current?.remove();
      epicenterMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // Mount once per scenario — result updates are handled by the effect
    // below via setData/setPaintProperty, not a full remount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario]);

  // Cheap live update on every slider change: move the source data / paint
  // properties / marker position, no map teardown.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const color = severityColor(result.severityIndex);

    const impactSrc = map.getSource("impact-zone") as GeoJSONSource | undefined;
    impactSrc?.setData({
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [circlePolygon(result.center, result.impactRadiusKm)] },
    });
    if (map.getLayer("impact-fill")) map.setPaintProperty("impact-fill", "fill-color", color);
    if (map.getLayer("impact-outline")) map.setPaintProperty("impact-outline", "line-color", color);
    if (map.getLayer("corridor-glow")) {
      map.setPaintProperty("corridor-glow", "line-width", Math.max(2, result.corridorWidthKm * 3.2));
    }

    epicenterMarkerRef.current?.setLngLat([result.center.lon, result.center.lat]);
    const el = epicenterMarkerRef.current?.getElement();
    if (el) {
      el.style.background = color;
      el.style.boxShadow = `0 0 0 6px ${color}33`;
    }
  }, [result, loaded]);

  if (failed) {
    return (
      <div className="flex h-[460px] w-full items-center justify-center rounded-2xl border border-hairline bg-[#07100a] text-xs uppercase tracking-wide text-mute">
        Map unavailable in this environment
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-hairline">
      <div ref={containerRef} className="h-[460px] w-full bg-[#07100a]" />
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#07100a] text-xs uppercase tracking-wide text-mute">
          Loading map…
        </div>
      )}
      {loaded && (
        <div className="absolute bottom-3 left-3 flex flex-col gap-1.5 rounded-sm border border-hairline-strong bg-black/80 px-3 py-2 text-[10px] text-mute">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: severityColor(result.severityIndex) }} /> Simulated
            impact zone
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-1 w-3 rounded-full bg-[#8fc7ff]" /> Flood corridor
          </div>
          {scenario.trackPath && (
            <div className="flex items-center gap-1.5">
              <span className="h-1 w-3 rounded-full border border-stone" /> Historical track
            </div>
          )}
        </div>
      )}
    </div>
  );
}
