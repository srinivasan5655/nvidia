"""
Decision Output B — Insurer Exposure.

Deterministic math only, per the pptx: "insurer exposure from deterministic
TIV, limit and deductible math." No LLM touches a dollar figure anywhere in
this module — an LLM is only ever used afterward, in `life_safety.py` and the
orchestrator's summary step, to narrate numbers that are already final.

Damage ratio model (transparent, not a black box): a simple bounded function
of (a) the vision specialist's estimated water depth for the point closest to
each policy, falling back to (b) the worst nearby USGS/HCFCD gauge reading
converted to a rough depth-above-flood-stage proxy when no vision estimate is
available. This is intentionally simple for a hackathon demo — the
`methodology` string on the output says exactly what was used, so a judge (or
an actual underwriter) can see the assumption immediately rather than trust a
hidden model.
"""
from __future__ import annotations

import json
import math

from app.agents.vision_specialist import DamageEvidence
from app.config import FIXTURES_DIR
from app.models.schemas import (
    EventBundle,
    InsurerExposureLine,
    InsurerExposureOutput,
    InsurerPolicy,
)


def load_synthetic_portfolio() -> list[InsurerPolicy]:
    path = FIXTURES_DIR / "synthetic_insurer_portfolio.json"
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return [InsurerPolicy(**p) for p in data["policies"]]


def _point_in_bbox(lat: float, lon: float, polygon: list[list[float]]) -> bool:
    lons = [p[0] for p in polygon]
    lats = [p[1] for p in polygon]
    return min(lons) <= lon <= max(lons) and min(lats) <= lat <= max(lats)


def _damage_ratio(policy: InsurerPolicy, bundle: EventBundle, vision: DamageEvidence | None) -> float:
    """Bounded [0, 0.6] ratio of TIV assumed damaged. Capped well below 1.0
    because this is a rapid triage estimate, not a claims adjustment."""
    if vision and vision.flooding_observed and vision.estimated_water_depth_ft:
        depth = vision.estimated_water_depth_ft
        ratio = min(0.6, 0.05 + depth * 0.08)
        return round(ratio, 3)

    # Fallback: use the nearest gauge-height evidence as a coarse proxy.
    nearest_gauge_value = None
    best_dist = math.inf
    for item in bundle.items:
        if item.source.value not in ("usgs", "hcfcd"):
            continue
        dist = math.hypot(item.latitude - policy.latitude, item.longitude - policy.longitude)
        if dist < best_dist:
            best_dist = dist
            # crude numeric extraction from the summary string's trailing number
            digits = "".join(c for c in item.summary.split("=")[-1] if c.isdigit() or c == ".")
            try:
                nearest_gauge_value = float(digits) if digits else None
            except ValueError:
                nearest_gauge_value = None

    if nearest_gauge_value is None:
        return 0.05  # some ambient risk even absent a direct reading, never zero once inside the footprint

    # Normalize against an illustrative "flood stage" of 35 ft used by the demo fixtures.
    excess = max(0.0, nearest_gauge_value - 35.0)
    ratio = min(0.6, 0.05 + excess * 0.02)
    return round(ratio, 3)


def compute_insurer_exposure(
    bundle: EventBundle,
    vision: DamageEvidence | None,
    confidence: float,
) -> InsurerExposureOutput:
    portfolio = load_synthetic_portfolio()
    in_footprint = [p for p in portfolio if _point_in_bbox(p.latitude, p.longitude, bundle.polygon)]

    lines: list[InsurerExposureLine] = []
    for policy in in_footprint:
        ratio = _damage_ratio(policy, bundle, vision)
        gross = round(policy.total_insured_value * ratio, 2)
        net_of_deductible = max(0.0, gross - policy.deductible)
        capped = min(net_of_deductible, policy.coverage_limit)
        lines.append(
            InsurerExposureLine(
                policy_id=policy.policy_id,
                total_insured_value=policy.total_insured_value,
                coverage_limit=policy.coverage_limit,
                deductible=policy.deductible,
                estimated_damage_ratio=ratio,
                gross_loss_estimate=gross,
                net_of_deductible=round(net_of_deductible, 2),
                capped_at_limit=round(capped, 2),
            )
        )

    total_exposure = round(sum(l.capped_at_limit for l in lines), 2)
    total_tiv = round(sum(l.total_insured_value for l in lines), 2)

    methodology = (
        "damage_ratio = f(vision water-depth estimate) when available, else f(nearest gauge reading vs 35ft "
        "illustrative flood stage); gross_loss = TIV * damage_ratio; net = max(0, gross - deductible); "
        "final = min(net, coverage_limit). All math is deterministic Python — no model output is used as a dollar figure."
    )

    return InsurerExposureOutput(
        total_policies_in_footprint=len(in_footprint),
        total_tiv_in_footprint=total_tiv,
        total_estimated_exposure=total_exposure,
        lines=lines,
        methodology=methodology,
        confidence=confidence,
        citing_evidence=[i.item_id for i in bundle.items],
    )
