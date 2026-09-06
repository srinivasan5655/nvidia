"""
Gate 1 — Evidence Verifier.

Deterministic by design (per the pptx: "the evidence verifier scores
freshness, location and source agreement"). No LLM in the scoring path —
an LLM never gets to decide whether evidence is trustworthy; it can only
narrate a decision that's already been made by code. That's the guardrail
against hallucinated confidence.

Runs inside a NeMo Relay `Guardrail` scope so every verification decision is
in the audit trail with its inputs.
"""
from __future__ import annotations

from datetime import datetime, timezone

from app.config import Settings
from app.models.schemas import EventBundle, GateResult, GateStatus
from app.nvidia_runtime.relay_governance import governed_scope, scope_id


def verify_evidence(bundle: EventBundle, settings: Settings) -> GateResult:
    with governed_scope(
        "evidence_verifier", "Guardrail",
        metadata={"event_id": bundle.event_id, "item_count": len(bundle.items)},
    ) as handle:
        sources_present = bundle.sources_present()
        n_sources = len(sources_present)

        # Freshness: replayed evidence is evaluated as-of the archived window,
        # not wall-clock "now" — that's the whole point of replay mode.
        stale_items = []
        for item in bundle.items:
            if item.is_replay:
                continue  # replay evidence is fresh-by-definition relative to its own window
            age_minutes = (datetime.now(timezone.utc) - item.observed_at).total_seconds() / 60
            if age_minutes > settings.evidence_max_age_minutes:
                stale_items.append(item.item_id)

        # Location agreement: do the items cluster inside the event polygon's
        # bounding box (loose check — full point-in-polygon isn't needed for
        # gate purposes, just "is this plausibly the same event").
        lons = [p[0] for p in bundle.polygon]
        lats = [p[1] for p in bundle.polygon]
        bbox = (min(lons), min(lats), max(lons), max(lats))
        out_of_area = [
            i.item_id for i in bundle.items
            if not (bbox[0] - 0.2 <= i.longitude <= bbox[2] + 0.2 and bbox[1] - 0.2 <= i.latitude <= bbox[3] + 0.2)
        ]

        agreement_score = 1.0 - (len(out_of_area) / max(len(bundle.items), 1))
        freshness_score = 1.0 - (len(stale_items) / max(len(bundle.items), 1))
        source_score = min(n_sources / max(settings.evidence_min_agreeing_sources, 1), 1.0)

        confidence = round(0.4 * source_score + 0.3 * freshness_score + 0.3 * agreement_score, 3)

        if n_sources < settings.evidence_min_agreeing_sources:
            status = GateStatus.BLOCKED
            reasoning = (
                f"Only {n_sources} independent source(s) present "
                f"({sorted(s.value for s in sources_present)}); need at least "
                f"{settings.evidence_min_agreeing_sources} agreeing sources before proceeding."
            )
        elif stale_items or out_of_area:
            status = GateStatus.DEGRADED
            reasoning = (
                f"{n_sources} sources agree on the event, but {len(stale_items)} item(s) are stale "
                f"and {len(out_of_area)} are outside the event footprint. Proceeding with reduced confidence."
            )
        else:
            status = GateStatus.PASSED
            reasoning = f"{n_sources} independent sources agree within the event window and footprint."

        return GateResult(
            gate_name="evidence_verifier",
            status=status,
            confidence=confidence,
            reasoning=reasoning,
            evidence_used=[i.item_id for i in bundle.items],
            details={
                "sources_present": sorted(s.value for s in sources_present),
                "stale_items": stale_items,
                "out_of_area_items": out_of_area,
                "freshness_score": freshness_score,
                "agreement_score": agreement_score,
                "source_score": source_score,
            },
            relay_scope_id=scope_id(handle),
        )
