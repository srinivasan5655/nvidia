"""
CAP (Common Alerting Protocol 1.2, OASIS) export — the standard format US
IPAWS/Wireless Emergency Alerts and most national EM systems require before
a warning can trigger a real public broadcast. Turns an APPROVED run's
already-existing life-safety guidance into a CAP-compliant XML package —
never generates new content, only reformats fields this pipeline already
produced and a human already approved.

Deliberately refuses to export for any run that isn't overall_status ==
"approved" — a CAP alert represents a real public alert; exporting one for
an unapproved or rejected run would defeat the entire human-approval gate
this app is built around.
"""
from __future__ import annotations

from xml.sax.saxutils import escape

from app.decision.alert_tiers import compute_alert_tier, nws_cap_fields
from app.models.schemas import EventRunResult, new_id, now_utc

_SEVERITY_MAP = {"emergency": "Extreme", "warning": "Severe", "watch": "Moderate"}
_URGENCY_MAP = {"emergency": "Immediate", "warning": "Expected", "watch": "Future"}
_CERTAINTY_MAP = {"emergency": "Observed", "warning": "Likely", "watch": "Possible"}


class CapExportError(ValueError):
    """Raised when a caller asks for a CAP package on a run that isn't
    approved yet — see this module's docstring for why that's refused
    outright rather than degraded."""


def generate_cap_alert(run: EventRunResult) -> tuple[str, str]:
    """Returns (cap_xml, alert_tier). Reuses nws_cap_fields() only to decide
    the tier via alert_tiers.compute_alert_tier — the CAP <severity>/
    <urgency>/<certainty> elements are set from that SAME tier, not
    re-derived, so the XML can never disagree with the tier this app shows
    on screen for the same run."""
    if run.overall_status != "approved":
        raise CapExportError(
            f"Refusing to generate a CAP public-alert package for a run that is '{run.overall_status}', not "
            "'approved' — a CAP alert represents a real public alert and must follow this app's human-approval gate."
        )
    tier = compute_alert_tier(run.event, run.overall_status)
    headline = (run.life_safety.headline if run.life_safety else run.event.label).replace("[LLM unavailable] ", "")
    description = run.life_safety.hazard_narrative if run.life_safety else "See guidance points for this event."
    instructions = (
        " ".join(run.life_safety.guidance_points)
        if run.life_safety and run.life_safety.guidance_points
        else "Follow local emergency management guidance."
    )

    # CAP polygon = "lat,lon lat,lon ..." (note: lat first, opposite of this
    # app's own [lon, lat] convention) — a closed ring, first point repeated last.
    ring = list(run.event.polygon)
    if ring and ring[0] != ring[-1]:
        ring = ring + [ring[0]]
    polygon_pairs = " ".join(f"{lat:.4f},{lon:.4f}" for lon, lat in ring)

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">\n'
        f"  <identifier>{escape(new_id('lifeshield-cap'))}</identifier>\n"
        "  <sender>lifeshield-ai@demo.local</sender>\n"
        f"  <sent>{now_utc().isoformat()}</sent>\n"
        "  <status>Actual</status>\n"
        "  <msgType>Alert</msgType>\n"
        "  <scope>Public</scope>\n"
        f"  <source>LifeShield AI — {escape(run.event.city_label)}</source>\n"
        "  <info>\n"
        "    <language>en-US</language>\n"
        "    <category>Met</category>\n"
        "    <event>Flood Warning</event>\n"
        f"    <urgency>{_URGENCY_MAP[tier]}</urgency>\n"
        f"    <severity>{_SEVERITY_MAP[tier]}</severity>\n"
        f"    <certainty>{_CERTAINTY_MAP[tier]}</certainty>\n"
        f"    <headline>{escape(headline)}</headline>\n"
        f"    <description>{escape(description)}</description>\n"
        f"    <instruction>{escape(instructions)}</instruction>\n"
        "    <area>\n"
        f"      <areaDesc>{escape(run.event.city_label)}</areaDesc>\n"
        f"      <polygon>{polygon_pairs}</polygon>\n"
        "    </area>\n"
        "  </info>\n"
        "</alert>\n"
    )
    return xml, tier
