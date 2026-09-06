"""Houston TranStar road-incidents adapter.

Live endpoint: TranStar publishes JSON incident feeds at
https://traffic.houstontranstar.org/api/incidents.json (sample feeds are
public; sustained/production access requires coordinating with TranStar per
their API docs — this is the exact blocker called out in the deck, mitigated
here by falling back to the replay fixture transparently).
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

import httpx

from app.evidence.base import EvidenceAdapter, EvidenceAdapterError
from app.models.schemas import EvidenceItem, EvidenceSource

FLOOD_RELEVANT_TYPES = {"high water", "flooding", "road closure", "hazard"}


class TranStarAdapter(EvidenceAdapter):
    source = EvidenceSource.TRANSTAR
    fixture_filename = "transtar_incidents.json"

    async def _fetch_live(self, *, polygon, window_start, window_end) -> list[dict[str, Any]]:
        client = self._client or httpx.AsyncClient(timeout=self.settings.http_timeout_seconds)
        try:
            resp = await client.get(f"{self.settings.transtar_base_url}/incidents.json")
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            raise EvidenceAdapterError(str(exc)) from exc
        finally:
            if self._client is None:
                await client.aclose()
        payload = resp.json()
        incidents = payload.get("incidents", payload if isinstance(payload, list) else [])
        return [
            i for i in incidents
            if any(t in (i.get("type", "") + i.get("description", "")).lower() for t in FLOOD_RELEVANT_TYPES)
        ]

    def _normalize(self, raw: dict[str, Any], *, is_replay: bool) -> EvidenceItem:
        return EvidenceItem(
            source=self.source,
            source_record_id=str(raw.get("id") or raw.get("incident_id")),
            observed_at=_parse_dt(raw.get("last_updated") or raw.get("start_time")),
            latitude=float(raw.get("latitude", 29.76)),
            longitude=float(raw.get("longitude", -95.37)),
            summary=f"{raw.get('type', 'Incident')} on {raw.get('roadway', raw.get('location', 'unknown roadway'))}: {raw.get('description', '')}",
            raw=raw,
            is_replay=is_replay,
        )


def _parse_dt(value: str | None) -> datetime:
    if not value:
        return datetime.utcnow()
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(value[:19], fmt)
        except ValueError:
            continue
    return datetime.utcnow()
