"""
Decision Output — Forward Risk Forecast.

Added in response to a jury critique this session took seriously: every
other AI call in this app reasons about the CURRENT instant (what the
evidence says right now) — nothing projects forward. For a disaster tool,
"where is this going in the next 6/12/24 hours" is often the more valuable
question than "where is this now," and it was structurally absent.

Same two-tier discipline as insurer_exposure.py and evacuation.py: the
model never invents a rate of rise, a threshold crossing, or a number of
any kind. `compute_gauge_trend()` below is 100% deterministic arithmetic
over EvidenceItem.raw — the same USGS WaterML-JSON payloads
evidence/usgs.py already fetches and stores (see that module; it normalizes
each site down to a single latest reading, but the FULL time series survives
untouched in `raw`, unused until now). The model's only job is to narrate
what that already-computed trend implies at three fixed horizons.
"""
from __future__ import annotations

import json
import logging

from app.config import Settings
from app.models.schemas import (
    EventBundle,
    EvidenceSource,
    ForecastHorizon,
    ForwardRiskForecast,
    LifeSafetyGuidance,
)
from app.nvidia_runtime import nim_client
from app.nvidia_runtime.relay_governance import governed_scope
from app.nvidia_runtime.switchyard_router import resolve_reasoning_chain

logger = logging.getLogger("lifeshield.forecast")

SYSTEM_PROMPT = """You are a flood-risk forecasting assistant for emergency managers. You are given the ALREADY \
COMPUTED rate of change for one or more gauges (never re-derive or adjust these numbers) and the current \
life-safety headline for one event. For each of three time horizons (+6h, +12h, +24h), write ONE short sentence \
projecting how the situation plausibly develops if the observed trend continues — qualitative language only \
("continues to rise", "likely crests", "may recede") — never invent a new gauge height, discharge figure, or \
population count that isn't already given. If a horizon is too uncertain to say anything specific, say that \
plainly rather than guessing. Return compact JSON: {"horizons": {"+6h": str, "+12h": str, "+24h": str}}."""


def compute_gauge_trend(bundle: EventBundle) -> list[str]:
    """Deterministic rate-of-change per USGS gauge, from the full time
    series already sitting untouched in each EvidenceItem.raw (see this
    module's docstring). Returns human-readable facts like
    "Brays Bayou at Houston, TX: gage height rising 3.40 ft/hr (38.2 -> 41.6
    ft over 1.0h)" — never a bare number the model could mistake for
    something to interpret rather than a fact to narrate."""
    facts: list[str] = []
    for item in bundle.items:
        if item.source != EvidenceSource.USGS:
            continue
        try:
            site_name = item.raw["sourceInfo"]["siteName"]
            var_name = item.raw["variable"]["variableName"]
            unit = item.raw["variable"]["unit"]["unitCode"]
            readings = item.raw["values"][0]["value"]
        except (KeyError, IndexError, TypeError):
            continue
        if len(readings) < 2:
            continue
        try:
            first, last = readings[0], readings[-1]
            first_val, last_val = float(first["value"]), float(last["value"])
        except (KeyError, ValueError):
            continue

        from datetime import datetime

        def _parse(v: str) -> datetime:
            v = v.replace("Z", "+00:00")
            return datetime.fromisoformat(v)

        try:
            hours = max((_parse(last["dateTime"]) - _parse(first["dateTime"])).total_seconds() / 3600.0, 1e-6)
        except ValueError:
            continue
        rate = (last_val - first_val) / hours
        direction = "rising" if rate > 0.05 else "falling" if rate < -0.05 else "steady"
        facts.append(
            f"{site_name}: {var_name} {direction} {abs(rate):.2f} {unit}/hr "
            f"({first_val:g} -> {last_val:g} {unit} over {hours:.1f}h)"
        )
    return facts


async def generate_forward_risk_forecast(
    bundle: EventBundle,
    life_safety: LifeSafetyGuidance | None,
    settings: Settings,
) -> ForwardRiskForecast | None:
    """Returns None when there's no trend data to project from (no USGS
    items with >=2 readings) — an honest "nothing to forecast" rather than
    a model guessing at horizons with zero grounding, same discipline as
    every other narrative in this app."""
    trend = compute_gauge_trend(bundle)
    if not trend:
        return None

    chain = resolve_reasoning_chain(settings, effort="low")
    target = chain[0]
    user_prompt = json.dumps(
        {
            "gauge_trend": trend,
            "current_headline": life_safety.headline if life_safety else None,
            "current_confidence": life_safety.confidence if life_safety else None,
        }
    )
    with governed_scope(
        "forward_risk_forecast", "Llm", metadata={"event_id": bundle.event_id, "model": target.model}
    ) as handle:
        try:
            raw = await nim_client.chat_completion(
                chain,
                system=SYSTEM_PROMPT,
                user=user_prompt,
                max_tokens=400,
                disable_thinking=True,
                relay_handle=handle,
            )
            horizons_map = _parse(raw)
            return ForwardRiskForecast(
                trend_basis=trend,
                horizons=[
                    ForecastHorizon(label=label, narrative=horizons_map.get(label, "Insufficient trend data."))
                    for label in ("+6h", "+12h", "+24h")
                ],
                model_used=target.model,
            )
        except Exception as exc:  # noqa: BLE001 - NIM unreachable/unconfigured -> degrade to the deterministic trend alone
            logger.warning("Forward risk forecast narrative failed (%s); returning trend facts with no projection.", exc)
            return ForwardRiskForecast(
                trend_basis=trend,
                horizons=[
                    ForecastHorizon(label=label, narrative="[AI projection unavailable] See trend_basis above.")
                    for label in ("+6h", "+12h", "+24h")
                ],
                model_used="none",
            )


def _parse(raw: str) -> dict[str, str]:
    import re

    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not match:
        raise ValueError(f"No JSON object found in model output: {raw[:200]}")
    data = json.loads(match.group(0))
    return data.get("horizons", {})
