import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { SvgTacticalMap } from "./SvgTacticalMap";
import { boundsOf } from "../../lib/geo";
import { SOURCE_COLORS, SOURCE_LABELS } from "../../lib/format";
import type { EvacuationPlan, EvidenceItem, InsurerExposureLine } from "../../lib/types";

// Free, keyless CARTO dark raster basemap — no API key, but still a network
// dependency. If tiles don't load within TILE_TIMEOUT_MS (bad venue wifi,
// blocked host), we swap to the self-contained SVG tactical view so the demo
// never shows a blank map.
const TILE_TIMEOUT_MS = 4500;

/** MapLibre requires a real WebGL context. On a machine where WebGL is
 * disabled or unsupported (locked-down corporate hardware, some headless/CI
 * environments), constructing maplibregl.Map doesn't fail gracefully — it
 * can crash the GPU process and take the tab with it. Check for WebGL up
 * front and go straight to the SVG fallback when it's unavailable, so we
 * never even attempt the risky path. */
function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

interface Props {
  polygon: [number, number][];
  items: EvidenceItem[];
  policies: InsurerExposureLine[];
  alertRing: [number, number][] | null;
  evacuationPlan?: EvacuationPlan | null;
}

export function TacticalMap({ polygon, items, policies, alertRing, evacuationPlan }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!containerRef.current || failed) return;
    if (!hasWebGL()) {
      setFailed(true);
      return;
    }
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      if (!cancelled && !loaded) setFailed(true);
    }, TILE_TIMEOUT_MS);

    const points = [
      ...polygon.map(([lon, lat]) => ({ lon, lat })),
      ...items.map((i) => ({ lon: i.longitude, lat: i.latitude })),
    ];
    const b = boundsOf(points, 0.2);

    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: {
          version: 8,
          sources: {
            basemap: {
              type: "raster",
              // Esri's "World Dark Gray Base" — free, keyless raster tiles
              // (reasonable-use terms, no signup) that already match this
              // app's dark console aesthetic. CARTO's equivalent anonymous
              // basemaps now require an API key (they render an "API KEY
              // REQUIRED" watermark instead of tiles), so this is the
              // primary basemap, not a fallback.
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

      map.addSource("event-polygon", {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [polygon] } },
      });
      map.addLayer({
        id: "event-polygon-fill",
        type: "fill",
        source: "event-polygon",
        paint: { "fill-color": "#76b900", "fill-opacity": 0.08 },
      });
      map.addLayer({
        id: "event-polygon-line",
        type: "line",
        source: "event-polygon",
        paint: { "line-color": "#76b900", "line-width": 1.5, "line-dasharray": [3, 2] },
      });

      if (alertRing) {
        map.addSource("alert-polygon", {
          type: "geojson",
          data: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [alertRing] } },
        });
        map.addLayer({
          id: "alert-polygon-fill",
          type: "fill",
          source: "alert-polygon",
          paint: { "fill-color": "#d55181", "fill-opacity": 0.08 },
        });
        map.addLayer({
          id: "alert-polygon-line",
          type: "line",
          source: "alert-polygon",
          paint: { "line-color": "#d55181", "line-width": 1.5, "line-dasharray": [2, 2] },
        });
      }

      if (evacuationPlan) {
        evacuationPlan.routes.forEach((route, i) => {
          const srcId = `route-${i}`;
          map.addSource(srcId, {
            type: "geojson",
            data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: route.route_geometry } },
          });
          map.addLayer({
            id: `${srcId}-line`,
            type: "line",
            source: srcId,
            paint: {
              "line-color": route.closure_warnings.length > 0 ? "#fab219" : "#76b900",
              "line-width": 3,
              "line-dasharray": route.routed_live ? [1, 0] : [2, 2],
            },
          });
        });
        const originEl = document.createElement("div");
        originEl.style.width = "14px";
        originEl.style.height = "14px";
        originEl.style.borderRadius = "50%";
        originEl.style.background = "#76b900";
        originEl.style.border = "2px solid #000";
        const originMarker = new maplibregl.Marker({ element: originEl })
          .setLngLat([evacuationPlan.origin_longitude, evacuationPlan.origin_latitude])
          .setPopup(new maplibregl.Popup({ closeButton: false }).setText(`Evacuation origin: ${evacuationPlan.origin_basis}`))
          .addTo(map);
        markersRef.current.push(originMarker);
      }

      for (const p of policies) {
        const el = document.createElement("div");
        el.style.width = "9px";
        el.style.height = "9px";
        el.style.background = "#4d4d4d";
        el.style.border = "1px solid #9a9a9a";
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([p.longitude, p.latitude])
          .setPopup(new maplibregl.Popup({ closeButton: false }).setText(`${p.policy_id} — TIV $${p.total_insured_value.toLocaleString()}`))
          .addTo(map);
        markersRef.current.push(marker);
      }

      for (const item of items) {
        const el = document.createElement("div");
        const color = SOURCE_COLORS[item.source] ?? "#9a9a9a";
        el.style.width = "12px";
        el.style.height = "12px";
        el.style.borderRadius = "50%";
        el.style.background = color;
        el.style.border = "2px solid #000";
        el.style.boxShadow = `0 0 0 4px ${color}22`;
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([item.longitude, item.latitude])
          .setPopup(
            new maplibregl.Popup({ closeButton: false }).setHTML(
              `<strong>${SOURCE_LABELS[item.source] ?? item.source}</strong><br/>${item.summary}`,
            ),
          )
          .addTo(map);
        markersRef.current.push(marker);
      }
    });

    map.on("error", () => {
      if (!cancelled) setFailed(true);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polygon, items, policies, alertRing, evacuationPlan, failed]);

  if (failed) {
    return (
      <SvgTacticalMap polygon={polygon} items={items} policies={policies} alertRing={alertRing} evacuationPlan={evacuationPlan} />
    );
  }

  return (
    <div className="relative overflow-hidden rounded-sm border border-hairline">
      <div ref={containerRef} className="h-[420px] w-full bg-[#07100a]" />
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#07100a] text-xs uppercase tracking-wide text-mute">
          Loading tactical map…
        </div>
      )}
    </div>
  );
}
