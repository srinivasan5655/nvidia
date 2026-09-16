"""
Parametric Trigger Evaluation — a deterministic answer to "would this event
cross an index-insurance payout threshold," using the same real USGS gauge
rate-of-rise data the Forward Risk Forecast already computes. This is the
one piece of infrastructure a parametric (index-based) flood policy needs
most: an objective, auditable trigger — not a claims adjuster's opinion.

Deliberately a SEPARATE, small parsing pass over the same raw evidence
forecast.py reads, rather than importing/refactoring forecast.py's
internals — so this addition cannot change forecast.py's existing,
already-verified output in any way.

Thresholds and payout percentages below are ILLUSTRATIVE — no real
parametric contract exists yet; they demonstrate the mechanism, not a
priced product.
"""
from __future__ import annotations

from datetime import datetime

from app.models.schemas import EventBundle, EvidenceSource, ParametricTriggerResult

# Illustrative tiers only — see module docstring. Ordered high to low.
_TIERS = [
    (3.0, "Tier 3 — Severe", 100.0),
    (1.5, "Tier 2 — Moderate", 50.0),
    (0.5, "Tier 1 — Minor", 20.0),
]


def _parse_dt(v: str) -> datetime:
    return datetime.fromisoformat(v.replace("Z", "+00:00"))


def _peak_rise_rate(bundle: EventBundle) -> tuple[float, list[str]]:
    peak = 0.0
    basis: list[str] = []
    for item in bundle.items:
        if item.source != EvidenceSource.USGS:
            continue
        try:
            site_name = item.raw["sourceInfo"]["siteName"]
            unit = item.raw["variable"]["unit"]["unitCode"]
            readings = item.raw["values"][0]["value"]
            if len(readings) < 2:
                continue
            first, last = readings[0], readings[-1]
            first_val, last_val = float(first["value"]), float(last["value"])
            hours = max((_parse_dt(last["dateTime"]) - _parse_dt(first["dateTime"])).total_seconds() / 3600.0, 1e-6)
            rate = (last_val - first_val) / hours
            if rate > peak:
                peak = rate
            basis.append(f"{site_name}: {rate:.2f} {unit}/hr")
        except (KeyError, ValueError, IndexError, TypeError):
            continue
    return peak, basis


def evaluate_parametric_trigger(bundle: EventBundle) -> ParametricTriggerResult:
    peak_rate, basis = _peak_rise_rate(bundle)
    for threshold, tier, payout in _TIERS:
        if peak_rate >= threshold:
            return ParametricTriggerResult(
                event_id=bundle.event_id,
                triggered=True,
                tier=tier,
                peak_rate=round(peak_rate, 2),
                basis=basis,
                payout_pct_illustrative=payout,
            )
    return ParametricTriggerResult(
        event_id=bundle.event_id,
        triggered=False,
        tier=None,
        peak_rate=round(peak_rate, 2),
        basis=basis or ["No USGS gauge trend data was available for this event."],
        payout_pct_illustrative=None,
    )
