"""
Population / vulnerability baseline adapter — CDC/ATSDR Social Vulnerability
Index (SVI), 2022 vintage.

This is context, not flood-hazard evidence: it never participates in
evidence_verifier's source-agreement scoring (see HAZARD_SOURCES there). It
exists so decision outputs (life-safety guidance, evacuation planning) can
be told who's actually in the footprint and how vulnerable they are, instead
of reasoning about an empty polygon.

Live endpoint: CDC's own public "OneMap" ArcGIS Server. Verified live and
keyless — no API key, no signup. E_TOTPOP on this layer is itself sourced
from Census ACS 5-year estimates, which is why this one adapter covers both
"population baseline" and "SVI vulnerability": a separate Census ACS pull
would need its own API key (api.census.gov now hard-requires one) for
numbers already present here.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import httpx

from app.evidence.base import EvidenceAdapter, EvidenceAdapterError
from app.models.schemas import EvidenceItem, EvidenceSource


class PopulationSviAdapter(EvidenceAdapter):
    source = EvidenceSource.POPULATION_SVI
    fixture_filename = "population_svi.json"

    async def _fetch_live(self, *, polygon, window_start, window_end) -> list[dict[str, Any]]:
        lons = [p[0] for p in polygon]
        lats = [p[1] for p in polygon]
        geometry = f"{min(lons)},{min(lats)},{max(lons)},{max(lats)}"
        client = self._client or httpx.AsyncClient(timeout=self.settings.http_timeout_seconds)
        try:
            resp = await client.get(
                f"{self.settings.svi_base_url}/query",
                params={
                    "geometry": geometry,
                    "geometryType": "esriGeometryEnvelope",
                    "inSR": "4326",
                    "spatialRel": "esriSpatialRelIntersects",
                    "outFields": "STATE,COUNTY,FIPS,LOCATION,RPL_THEMES,RPL_THEME1,RPL_THEME2,RPL_THEME3,RPL_THEME4,E_TOTPOP",
                    "returnGeometry": "false",
                    "f": "json",
                },
            )
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            raise EvidenceAdapterError(str(exc)) from exc
        finally:
            if self._client is None:
                await client.aclose()

        payload = resp.json()
        if "error" in payload:
            raise EvidenceAdapterError(f"CDC SVI service error: {payload['error']}")
        tracts = [f["attributes"] for f in payload.get("features", [])]
        if not tracts:
            raise EvidenceAdapterError("CDC SVI query returned no tracts for this footprint")

        valid = [t for t in tracts if t.get("E_TOTPOP") and t["E_TOTPOP"] > 0]
        total_pop = sum(t["E_TOTPOP"] for t in valid)
        weighted = sum(
            t["E_TOTPOP"] * t["RPL_THEMES"] for t in valid if t.get("RPL_THEMES") is not None and t["RPL_THEMES"] >= 0
        )
        worst = max(tracts, key=lambda t: t.get("RPL_THEMES") or 0)

        aggregated = {
            "total_population": total_pop,
            "area_weighted_svi": round(weighted / total_pop, 4) if total_pop else None,
            "tract_count": len(tracts),
            "most_vulnerable_tract": {
                "fips": worst.get("FIPS"),
                "location": worst.get("LOCATION"),
                "rpl_themes": worst.get("RPL_THEMES"),
                "population": worst.get("E_TOTPOP"),
            },
            "centroid_latitude": sum(lats) / len(lats),
            "centroid_longitude": sum(lons) / len(lons),
            "tracts": tracts,
        }
        # One aggregated "record" -> one EvidenceItem, same base-class
        # contract every other adapter uses (fetch() normalizes each element
        # of this list); aggregating here (not in _normalize) keeps the
        # base class untouched and matches how the fixture is authored.
        return [aggregated]

    def _normalize(self, raw: dict[str, Any], *, is_replay: bool) -> EvidenceItem:
        svi = raw.get("area_weighted_svi")
        svi_str = f"{svi:.2f} percentile" if svi is not None else "n/a"
        worst = raw.get("most_vulnerable_tract", {})
        summary = (
            f"Population ~{raw['total_population']:,} across {raw['tract_count']} census tracts in the event "
            f"footprint; area-weighted SVI {svi_str} (0=least, 1=most vulnerable). Most vulnerable tract: "
            f"{worst.get('location', 'n/a')} at {worst.get('rpl_themes')}."
        )
        return EvidenceItem(
            source=self.source,
            source_record_id=f"svi-bbox-{raw['tract_count']}tracts",
            observed_at=datetime.now(timezone.utc),
            latitude=raw["centroid_latitude"],
            longitude=raw["centroid_longitude"],
            summary=summary,
            raw=raw,
            is_replay=is_replay,
        )
