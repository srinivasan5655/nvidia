"""
Shelter-candidate adapter — real community centers and social-service
facilities from OpenStreetMap (Overpass API), used by the evacuation
planner as real routing destinations.

Deliberately queries `amenity=community_centre` and `social_facility=shelter`
only. An earlier pass also queried bare `amenity=shelter`, but inspecting the
live response for this exact footprint showed it almost entirely tags small
park picnic gazebos/pavilions (`shelter_type=gazebo|pavilion`) — not
emergency-capable buildings — so including it would have put a park gazebo
on the map next to "Human Review" evacuation guidance. Dropped rather than
filtered post-hoc, since a live query elsewhere could still surface the same
mislabeled category.

This is context, not flood-hazard evidence — excluded from evidence_verifier's
scoring (see HAZARD_SOURCES there) — and it is NOT an official designated-
shelter registry. It's real, named, real-world buildings that plausibly serve
a community-gathering function; the UI labels it accordingly.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import httpx

from app.evidence.base import EvidenceAdapter, EvidenceAdapterError
from app.models.schemas import EvidenceItem, EvidenceSource

MAX_SHELTERS = 8


class ShelterAdapter(EvidenceAdapter):
    source = EvidenceSource.OSM_SHELTER
    fixture_filename = "osm_shelters.json"

    async def _fetch_live(self, *, polygon, window_start, window_end) -> list[dict[str, Any]]:
        lons = [p[0] for p in polygon]
        lats = [p[1] for p in polygon]
        bbox = f"{min(lats)},{min(lons)},{max(lats)},{max(lons)}"
        query = (
            "[out:json][timeout:25];"
            f'(node["amenity"="community_centre"]({bbox});'
            f'way["amenity"="community_centre"]({bbox});'
            f'node["social_facility"="shelter"]({bbox});'
            f'way["social_facility"="shelter"]({bbox}););'
            "out center;"
        )
        client = self._client or httpx.AsyncClient(timeout=self.settings.http_timeout_seconds)
        try:
            resp = await client.post(self.settings.overpass_base_url, data={"data": query})
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            raise EvidenceAdapterError(str(exc)) from exc
        finally:
            if self._client is None:
                await client.aclose()

        payload = resp.json()
        cx, cy = sum(lons) / len(lons), sum(lats) / len(lats)
        candidates = []
        for el in payload.get("elements", []):
            tags = el.get("tags", {})
            name = tags.get("name")
            lat = el.get("lat") or el.get("center", {}).get("lat")
            lon = el.get("lon") or el.get("center", {}).get("lon")
            if not name or lat is None or lon is None:
                continue
            dist = ((lon - cx) ** 2 + (lat - cy) ** 2) ** 0.5
            candidates.append(
                (
                    dist,
                    {
                        "osm_type": el.get("type"),
                        "osm_id": el.get("id"),
                        "name": name,
                        "tag": tags.get("amenity") or tags.get("social_facility"),
                        "latitude": lat,
                        "longitude": lon,
                    },
                )
            )
        candidates.sort(key=lambda c: c[0])
        if not candidates:
            raise EvidenceAdapterError("Overpass query returned no named community-center/shelter nodes")
        return [c[1] for c in candidates[:MAX_SHELTERS]]

    def _normalize(self, raw: dict[str, Any], *, is_replay: bool) -> EvidenceItem:
        return EvidenceItem(
            source=self.source,
            source_record_id=f"{raw['osm_type']}/{raw['osm_id']}",
            observed_at=datetime.now(timezone.utc),
            latitude=raw["latitude"],
            longitude=raw["longitude"],
            summary=f"{raw['name']} ({raw['tag'].replace('_', ' ')}) — candidate community shelter site",
            raw=raw,
            is_replay=is_replay,
        )
