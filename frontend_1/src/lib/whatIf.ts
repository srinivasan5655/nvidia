/**
 * "What if" historical-scenario simulators — Hurricane Harvey's Aug 2017
 * Buffalo Bayou flooding in Houston, Cyclone Vardha / the December 2015
 * Chennai floods, and the September 2022 Bengaluru urban floods. All three
 * are simplified, deterministic toy physical models for a demo, NOT
 * calibrated hydrological/meteorological simulations — every number comes
 * from the formulas below, never from an LLM, matching the rest of the
 * app's "no model invents a number" rule.
 */

export interface LonLat {
  lon: number;
  lat: number;
}

export interface SimResult {
  severityIndex: number; // 1.0 = historical baseline
  center: LonLat;
  impactRadiusKm: number;
  corridorWidthKm: number;
  estimatedExposureUsd: number;
  estimatedAffectedPopulation: number;
  exposureDeltaPct: number;
  narrative: string;
}

export interface SliderSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
}

export interface Landmark {
  label: string;
  lon: number;
  lat: number;
  color: string;
}

export interface WhatIfScenario {
  id: string;
  city: "houston" | "chennai" | "bangalore";
  title: string;
  subtitle: string;
  landmarks: Landmark[];
  corridorPath: LonLat[];
  trackPath?: LonLat[];
  /** Points the map view should fit to — a fixed set (not derived from the
   * live simulation result) so the map never re-pans/zooms while dragging a
   * slider, only the overlays on top of it move. */
  fitPoints: LonLat[];
  sliders: SliderSpec[];
  defaultParams: Record<string, number>;
  simulate: (params: Record<string, number>) => SimResult;
}

const KM_PER_DEG_LAT = 111;

// ---------------------------------------------------------------------------
// Chennai — Cyclone Vardha (landfall Dec 2016) & the Chembarambakkam-release
// flooding associated with the December 2015 Chennai floods.
// ---------------------------------------------------------------------------

const VARDHA_LANDFALL: LonLat = { lon: 80.28, lat: 13.09 }; // Ennore / Kasimedu, Chennai
const CHEMBARAMBAKKAM_DAM: LonLat = { lon: 79.945, lat: 12.998 };
const ADYAR_RIVER_PATH: LonLat[] = [
  CHEMBARAMBAKKAM_DAM,
  { lon: 80.05, lat: 13.0 },
  { lon: 80.15, lat: 13.01 },
  { lon: 80.2, lat: 13.02 },
  { lon: 80.25, lat: 12.99 },
  { lon: 80.27, lat: 12.98 },
];
const VARDHA_APPROACH_TRACK: LonLat[] = [
  { lon: 84.2, lat: 13.7 },
  { lon: 82.8, lat: 13.55 },
  { lon: 81.5, lat: 13.35 },
  { lon: 80.6, lat: 13.15 },
  VARDHA_LANDFALL,
];
// Coastline reference used only to walk the landfall point north/south by
// km — the real basemap already renders the actual coastline.
const CHENNAI_COASTLINE: LonLat[] = [
  { lon: 80.33, lat: 13.42 },
  { lon: 80.32, lat: 13.25 },
  { lon: 80.3, lat: 13.15 },
  VARDHA_LANDFALL,
  { lon: 80.27, lat: 13.04 },
  { lon: 80.25, lat: 12.95 },
  { lon: 80.2, lat: 12.83 },
  { lon: 80.15, lat: 12.62 },
];

function kmPerDegLon(lat: number): number {
  return KM_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}

/** Walks `km` along `path` starting at `refIndex`, in the direction of
 * increasing index when `km` and `dirForPositive` agree in sign — used to
 * turn a single "shift the event along this corridor" slider into a real
 * lon/lat point without needing a true storm-track model. Shared by every
 * scenario below since each one's "track direction"/"stall position"
 * slider is the same operation over a different named path. */
function pointAtDistanceAlongPath(path: LonLat[], refIndex: number, km: number, dirForPositive: 1 | -1 = 1): LonLat {
  const dir = km >= 0 ? dirForPositive : (-dirForPositive as 1 | -1);
  let remaining = Math.abs(km);
  let current = path[refIndex];
  let i = refIndex;
  while (remaining > 0) {
    const nextIdx = i + dir;
    if (nextIdx < 0 || nextIdx >= path.length) break;
    const next = path[nextIdx];
    const segKm = Math.hypot((next.lat - current.lat) * KM_PER_DEG_LAT, (next.lon - current.lon) * kmPerDegLon(current.lat));
    if (segKm >= remaining) {
      const t = remaining / segKm;
      return { lon: current.lon + (next.lon - current.lon) * t, lat: current.lat + (next.lat - current.lat) * t };
    }
    remaining -= segKm;
    current = next;
    i = nextIdx;
  }
  return current;
}

function pointAlongCoastline(km: number): LonLat {
  const baseIdx = CHENNAI_COASTLINE.findIndex((p) => p.lat === VARDHA_LANDFALL.lat && p.lon === VARDHA_LANDFALL.lon);
  // Array runs north (low index) to south (high index); positive km = north.
  return pointAtDistanceAlongPath(CHENNAI_COASTLINE, baseIdx, km, -1);
}

const CHENNAI_BASELINE_EXPOSURE_USD = 185_000_000;
const CHENNAI_BASELINE_POPULATION = 420_000;

function simulateChennai(params: Record<string, number>): SimResult {
  const directionShiftKm = params.directionShiftKm ?? 0;
  const windSpeedPct = params.windSpeedPct ?? 0;
  const damReleasePct = params.damReleasePct ?? 0;
  const rainfallPct = params.rainfallPct ?? 0;

  const severityIndex = Math.max(
    0.3,
    Math.min(3, 1 + windSpeedPct * 0.009 + rainfallPct * 0.007 + damReleasePct * 0.003),
  );
  const center = pointAlongCoastline(directionShiftKm);
  const impactRadiusKm = Math.max(8, 32 * (1 + windSpeedPct * 0.008));
  const corridorWidthKm = Math.max(0.5, 2.5 * (1 + damReleasePct * 0.012));
  const estimatedExposureUsd = Math.round(CHENNAI_BASELINE_EXPOSURE_USD * severityIndex);
  const estimatedAffectedPopulation = Math.round(CHENNAI_BASELINE_POPULATION * severityIndex);
  const exposureDeltaPct = Math.round((severityIndex - 1) * 100);

  const directionText =
    directionShiftKm === 0
      ? "on its historical track"
      : `about ${Math.abs(Math.round(directionShiftKm))} km ${directionShiftKm > 0 ? "north" : "south"} of its historical landfall`;
  const windText = windSpeedPct === 0 ? "unchanged wind speed" : `${windSpeedPct > 0 ? "+" : ""}${windSpeedPct}% wind speed`;
  const damText =
    damReleasePct === 0
      ? "an unchanged dam release rate"
      : `a ${Math.abs(damReleasePct)}% ${damReleasePct > 0 ? "higher" : "lower"} Chembarambakkam release rate`;
  const rainText = rainfallPct === 0 ? "unchanged rainfall" : `${rainfallPct > 0 ? "+" : ""}${rainfallPct}% rainfall`;

  const narrative =
    `Landfall ${directionText}, with ${windText} and ${rainText}, combined with ${damText}, ` +
    `scales the impact radius to ~${Math.round(impactRadiusKm)} km and the Adyar river flood corridor to ~${corridorWidthKm.toFixed(1)} km wide. ` +
    `Estimated exposure: $${(estimatedExposureUsd / 1_000_000).toFixed(1)}M (${exposureDeltaPct >= 0 ? "+" : ""}${exposureDeltaPct}% vs. the historical event), ` +
    `affecting an estimated ${estimatedAffectedPopulation.toLocaleString()} people.`;

  return { severityIndex, center, impactRadiusKm, corridorWidthKm, estimatedExposureUsd, estimatedAffectedPopulation, exposureDeltaPct, narrative };
}

export const CHENNAI_SCENARIO: WhatIfScenario = {
  id: "chennai-vardha",
  city: "chennai",
  title: "Cyclone Vardha & the Dec 2015 Chennai Floods",
  subtitle: "Adjust the storm's track, wind speed, rainfall and the Chembarambakkam dam release rate.",
  landmarks: [{ label: "Chembarambakkam Dam", ...CHEMBARAMBAKKAM_DAM, color: "#df6500" }],
  corridorPath: ADYAR_RIVER_PATH,
  trackPath: VARDHA_APPROACH_TRACK,
  fitPoints: [...CHENNAI_COASTLINE, CHEMBARAMBAKKAM_DAM],
  sliders: [
    { key: "directionShiftKm", label: "Track direction", min: -80, max: 80, step: 5, unit: "km" },
    { key: "windSpeedPct", label: "Wind speed", min: -30, max: 50, step: 5, unit: "%" },
    { key: "damReleasePct", label: "Dam release rate", min: -50, max: 150, step: 10, unit: "%" },
    { key: "rainfallPct", label: "Rainfall", min: -30, max: 100, step: 10, unit: "%" },
  ],
  defaultParams: { directionShiftKm: 0, windSpeedPct: 0, damReleasePct: 0, rainfallPct: 0 },
  simulate: simulateChennai,
};

// ---------------------------------------------------------------------------
// Bangalore — the September 2022 Bengaluru urban floods: Bellandur Lake
// overflow and stormwater drain (Raja Kaluve) encroachment through the
// Koramangala valley to Silk Board Junction.
// ---------------------------------------------------------------------------

const BELLANDUR_LAKE: LonLat = { lon: 77.665, lat: 12.9304 };
const SILK_BOARD_JUNCTION: LonLat = { lon: 77.6229, lat: 12.9172 };
const KORAMANGALA_VALLEY_PATH: LonLat[] = [
  BELLANDUR_LAKE,
  { lon: 77.6499, lat: 12.9269 },
  { lon: 77.6389, lat: 12.9236 },
  SILK_BOARD_JUNCTION,
];

const BANGALORE_BASELINE_EXPOSURE_USD = 150_000_000;
const BANGALORE_BASELINE_POPULATION = 380_000;

function simulateBangalore(params: Record<string, number>): SimResult {
  const rainfallPct = params.rainfallPct ?? 0;
  const lakeOverflowPct = params.lakeOverflowPct ?? 0;
  const drainBlockagePct = params.drainBlockagePct ?? 0;

  const severityIndex = Math.max(
    0.3,
    Math.min(3, 1 + rainfallPct * 0.008 + lakeOverflowPct * 0.007 + drainBlockagePct * 0.008),
  );
  const impactRadiusKm = Math.max(5, 18 * (1 + rainfallPct * 0.007));
  const corridorWidthKm = Math.max(0.4, 1.8 * (1 + lakeOverflowPct * 0.01 + drainBlockagePct * 0.008));
  const estimatedExposureUsd = Math.round(BANGALORE_BASELINE_EXPOSURE_USD * severityIndex);
  const estimatedAffectedPopulation = Math.round(BANGALORE_BASELINE_POPULATION * severityIndex);
  const exposureDeltaPct = Math.round((severityIndex - 1) * 100);

  const rainText = rainfallPct === 0 ? "unchanged rainfall intensity" : `${rainfallPct > 0 ? "+" : ""}${rainfallPct}% rainfall intensity`;
  const lakeText =
    lakeOverflowPct === 0 ? "an unchanged Bellandur Lake overflow rate" : `a ${Math.abs(lakeOverflowPct)}% ${lakeOverflowPct > 0 ? "higher" : "lower"} Bellandur Lake overflow rate`;
  const drainText =
    drainBlockagePct === 0
      ? "no additional storm-drain blockage"
      : `${Math.abs(drainBlockagePct)}% ${drainBlockagePct > 0 ? "more" : "less"} storm-drain (Raja Kaluve) blockage than the historical event`;

  const narrative =
    `${rainText[0].toUpperCase()}${rainText.slice(1)}, combined with ${lakeText} and ${drainText}, ` +
    `scales the flood radius around Silk Board Junction to ~${Math.round(impactRadiusKm)} km and the Koramangala valley drain corridor to ~${corridorWidthKm.toFixed(1)} km wide. ` +
    `Estimated exposure: $${(estimatedExposureUsd / 1_000_000).toFixed(1)}M (${exposureDeltaPct >= 0 ? "+" : ""}${exposureDeltaPct}% vs. the historical event), ` +
    `affecting an estimated ${estimatedAffectedPopulation.toLocaleString()} people.`;

  return {
    severityIndex,
    center: SILK_BOARD_JUNCTION,
    impactRadiusKm,
    corridorWidthKm,
    estimatedExposureUsd,
    estimatedAffectedPopulation,
    exposureDeltaPct,
    narrative,
  };
}

export const BANGALORE_SCENARIO: WhatIfScenario = {
  id: "bangalore-2022",
  city: "bangalore",
  title: "September 2022 Bengaluru Urban Floods",
  subtitle: "Adjust rainfall intensity, Bellandur Lake overflow, and storm-drain blockage.",
  landmarks: [{ label: "Bellandur Lake", ...BELLANDUR_LAKE, color: "#4d8fdb" }],
  corridorPath: KORAMANGALA_VALLEY_PATH,
  fitPoints: [BELLANDUR_LAKE, SILK_BOARD_JUNCTION, { lon: 77.6101, lat: 12.9081 }, { lon: 77.68, lat: 12.945 }],
  sliders: [
    { key: "rainfallPct", label: "Rainfall intensity", min: -30, max: 150, step: 10, unit: "%" },
    { key: "lakeOverflowPct", label: "Lake overflow rate", min: -50, max: 150, step: 10, unit: "%" },
    { key: "drainBlockagePct", label: "Storm-drain blockage", min: -50, max: 100, step: 10, unit: "%" },
  ],
  defaultParams: { rainfallPct: 0, lakeOverflowPct: 0, drainBlockagePct: 0 },
  simulate: simulateBangalore,
};

// ---------------------------------------------------------------------------
// Houston — Hurricane Harvey (Aug 2017): the storm stalled over southeast
// Texas for days, and controlled releases from the Addicks/Barker Reservoirs
// into Buffalo Bayou (on top of the record rainfall itself) drove much of
// the downstream flooding through central Houston.
// ---------------------------------------------------------------------------

const ADDICKS_RESERVOIR: LonLat = { lon: -95.6423, lat: 29.783 };
const BARKER_RESERVOIR: LonLat = { lon: -95.6395, lat: 29.7285 };
const DOWNTOWN_HOUSTON: LonLat = { lon: -95.3698, lat: 29.7604 };
const BUFFALO_BAYOU_PATH: LonLat[] = [
  ADDICKS_RESERVOIR,
  { lon: -95.56, lat: 29.775 },
  { lon: -95.5, lat: 29.77 },
  { lon: -95.44, lat: 29.765 },
  DOWNTOWN_HOUSTON,
  { lon: -95.34, lat: 29.755 },
];
// Harvey's general approach from the Gulf before stalling over the region —
// illustrative only, since the Houston flooding was driven by the storm
// sitting still and dumping rain, not by a direct-landfall track like
// Vardha's.
const HARVEY_GULF_APPROACH: LonLat[] = [
  { lon: -95.0, lat: 28.3 },
  { lon: -95.15, lat: 28.75 },
  { lon: -95.28, lat: 29.2 },
  DOWNTOWN_HOUSTON,
];

const HOUSTON_BASELINE_EXPOSURE_USD = 220_000_000;
const HOUSTON_BASELINE_POPULATION = 500_000;

function simulateHouston(params: Record<string, number>): SimResult {
  const stallPositionKm = params.stallPositionKm ?? 0;
  const rainfallPct = params.rainfallPct ?? 0;
  const reservoirReleasePct = params.reservoirReleasePct ?? 0;

  const severityIndex = Math.max(
    0.3,
    Math.min(3, 1 + rainfallPct * 0.009 + reservoirReleasePct * 0.006),
  );
  const downtownIdx = BUFFALO_BAYOU_PATH.findIndex(
    (p) => p.lat === DOWNTOWN_HOUSTON.lat && p.lon === DOWNTOWN_HOUSTON.lon,
  );
  const center = pointAtDistanceAlongPath(BUFFALO_BAYOU_PATH, downtownIdx, stallPositionKm, 1);
  const impactRadiusKm = Math.max(6, 22 * (1 + rainfallPct * 0.007));
  const corridorWidthKm = Math.max(0.5, 2.2 * (1 + reservoirReleasePct * 0.01));
  const estimatedExposureUsd = Math.round(HOUSTON_BASELINE_EXPOSURE_USD * severityIndex);
  const estimatedAffectedPopulation = Math.round(HOUSTON_BASELINE_POPULATION * severityIndex);
  const exposureDeltaPct = Math.round((severityIndex - 1) * 100);

  const stallText =
    stallPositionKm === 0
      ? "stalled over its historical position along Buffalo Bayou"
      : `stalled about ${Math.abs(Math.round(stallPositionKm))} km ${stallPositionKm > 0 ? "east" : "west"} of downtown`;
  const rainText = rainfallPct === 0 ? "unchanged rainfall totals" : `${rainfallPct > 0 ? "+" : ""}${rainfallPct}% rainfall totals`;
  const releaseText =
    reservoirReleasePct === 0
      ? "an unchanged Addicks/Barker Reservoir release rate"
      : `a ${Math.abs(reservoirReleasePct)}% ${reservoirReleasePct > 0 ? "higher" : "lower"} Addicks/Barker Reservoir release rate`;

  const narrative =
    `The storm ${stallText}, with ${rainText}, combined with ${releaseText}, ` +
    `scales the impact radius to ~${Math.round(impactRadiusKm)} km and the Buffalo Bayou flood corridor to ~${corridorWidthKm.toFixed(1)} km wide. ` +
    `Estimated exposure: $${(estimatedExposureUsd / 1_000_000).toFixed(1)}M (${exposureDeltaPct >= 0 ? "+" : ""}${exposureDeltaPct}% vs. the historical event), ` +
    `affecting an estimated ${estimatedAffectedPopulation.toLocaleString()} people.`;

  return { severityIndex, center, impactRadiusKm, corridorWidthKm, estimatedExposureUsd, estimatedAffectedPopulation, exposureDeltaPct, narrative };
}

export const HOUSTON_SCENARIO: WhatIfScenario = {
  id: "houston-harvey",
  city: "houston",
  title: "Hurricane Harvey — Aug 2017 Buffalo Bayou Flooding",
  subtitle: "Adjust the stall position, rainfall totals, and the Addicks/Barker Reservoir release rate.",
  landmarks: [
    { label: "Addicks Reservoir", ...ADDICKS_RESERVOIR, color: "#df6500" },
    { label: "Barker Reservoir", ...BARKER_RESERVOIR, color: "#df6500" },
  ],
  corridorPath: BUFFALO_BAYOU_PATH,
  trackPath: HARVEY_GULF_APPROACH,
  fitPoints: [...BUFFALO_BAYOU_PATH, BARKER_RESERVOIR, { lon: -95.3, lat: 29.7 }],
  sliders: [
    { key: "stallPositionKm", label: "Stall position", min: -40, max: 40, step: 5, unit: "km" },
    { key: "rainfallPct", label: "Rainfall totals", min: -30, max: 150, step: 10, unit: "%" },
    { key: "reservoirReleasePct", label: "Reservoir release rate", min: -50, max: 150, step: 10, unit: "%" },
  ],
  defaultParams: { stallPositionKm: 0, rainfallPct: 0, reservoirReleasePct: 0 },
  simulate: simulateHouston,
};

export const WHATIF_SCENARIOS: Record<string, WhatIfScenario> = {
  houston: HOUSTON_SCENARIO,
  chennai: CHENNAI_SCENARIO,
  bangalore: BANGALORE_SCENARIO,
};
