"""USGS instantaneous-values (IV) gauge adapter.

Live endpoint: https://waterservices.usgs.gov/nwis/iv/?format=json — public,
no API key. We query named Harris County / Houston bayou gauges for gauge
height (parameter 00065, ft) and discharge (00060, cfs). Response shape is the
standard USGS WaterML-JSON `value.timeSeries[]` structure.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

import httpx

from app.evidence.base import EvidenceAdapter, EvidenceAdapterError
from app.models.schemas import EvidenceItem, EvidenceSource

# Harris County / Houston-area bayou gauges monitored for this event bundle.
HOUSTON_GAUGE_SITES = [
    "08074500",  # Brays Bayou at Houston, TX
    "08073600",  # Buffalo Bayou at Houston, TX
    "08075000",  # Sims Bayou at Houston, TX
    "08074000",  # Buffalo Bayou at Piney Point, TX
]


class USGSAdapter(EvidenceAdapter):
    source = EvidenceSource.USGS
    fixture_filename = "usgs_gauges.json"

    async def _fetch_live(self, *, polygon, window_start, window_end) -> list[dict[str, Any]]:
        params = {
            "format": "json",
            "sites": ",".join(HOUSTON_GAUGE_SITES),
            "parameterCd": "00065,00060",
            "siteStatus": "active",
        }
        client = self._client or httpx.AsyncClient(timeout=self.settings.http_timeout_seconds)
        try:
            resp = await client.get(self.settings.usgs_base_url, params=params)
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            raise EvidenceAdapterError(str(exc)) from exc
        finally:
            if self._client is None:
                await client.aclose()
        payload = resp.json()
        series = payload.get("value", {}).get("timeSeries", [])
        return series

    def _normalize(self, raw: dict[str, Any], *, is_replay: bool) -> EvidenceItem:
        site = raw["sourceInfo"]
        geo = site["geoLocation"]["geogLocation"]
        variable = raw["variable"]["variableCode"][0]["value"]
        values = raw["values"][0]["value"]
        latest = values[-1] if values else {"value": "NaN", "dateTime": datetime.utcnow().isoformat()}
        var_name = "gauge height (ft)" if variable == "00065" else "discharge (cfs)"
        return EvidenceItem(
            source=self.source,
            source_record_id=f"{site['siteCode'][0]['value']}:{variable}",
            observed_at=_parse_dt(latest["dateTime"]),
            latitude=float(geo["latitude"]),
            longitude=float(geo["longitude"]),
            summary=f"{site['siteName']}: {var_name} = {latest['value']}",
            raw=raw,
            is_replay=is_replay,
        )


def _parse_dt(value: str) -> datetime:
    v = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(v)
    except ValueError:
        return datetime.fromisoformat(v.split(".")[0] + "+00:00")
