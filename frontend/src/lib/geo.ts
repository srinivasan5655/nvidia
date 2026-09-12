export interface LonLat {
  lon: number;
  lat: number;
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
