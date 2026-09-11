"""FEMA declarations / flood-zone adapter.

Live endpoint: OpenFEMA API v2 (https://www.fema.gov/api/open/v2) — public,
no API key, OData-style `$filter` query params. We pull
`DisasterDeclarationsSummaries` filtered to Texas / Harris County to establish
whether the event area sits inside a declared or pending disaster area.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import httpx

from app.evidence.base import EvidenceAdapter, EvidenceAdapterError
from app.models.schemas import EvidenceItem, EvidenceSource


class FEMAAdapter(EvidenceAdapter):
    source = EvidenceSource.FEMA
    fixture_filename = "fema_zones.json"

    async def _fetch_live(self, *, polygon, window_start, window_end) -> list[dict[str, Any]]:
        params = {
            "$filter": "state eq 'TX' and designatedArea eq 'Harris (County)'",
            "$orderby": "declarationDate desc",
            "$top": "10",
        }
        client = self._client or httpx.AsyncClient(timeout=self.settings.http_timeout_seconds)
        try:
            resp = await client.get(
                f"{self.settings.fema_base_url}/DisasterDeclarationsSummaries", params=params
            )
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            raise EvidenceAdapterError(str(exc)) from exc
        finally:
            if self._client is None:
                await client.aclose()
        payload = resp.json()
        return payload.get("DisasterDeclarationsSummaries", [])

    def _normalize(self, raw: dict[str, Any], *, is_replay: bool) -> EvidenceItem:
        return EvidenceItem(
            source=self.source,
            source_record_id=str(raw.get("disasterNumber")),
            observed_at=_parse_dt(raw.get("declarationDate")),
            latitude=raw.get("latitude", 29.76),
            longitude=raw.get("longitude", -95.37),
            summary=f"FEMA {raw.get('incidentType', 'Disaster')} declaration #{raw.get('disasterNumber')} — {raw.get('declarationTitle', '')} ({raw.get('designatedArea', '')})",
            raw=raw,
            is_replay=is_replay,
        )


def _parse_dt(value: str | None) -> datetime:
    if not value:
        return datetime.now(timezone.utc)
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
