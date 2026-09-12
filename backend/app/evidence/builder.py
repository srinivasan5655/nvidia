from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import httpx

from app.config import Settings
from app.evidence.fema import FEMAAdapter
from app.evidence.hcfcd import HCFCDAdapter
from app.evidence.nws import NWSAdapter
from app.evidence.population_svi import PopulationSviAdapter
from app.evidence.shelters import ShelterAdapter
from app.evidence.transtar import TranStarAdapter
from app.evidence.usgs import USGSAdapter
from app.models.schemas import EventBundle

# Illustrative synthetic event polygon over central Houston / Buffalo Bayou —
# matches the scenario in the deck ("one replayed Houston event").
HOUSTON_EVENT_POLYGON = [
    [-95.45, 29.82],
    [-95.30, 29.82],
    [-95.30, 29.70],
    [-95.45, 29.70],
    [-95.45, 29.82],
]


async def build_event_bundle(settings: Settings, *, label: str = "Houston heavy-rain event") -> EventBundle:
    """Fan out to all seven evidence adapters in parallel and assemble one
    auditable EventBundle. This is the ONLY place raw source data is touched;
    everything downstream sees EvidenceItem envelopes only. Five are
    flood-hazard sources; population_svi and osm_shelter are context
    (population/vulnerability baseline, real shelter candidates) that
    evidence_verifier deliberately excludes from its agreement scoring."""
    now = datetime.now(timezone.utc)
    window_start = now - timedelta(hours=6)
    window_end = now

    async with httpx.AsyncClient(timeout=settings.http_timeout_seconds) as client:
        adapters = [
            NWSAdapter(settings, client),
            USGSAdapter(settings, client),
            HCFCDAdapter(settings, client),
            TranStarAdapter(settings, client),
            FEMAAdapter(settings, client),
            PopulationSviAdapter(settings, client),
            ShelterAdapter(settings, client),
        ]
        results = await asyncio.gather(
            *[a.fetch(polygon=HOUSTON_EVENT_POLYGON, window_start=window_start, window_end=window_end) for a in adapters],
            return_exceptions=True,
        )

    items = []
    for adapter, result in zip(adapters, results):
        if isinstance(result, Exception):
            # A fully failed source is absence of evidence, not a crash — the
            # evidence verifier gate scores that absence explicitly.
            continue
        items.extend(result)

    bundle = EventBundle(
        label=label,
        polygon=HOUSTON_EVENT_POLYGON,
        window_start=window_start,
        window_end=window_end,
        items=items,
        field_image_path="app/evidence/fixtures/field_image_flood.jpg",
        evidence_mode=settings.evidence_mode,
    )
    return bundle
