import type { EvidenceItem } from "./types";

export interface LonLat {
  lon: number;
  lat: number;
}

/** Pulls the NWS alert polygon (if any) out of an evidence bundle's raw NWS
 * item so the map can overlay it alongside the event footprint — factored
 * out of SituationEvidenceView so OverviewView can render the same overlay
 * without duplicating the raw-geometry-casting logic. */
export function deriveAlertRing(items: EvidenceItem[] | undefined): [number, number][] | null {
  const nws = items?.find((i) => i.source === "nws");
  const geom = (nws?.raw as { geometry?: { coordinates?: [number, number][][] } } | undefined)?.geometry;
  return geom?.coordinates?.[0] ?? null;
}

export function polygonToLonLat(polygon: [number, number][]): LonLat[] {
  return polygon.map(([lon, lat]) => ({ lon, lat }));
}

export function boundsOf(points: LonLat[], padRatio = 0.15): { minLon: number; maxLon: number; minLat: number; maxLat: number } {
  const lons = points.map((p) => p.lon);
  const lats = points.map((p) => p.lat);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const padLon = (maxLon - minLon || 0.01) * padRatio;
  const padLat = (maxLat - minLat || 0.01) * padRatio;
  return { minLon: minLon - padLon, maxLon: maxLon + padLon, minLat: minLat - padLat, maxLat: maxLat + padLat };
}

/** Same padded bounding box as boundsOf, but then stretched on whichever
 * axis (lon or lat) is under-represented so the box's true-km aspect ratio
 * matches `containerAspect` (container pixel width / height) exactly. Fixes
 * MapLibre's `bounds` fit always accommodating the WORSE-fitting dimension —
 * without this, a tall/narrow geographic box (e.g. a north-south coastline)
 * inside a wide/short container gets zoomed out to fit the tall axis,
 * leaving big empty margins on the sides. Distances are converted to km
 * using a cos(lat)-corrected lon scale so the match is geographically real,
 * not just degree-for-degree. */
export function boundsForAspect(
  points: LonLat[],
  containerAspect: number,
  padRatio = 0.15,
): { minLon: number; maxLon: number; minLat: number; maxLat: number } {
  const base = boundsOf(points, padRatio);
  const midLat = (base.minLat + base.maxLat) / 2;
  const kmPerDegLon = 111 * Math.cos((midLat * Math.PI) / 180) || 0.01;
  const kmPerDegLat = 111;

  let { minLon, maxLon, minLat, maxLat } = base;
  const widthKm = (maxLon - minLon) * kmPerDegLon;
  const heightKm = (maxLat - minLat) * kmPerDegLat;
  const currentAspect = widthKm / heightKm;

  if (currentAspect < containerAspect) {
    // Box is too tall/narrow for the container — widen it (add lon span).
    const targetWidthKm = heightKm * containerAspect;
    const extraDeg = (targetWidthKm - widthKm) / kmPerDegLon / 2;
    minLon -= extraDeg;
    maxLon += extraDeg;
  } else if (currentAspect > containerAspect) {
    // Box is too wide/short for the container — heighten it (add lat span).
    const targetHeightKm = widthKm / containerAspect;
    const extraDeg = (targetHeightKm - heightKm) / kmPerDegLat / 2;
    minLat -= extraDeg;
    maxLat += extraDeg;
  }
  return { minLon, maxLon, minLat, maxLat };
}

/** A closed ring approximating a `radiusKm` circle around `center`, corrected
 * for longitude compression at latitude (cos(lat)) — accurate enough for a
 * real (Web Mercator) basemap at city scale, where MapLibre's own projection
 * is locally conformal. Used for "impact zone" style overlays on a real map,
 * as opposed to makeProjector's flat SVG canvas below. */
export function circlePolygon(center: LonLat, radiusKm: number, points = 48): [number, number][] {
  const KM_PER_DEG_LAT = 111;
  const kmPerDegLon = KM_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180);
  const dLat = radiusKm / KM_PER_DEG_LAT;
  const dLon = radiusKm / kmPerDegLon;
  const ring: [number, number][] = [];
  for (let i = 0; i <= points; i++) {
    const theta = (i / points) * 2 * Math.PI;
    ring.push([center.lon + dLon * Math.cos(theta), center.lat + dLat * Math.sin(theta)]);
  }
  return ring;
}

/** Projects lon/lat into an SVG viewBox (0..width, 0..height), y flipped so
 * north is up. Equirectangular — the event footprint is a few km wide, so
 * no real projection distortion is visible at this scale. */
export function makeProjector(bounds: { minLon: number; maxLon: number; minLat: number; maxLat: number }, width: number, height: number) {
  const lonSpan = bounds.maxLon - bounds.minLon || 1;
  const latSpan = bounds.maxLat - bounds.minLat || 1;
  return (p: LonLat) => ({
    x: ((p.lon - bounds.minLon) / lonSpan) * width,
    y: height - ((p.lat - bounds.minLat) / latSpan) * height,
  });
}
