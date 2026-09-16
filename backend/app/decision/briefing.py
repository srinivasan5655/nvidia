"""
Decision Output — Executive Briefing.

Composes a completed event's own gates/life-safety/exposure/evacuation
output into a short, decision-oriented summary for a reader who wasn't
watching the pipeline run — a duty officer's supervisor, a portfolio head,
an elected official's staff. Same grounding discipline as every other
narrative in this app (assistant.py, life_safety.py, sms_draft.py): the
model is handed the run's own already-verified fields and told to use
ONLY those, never outside knowledge, and every number in the prompt is
copied verbatim from the pipeline's own deterministic output rather than
recomputed here.

This is intentionally the *last* narrative built on top of the pipeline,
not a new decision: nothing here changes overall_status, approval_status,
or any dollar figure. It reads a finished EventRunResult and writes English
prose about it.
"""
from __future__ import annotations

import logging

from app.config import Settings
from app.models.schemas import BriefingResult, DecisionBrief, EventRunResult, ForwardRiskForecast
from app.nvidia_runtime import nim_client
from app.nvidia_runtime.relay_governance import governed_scope
from app.nvidia_runtime.switchyard_router import resolve_reasoning_chain

logger = logging.getLogger("lifeshield.briefing")

SYSTEM_PROMPT = """You write four-sentence executive briefings for a decision-maker who has NOT been watching \
this system run and has limited time.

Rules:
- Use ONLY the facts given below — never invent a number, a location, or an outcome that isn't already there.
- Exactly four sentences, in this order: (1) what happened and where, (2) who/what is affected and how \
severely, (3) the estimated cost/insured impact if a figure is given, (4) what decision or action is being \
asked of the reader right now.
- If a fact (e.g. insured exposure) is not given, skip that sentence's content rather than guessing — still \
write four sentences total by folding the remaining facts together.
- Plain, direct, briefing tone. No headers, no bullet points, no markdown, no hedging phrases like "it seems" \
or "possibly" beyond what the source confidence already implies."""


def _fallback_briefing(run: EventRunResult) -> str:
    """Deterministic, no-LLM summary — used when the reasoning model is
    unavailable. Every sentence is a direct read of already-computed
    fields, same spirit as sms_draft.py's _fallback_message and
    life_safety.py's evidence-only fallback."""
    parts: list[str] = []
    event = run.event
    parts.append(f"{event.city_label}: {event.label}, status {run.overall_status.replace('_', ' ')}.")

    if run.life_safety:
        parts.append(run.life_safety.headline.replace("[LLM unavailable] ", ""))
    elif run.overall_status == "blocked":
        parts.append("Evidence did not clear the confidence gate, so no life-safety recommendation was issued.")

    if run.insurer_exposure:
        parts.append(
            f"Estimated insured exposure: ${run.insurer_exposure.total_estimated_exposure:,.0f} across "
            f"{run.insurer_exposure.total_policies_in_footprint} polic(ies) in the footprint."
        )

    if run.overall_status == "awaiting_approval":
        parts.append("Awaiting your approval before this warning is shared.")
    elif run.overall_status in ("approved", "rejected"):
        parts.append(f"This warning was already {run.overall_status} by a duty officer.")
    elif run.overall_status == "blocked":
        parts.append("No action is available until better-agreeing evidence arrives.")

    return " ".join(parts)


async def generate_executive_briefing(run: EventRunResult, settings: Settings) -> BriefingResult:
    facts: list[str] = [
        f"City: {run.event.city_label}",
        f"Event label: {run.event.label}",
        f"Overall status: {run.overall_status}",
    ]
    for gate in run.gates:
        facts.append(f"Gate '{gate.gate_name}': {gate.status.value} (confidence {gate.confidence:.2f})")
    if run.life_safety:
        facts.append(f"Life-safety headline: {run.life_safety.headline}")
        facts.append(f"Guidance points: {run.life_safety.guidance_points}")
    if run.insurer_exposure:
        facts.append(
            f"Insurer exposure: {run.insurer_exposure.total_policies_in_footprint} polic(ies), "
            f"total insured value ${run.insurer_exposure.total_tiv_in_footprint:,.0f}, "
            f"estimated exposure ${run.insurer_exposure.total_estimated_exposure:,.0f}"
        )
    if run.evacuation_plan and run.evacuation_plan.routes:
        nearest = run.evacuation_plan.routes[0]
        facts.append(
            f"Nearest evacuation shelter: {nearest.shelter_name}, {nearest.distance_km} km, "
            f"{nearest.duration_min} min drive"
        )
    facts.append(f"Approval status: {run.approval_status.value}")

    chain = resolve_reasoning_chain(settings, effort="low")
    target = chain[0]
    with governed_scope(
        "executive_briefing", "Llm", metadata={"event_id": run.event.event_id, "model": target.model}
    ) as handle:
        try:
            raw = await nim_client.chat_completion(
                chain,
                system=SYSTEM_PROMPT,
                user="Facts:\n" + "\n".join(facts),
                max_tokens=350,
                disable_thinking=True,
                relay_handle=handle,
            )
            briefing = raw.strip()
            if not briefing:
                raise ValueError("empty briefing returned")
            return BriefingResult(event_id=run.event.event_id, briefing=briefing, model_used=target.model)
        except Exception as exc:  # noqa: BLE001 - NIM unreachable/unconfigured -> honest deterministic fallback
            logger.warning("Executive briefing generation failed (%s); using deterministic fallback.", exc)
            return BriefingResult(
                event_id=run.event.event_id, briefing=_fallback_briefing(run), model_used="none"
            )


DECISION_BRIEF_SYSTEM_PROMPT = """You write a 2-3 sentence brief for the duty officer who is about to click \
Approve or Reject on one flood warning, right now. They already watched the pipeline run — don't re-explain what \
a gate is. Answer only: what does the forward trend suggest, and does anything here argue for acting faster or \
slower than usual. Use ONLY the facts given — never invent a number or outcome. If no forecast is given, say \
plainly that no forward trend data was available for this event rather than guessing. Plain, direct tone, no \
markdown, no headers."""


def _fallback_decision_brief(run: EventRunResult, forecast: ForwardRiskForecast | None) -> str:
    if forecast and forecast.horizons:
        six_hour = next((h.narrative for h in forecast.horizons if h.label == "+6h"), None)
        if six_hour:
            return f"Forward trend (+6h): {six_hour}"
    return "No forward trend data was available for this event — decide on the evidence already shown above."


async def generate_decision_brief(
    run: EventRunResult, forecast: ForwardRiskForecast | None, settings: Settings
) -> DecisionBrief:
    """Distinct from generate_executive_briefing() above: that one is for a
    reader who wasn't watching the run; this one is for the person about to
    make the actual approve/reject click, and specifically surfaces the
    forward risk trend (decision/forecast.py) at the moment that trend is
    most decision-relevant — added directly in response to a jury critique
    that the highest-leverage missing AI feature was decision support AT
    the moment of the click, not just before or after it."""
    facts: list[str] = [f"Overall status: {run.overall_status}"]
    if run.life_safety:
        facts.append(f"Current headline: {run.life_safety.headline}")
        facts.append(f"Guidance confidence: {run.life_safety.confidence:.2f}")
    if forecast:
        facts.append(f"Gauge trend: {forecast.trend_basis}")
        facts.append(f"Forecast horizons: {[(h.label, h.narrative) for h in forecast.horizons]}")
    else:
        facts.append("No forward risk forecast was available for this event (no usable gauge trend data).")

    chain = resolve_reasoning_chain(settings, effort="low")
    target = chain[0]
    with governed_scope(
        "decision_brief", "Llm", metadata={"event_id": run.event.event_id, "model": target.model}
    ) as handle:
        try:
            raw = await nim_client.chat_completion(
                chain,
                system=DECISION_BRIEF_SYSTEM_PROMPT,
                user="Facts:\n" + "\n".join(facts),
                max_tokens=250,
                disable_thinking=True,
                relay_handle=handle,
            )
            summary = raw.strip()
            if not summary:
                raise ValueError("empty decision brief returned")
            return DecisionBrief(event_id=run.event.event_id, summary=summary, model_used=target.model)
        except Exception as exc:  # noqa: BLE001 - NIM unreachable/unconfigured -> honest deterministic fallback
            logger.warning("Decision brief generation failed (%s); using deterministic fallback.", exc)
            return DecisionBrief(
                event_id=run.event.event_id, summary=_fallback_decision_brief(run, forecast), model_used="none"
            )
