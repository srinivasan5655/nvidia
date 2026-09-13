"""
Decision Output C — Evacuation Plan.

Same discipline as insurer_exposure.py: deterministic, not a black box. No
model ever picks a shelter or draws a route. Shelters come from the
osm_shelter evidence adapter (real OpenStreetMap community-center/social-
facility nodes — see evidence/shelters.py for why bare amenity=shelter was
excluded). Routes come from OSRM (a real public routing engine) computing
an actual path over the real Houston road network from a risk origin to
each candidate shelter.

Two things are explicitly NOT attempted, because we don't have the data to
back them honestly:
  - Routing "around" flooded roads. OSRM has no live knowledge of which
    roads are currently impassable. Instead, each route is checked against
    known TranStar closure points and flagged (not rerouted) when it passes
    close to one — an honest "here's a risk," not a false "this route
    avoids it."
  - An authoritative shelter roster or capacity numbers. osm_shelter is
    real, named, real-world buildings, but not an official designated-
    shelter list — the UI must keep that caveat visible, not just this
    module.
"""
from __future__ import annotations

import asyncio
import math

import httpx

from app.config import Settings
from app.models.schemas import EventBundle, EvacuationPlan, EvacuationRouteLeg, EvidenceItem, EvidenceSource

MAX_ROUTES = 3
CLOSURE_PROXIMITY_KM = 0.35  # a route point within this distance of a reported closure gets flagged
EARTH_RADIUS_KM = 6371.0


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def _origin_point(bundle: EventBundle) -> tuple[float, float, str]:
    """Prefer the centroid of reported high-water/road-closure incidents (a
    real signal of where the risk actually is) over the raw polygon centroid
    (an arbitrary rectangle center)."""
    closure_points = [i for i in bundle.items if i.source == EvidenceSource.TRANSTAR]
    if closure_points:
        lat = sum(i.latitude for i in closure_points) / len(closure_points)
        lon = sum(i.longitude for i in closure_points) / len(closure_points)
        return lat, lon, "centroid of reported high-water/closure incidents (TranStar)"
    lons = [p[0] for p in bundle.polygon]
    lats = [p[1] for p in bundle.polygon]
    return sum(lats) / len(lats), sum(lons) / len(lons), "event footprint centroid (no closure reports to center on)"


def _route_crosses_closure(geometry: list[list[float]], closures: list[EvidenceItem]) -> list[str]:
    warnings = []
    for closure in closures:
        for lon, lat in geometry:
            if _haversine_km(lat, lon, closure.latitude, closure.longitude) <= CLOSURE_PROXIMITY_KM:
                warnings.append(closure.summary)
                break
    return warnings


async def _route_via_osrm(
    settings: Settings, client: httpx.AsyncClient, origin: tuple[float, float], dest: tuple[float, float]
) -> tuple[list[list[float]], float, float, bool]:
    """Returns (geometry, distance_km, duration_min, routed_live). Falls back
    to a straight two-point line and great-circle distance/a 50km/h estimate
    if OSRM is unreachable — labeled routed_live=False so the UI never
    presents an estimate as a real route."""
    olat, olon = origin
    dlat, dlon = dest
    try:
        resp = await client.get(
            f"{settings.osrm_base_url}/route/v1/driving/{olon},{olat};{dlon},{dlat}",
            params={"overview": "full", "geometries": "geojson"},
        )
        resp.raise_for_status()
        data = resp.json()
        if data.get("code") != "Ok" or not data.get("routes"):
            raise ValueError(f"OSRM returned no route: {data.get('code')}")
        route = data["routes"][0]
        geometry = route["geometry"]["coordinates"]
        return geometry, route["distance"] / 1000, route["duration"] / 60, True
    except Exception:  # noqa: BLE001 - routing service unreachable/misbehaving -> honest straight-line fallback
        dist_km = _haversine_km(olat, olon, dlat, dlon)
        return [[olon, olat], [dlon, dlat]], round(dist_km, 2), round(dist_km / 50 * 60, 1), False


async def compute_evacuation_plan(
    bundle: EventBundle, settings: Settings, *, confidence: float
) -> EvacuationPlan | None:
    shelters = [i for i in bundle.items if i.source == EvidenceSource.OSM_SHELTER]
    closures = [i for i in bundle.items if i.source == EvidenceSource.TRANSTAR]
    if not shelters:
        return None  # no candidate destinations in this footprint — nothing to plan

    origin_lat, origin_lon, origin_basis = _origin_point(bundle)
    ranked = sorted(shelters, key=lambda s: _haversine_km(origin_lat, origin_lon, s.latitude, s.longitude))[
        : MAX_ROUTES * 2
    ]  # over-fetch by straight-line distance, then rank the real routes below

    # One OSRM request per candidate shelter, in parallel — sequential
    # round-trips to the public demo server (6 awaited one at a time) were
    # adding enough latency to blow past the frontend's SSE watchdog and
    # trigger a full second pipeline run via its POST /replay fallback.
    async with httpx.AsyncClient(timeout=settings.http_timeout_seconds) as client:
        results = await asyncio.gather(
            *[
                _route_via_osrm(settings, client, (origin_lat, origin_lon), (shelter.latitude, shelter.longitude))
                for shelter in ranked
            ]
        )

    routes: list[EvacuationRouteLeg] = []
    any_live = False
    for shelter, (geometry, distance_km, duration_min, routed_live) in zip(ranked, results):
        any_live = any_live or routed_live
        routes.append(
            EvacuationRouteLeg(
                shelter_item_id=shelter.item_id,
                shelter_name=shelter.raw.get("name", shelter.summary),
                shelter_latitude=shelter.latitude,
                shelter_longitude=shelter.longitude,
                distance_km=round(distance_km, 2),
                duration_min=round(duration_min, 1),
                route_geometry=geometry,
                routed_live=routed_live,
                closure_warnings=_route_crosses_closure(geometry, closures),
            )
        )

    routes.sort(key=lambda r: r.distance_km)
    routes = routes[:MAX_ROUTES]

    methodology = (
        "Shelters are real OpenStreetMap community-center/social-facility nodes in the event footprint "
        "(not an official designated-shelter registry). Routes are computed by OSRM over the real "
        f"{bundle.city_label} road network from the centroid of reported high-water/closure incidents; a route "
        "is flagged, never rerouted, when it passes within "
        f"{CLOSURE_PROXIMITY_KM * 1000:.0f}m of a reported closure. No model selects a shelter or draws a route — "
        "this is deterministic routing math, same discipline as the insurer-exposure calculation."
    )

    return EvacuationPlan(
        origin_latitude=origin_lat,
        origin_longitude=origin_lon,
        origin_basis=origin_basis,
        routes=routes,
        methodology=methodology,
        confidence=confidence if any_live else min(confidence, 0.5),
        citing_evidence=[s.item_id for s in shelters] + [c.item_id for c in closures],
    )
