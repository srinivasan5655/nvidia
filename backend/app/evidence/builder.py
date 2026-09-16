from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable, Optional

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

# (stage_name, payload) -> None, same shape as orchestrator.ProgressCallback
# — kept as a separate alias here rather than importing the orchestrator's
# (which would be a backwards import, evidence -> orchestrator).
ProgressCallback = Callable[[str, dict[str, Any]], Awaitable[None]]


async def _emit(on_progress: Optional[ProgressCallback], stage: str, payload: dict[str, Any]) -> None:
    if on_progress is not None:
        await on_progress(stage, payload)

# Illustrative synthetic event polygon over central Houston / Buffalo Bayou —
# matches the scenario in the deck ("one replayed Houston event").
HOUSTON_EVENT_POLYGON = [
    [-95.45, 29.82],
    [-95.30, 29.82],
    [-95.30, 29.70],
    [-95.45, 29.70],
    [-95.45, 29.82],
]

# Chennai (Adyar/Cooum river corridor) and Bangalore (Bellandur/Koramangala/
# Silk Board corridor) — illustrative demo scenarios only: there is no live
# Indian equivalent of NWS/USGS/HCFCD/TranStar/FEMA, so these two cities only
# ever run in replay mode against the fixtures in fixtures/<city>/.
CHENNAI_EVENT_POLYGON = [
    [80.18, 13.06],
    [80.28, 13.06],
    [80.28, 12.96],
    [80.18, 12.96],
    [80.18, 13.06],
]
BANGALORE_EVENT_POLYGON = [
    [77.58, 12.98],
    [77.70, 12.98],
    [77.70, 12.90],
    [77.58, 12.90],
    [77.58, 12.98],
]

CityKey = str  # "houston" | "chennai" | "bangalore"


class CityConfig:
    def __init__(self, key: str, display_name: str, default_label: str, polygon: list[list[float]]):
        self.key = key
        self.display_name = display_name
        self.default_label = default_label
        self.polygon = polygon


CITY_CONFIGS: dict[CityKey, CityConfig] = {
    "houston": CityConfig("houston", "Houston, TX", "Houston Heavy-Rain Event", HOUSTON_EVENT_POLYGON),
    "chennai": CityConfig(
        "chennai", "Chennai, India", "Cyclone Vardha & December 2015 Chennai Floods", CHENNAI_EVENT_POLYGON
    ),
    "bangalore": CityConfig(
        "bangalore", "Bengaluru, India", "September 2022 Bengaluru Urban Floods", BANGALORE_EVENT_POLYGON
    ),
}


async def _fetch_source(
    adapter,
    *,
    polygon,
    window_start,
    window_end,
    city: str,
    on_progress: Optional[ProgressCallback],
    index: int,
    evidence_mode: str,
):
    """Wraps one adapter's fetch so 'source_fetching' progress emits the
    moment THAT source resolves — not after every source in the batch
    finishes. Adapters still run concurrently via asyncio.gather below; the
    emit happens inside each wrapped coroutine, so the UI sees sources
    light up in their real completion order, live, not a simulated
    sequence.

    In replay mode, fixture reads resolve in single-digit milliseconds —
    real data, but too fast for the per-source status list to be
    perceptible as "checking each source" rather than a flash. `index`
    staggers each source's start by a fixed amount so they visibly cascade
    one at a time, and a short pause before 'done' keeps the spinner on
    screen briefly instead of flipping to a checkmark instantly. Live mode
    already has real, honest network latency here and is left alone —
    padding it would only make the app slower for no reason."""
    source_name = adapter.source.value
    if evidence_mode == "replay":
        await asyncio.sleep(0.35 * index)
    await _emit(on_progress, "source_fetching", {"source": source_name, "status": "started"})
    try:
        result = await adapter.fetch(polygon=polygon, window_start=window_start, window_end=window_end, city=city)
        if evidence_mode == "replay":
            await asyncio.sleep(0.3)
        await _emit(
            on_progress, "source_fetching", {"source": source_name, "status": "done", "item_count": len(result)}
        )
        return result
    except Exception:
        await _emit(on_progress, "source_fetching", {"source": source_name, "status": "failed"})
        raise


async def build_event_bundle(
    settings: Settings,
    *,
    label: str = "Houston heavy-rain event",
    city: CityKey = "houston",
    on_progress: Optional[ProgressCallback] = None,
) -> EventBundle:
    """Fan out to all seven evidence adapters in parallel and assemble one
    auditable EventBundle. This is the ONLY place raw source data is touched;
    everything downstream sees EvidenceItem envelopes only. Five are
    flood-hazard sources; population_svi and osm_shelter are context
    (population/vulnerability baseline, real shelter candidates) that
    evidence_verifier deliberately excludes from its agreement scoring.
    ``on_progress``, when given, is awaited with a 'source_fetching' stage
    as each individual adapter starts/finishes/fails — real per-source
    status, not a simulated loading sequence."""
    city_config = CITY_CONFIGS.get(city, CITY_CONFIGS["houston"])
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
            *[
                _fetch_source(
                    a,
                    polygon=city_config.polygon,
                    window_start=window_start,
                    window_end=window_end,
                    city=city_config.key,
                    on_progress=on_progress,
                    index=i,
                    evidence_mode=settings.evidence_mode,
                )
                for i, a in enumerate(adapters)
            ],
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
        city=city_config.key,
        city_label=city_config.display_name,
        polygon=city_config.polygon,
        window_start=window_start,
        window_end=window_end,
        items=items,
        field_image_path="app/evidence/fixtures/field_image_flood.jpg",
        evidence_mode=settings.evidence_mode,
    )
    return bundle
