"""NWS (National Weather Service) active-alerts adapter.

Live endpoint: https://api.weather.gov/alerts/active — public, no API key,
requires a descriptive User-Agent per NWS API policy. Returns GeoJSON
FeatureCollection; each feature's `properties` carries event/severity/areaDesc
and the alert's own `id` (a URN) which we use as the lineage identifier.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

import httpx

from app.evidence.base import EvidenceAdapter, EvidenceAdapterError
from app.models.schemas import EvidenceItem, EvidenceSource


class NWSAdapter(EvidenceAdapter):
    source = EvidenceSource.NWS
    fixture_filename = "nws_alerts.json"

    async def _fetch_live(self, *, polygon, window_start, window_end) -> list[dict[str, Any]]:
        headers = {"User-Agent": "LifeShield-AI (hackathon-demo, contact: team@lifeshield.ai)", "Accept": "application/geo+json"}
        params = {"area": "TX", "status": "actual", "message_type": "alert"}
        client = self._client or httpx.AsyncClient(timeout=self.settings.http_timeout_seconds)
        try:
            resp = await client.get(f"{self.settings.nws_base_url}/alerts/active", params=params, headers=headers)
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            raise EvidenceAdapterError(str(exc)) from exc
        finally:
            if self._client is None:
                await client.aclose()
        payload = resp.json()
        features = payload.get("features", [])
        # Keep only hydrology-relevant alert types for a flood event bundle.
        relevant = {"Flood Warning", "Flash Flood Warning", "Flood Advisory", "Heavy Rain", "Flood Watch"}
        return [f for f in features if f.get("properties", {}).get("event") in relevant]

    def _normalize(self, raw: dict[str, Any], *, is_replay: bool) -> EvidenceItem:
        props = raw["properties"]
        geom = raw.get("geometry") or {}
        lat, lon = _representative_point(geom, props.get("geocode", {}))
        return EvidenceItem(
            source=self.source,
            source_record_id=props.get("id", raw.get("id", "unknown")),
            observed_at=_parse_dt(props.get("effective") or props.get("sent")),
            latitude=lat,
            longitude=lon,
            summary=f"{props.get('event')}: {props.get('headline') or props.get('areaDesc')}",
            raw=raw,
            is_replay=is_replay,
        )


def _parse_dt(value: str | None) -> datetime:
    if not value:
        return datetime.utcnow()
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _representative_point(geometry: dict, geocode: dict) -> tuple[float, float]:
    """NWS alert polygons can be null (county/zone-only alerts). Fall back to
    the Houston/Harris-County centroid used across the fixtures when absent."""
    if geometry and geometry.get("type") == "Polygon":
        coords = geometry["coordinates"][0]
        lons = [c[0] for c in coords]
        lats = [c[1] for c in coords]
        return sum(lats) / len(lats), sum(lons) / len(lons)
    return 29.7604, -95.3698  # downtown Houston
