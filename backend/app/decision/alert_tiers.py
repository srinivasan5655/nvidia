"""
Alert tiering — maps this event onto the same Watch/Warning/Emergency
vocabulary NWS/IMD-style public alerting already uses, instead of only this
app's internal overall_status values ("blocked"/"awaiting_approval"/...).
Reuses the REAL severity/urgency fields already present in the NWS/IMD
evidence item's raw CAP-derived payload (api.weather.gov's alert schema
carries these verbatim — see evidence/nws.py) — no new signal invented, and
the exact same fields cap_export.py needs to fill its own CAP
<severity>/<urgency>/<certainty> elements, so this module is the one place
both features read from.

Purely additive: never changes overall_status/approval_status, and a caller
that never reads the result sees behavior byte-identical to before this
module existed.
"""
from __future__ import annotations

from typing import Literal

from app.models.schemas import EventBundle, EvidenceSource

AlertTier = Literal["watch", "warning", "emergency"]

_HIGH_SEVERITY = {"extreme", "severe"}
_HIGH_URGENCY = {"immediate", "expected"}


def nws_cap_fields(bundle: EventBundle) -> tuple[str, str, str]:
    """Real (severity, urgency, certainty) off the NWS/IMD evidence item's
    raw payload, lowercased; ('unknown','unknown','unknown') if absent.
    Also used by cap_export.py so both features read the identical source."""
    for item in bundle.items:
        if item.source != EvidenceSource.NWS:
            continue
        props = item.raw.get("properties", {}) if isinstance(item.raw, dict) else {}
        return (
            str(props.get("severity", "unknown")).lower(),
            str(props.get("urgency", "unknown")).lower(),
            str(props.get("certainty", "unknown")).lower(),
        )
    return "unknown", "unknown", "unknown"


def compute_alert_tier(bundle: EventBundle, overall_status: str) -> AlertTier:
    if overall_status == "blocked":
        return "watch"  # insufficient evidence to warrant escalating past the lowest tier
    severity, urgency, _certainty = nws_cap_fields(bundle)
    if severity in _HIGH_SEVERITY and urgency in _HIGH_URGENCY:
        return "emergency"
    if severity in _HIGH_SEVERITY or severity == "moderate":
        return "warning"
    return "watch"
