"""Harris County Flood Control District (HCFCD) rainfall/stream gauge adapter.

HCFCD publishes its Flood Warning System gauge network through an Esri
ArcGIS FeatureServer/MapServer (harriscountyfws.org backs onto
services.arcgis.com). Live queries use the standard Esri REST `query`
operation with `f=json` and `outFields=*`. No API key required for the public
layers.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import httpx

from app.evidence.base import EvidenceAdapter, EvidenceAdapterError
from app.models.schemas import EvidenceItem, EvidenceSource

# Public HCFCD "Rainfall and Stream Gauges" layer.
HCFCD_GAUGE_LAYER = "/FWS/MapServer/0/query"


class HCFCDAdapter(EvidenceAdapter):
    source = EvidenceSource.HCFCD
    fixture_filename = "hcfcd_gauges.json"

    async def _fetch_live(self, *, polygon, window_start, window_end) -> list[dict[str, Any]]:
        params = {
            "where": "1=1",
            "outFields": "*",
            "f": "json",
            "returnGeometry": "true",
        }
        client = self._client or httpx.AsyncClient(timeout=self.settings.http_timeout_seconds)
        try:
            resp = await client.get(f"{self.settings.hcfcd_base_url}{HCFCD_GAUGE_LAYER}", params=params)
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            raise EvidenceAdapterError(str(exc)) from exc
        finally:
            if self._client is None:
                await client.aclose()
        payload = resp.json()
        return payload.get("features", [])

    def _normalize(self, raw: dict[str, Any], *, is_replay: bool) -> EvidenceItem:
        attrs = raw["attributes"]
        geom = raw.get("geometry", {})
        observed_ms = attrs.get("ReadingDate") or attrs.get("LastUpdate")
        observed_at = (
            datetime.fromtimestamp(observed_ms / 1000, tz=timezone.utc)
            if isinstance(observed_ms, (int, float))
            else datetime.now(timezone.utc)
        )
        level = attrs.get("SensorValue", attrs.get("RainfallAccum", "n/a"))
        return EvidenceItem(
            source=self.source,
            source_record_id=str(attrs.get("SensorID") or attrs.get("GaugeID")),
            observed_at=observed_at,
            latitude=geom.get("y", 29.76),
            longitude=geom.get("x", -95.37),
            summary=f"{attrs.get('GaugeName', 'HCFCD gauge')}: reading {level} ({attrs.get('SensorStatus', 'ok')})",
            raw=raw,
            is_replay=is_replay,
        )
