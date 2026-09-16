"""
After-Action Report — the post-incident compliance document FEMA/NDMA-style
agencies are typically required to produce after a real event. Built the
same way as every other narrative in this app: composed ONLY from this
run's own already-computed fields (gates, life-safety, exposure,
evacuation, counterfactual, and the actual human approval decision/note) —
never outside knowledge, and it never re-derives a number.
"""
from __future__ import annotations

import logging

from app.config import Settings
from app.models.schemas import AfterActionReportResult, EventRunResult
from app.nvidia_runtime import nim_client
from app.nvidia_runtime.relay_governance import governed_scope
from app.nvidia_runtime.switchyard_router import resolve_reasoning_chain

logger = logging.getLogger("lifeshield.after_action_report")

SYSTEM_PROMPT = """You write After-Action Reports for emergency management agencies, in exactly this structure, \
with these exact capitalized headers, one short paragraph each: "INCIDENT SUMMARY", "EVIDENCE & DECISION \
TIMELINE", "ACTIONS TAKEN", "OUTCOME", "LESSONS LEARNED / RECOMMENDATIONS". Use ONLY the facts given — never \
invent a casualty count, a dollar figure, or an outcome not already stated. Plain, formal, after-action tone. \
No markdown formatting beyond the headers exactly as given, in capital letters, on their own line."""


def _fallback_report(run: EventRunResult) -> str:
    """Deterministic, no-LLM fallback — same discipline as briefing.py's."""
    lines = [
        "INCIDENT SUMMARY",
        f"{run.event.city_label}: {run.event.label}. Overall status: {run.overall_status}.",
        "",
        "EVIDENCE & DECISION TIMELINE",
        "; ".join(f"{g.gate_name}: {g.status.value}" for g in run.gates) or "No gates recorded.",
        "",
        "ACTIONS TAKEN",
        (
            "Approved and shared with the public."
            if run.overall_status == "approved"
            else "Rejected — not shared."
            if run.overall_status == "rejected"
            else "No action was available; the pipeline blocked before a recommendation was produced."
        ),
        "",
        "OUTCOME",
        run.life_safety.headline if run.life_safety else "No life-safety narrative was produced for this event.",
        "",
        "LESSONS LEARNED / RECOMMENDATIONS",
        run.counterfactual.narrative if run.counterfactual else "Not available for this run.",
    ]
    return "\n".join(lines)


async def generate_after_action_report(run: EventRunResult, settings: Settings) -> AfterActionReportResult:
    facts: list[str] = [
        f"City: {run.event.city_label}",
        f"Label: {run.event.label}",
        f"Overall status: {run.overall_status}",
        f"Approval status: {run.approval_status.value}",
        f"Approval note: {run.approval_note or '(none)'}",
    ]
    for g in run.gates:
        facts.append(f"Gate '{g.gate_name}': {g.status.value} (confidence {g.confidence:.2f}) — {g.reasoning}")
    if run.life_safety:
        facts.append(f"Life-safety headline: {run.life_safety.headline}")
        facts.append(f"Guidance points: {run.life_safety.guidance_points}")
    if run.insurer_exposure:
        facts.append(
            f"Estimated exposure: ${run.insurer_exposure.total_estimated_exposure:,.0f} across "
            f"{run.insurer_exposure.total_policies_in_footprint} polic(ies)"
        )
    if run.evacuation_plan and run.evacuation_plan.routes:
        facts.append(f"Evacuation routes computed: {len(run.evacuation_plan.routes)}")
    if run.counterfactual:
        facts.append(f"Counterfactual (what if this warning had never been issued): {run.counterfactual.narrative}")

    chain = resolve_reasoning_chain(settings, effort="low")
    target = chain[0]
    with governed_scope(
        "after_action_report", "Llm", metadata={"event_id": run.event.event_id, "model": target.model}
    ) as handle:
        try:
            raw = await nim_client.chat_completion(
                chain,
                system=SYSTEM_PROMPT,
                user="Facts:\n" + "\n".join(facts),
                max_tokens=650,
                disable_thinking=True,
                relay_handle=handle,
            )
            text = raw.strip()
            if not text:
                raise ValueError("empty after-action report returned")
            return AfterActionReportResult(event_id=run.event.event_id, report_text=text, model_used=target.model)
        except Exception as exc:  # noqa: BLE001 - NIM unreachable/unconfigured -> honest deterministic fallback
            logger.warning("After-action report generation failed (%s); using deterministic fallback.", exc)
            return AfterActionReportResult(
                event_id=run.event.event_id, report_text=_fallback_report(run), model_used="none"
            )
