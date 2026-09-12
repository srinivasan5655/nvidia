"""
Decision Output A — Life-Safety Guidance.

Unlike insurer exposure, this output legitimately needs an LLM: turning
structured evidence + gate results into clear, actionable guidance text is a
narrative task. The guardrail here is different from insurer_exposure.py's
"no LLM touches a number" — it's "the LLM only sees the already-verified
evidence bundle and gate outputs, never raw source feeds, and every guidance
point must cite an evidence item id."
"""
from __future__ import annotations

import json
import logging

from app.agents.hazard_agent import run_hazard_agent
from app.agents.vision_specialist import DamageEvidence
from app.config import Settings
from app.models.schemas import EventBundle, GateResult, GateStatus, LifeSafetyGuidance
from app.nvidia_runtime import nim_client
from app.nvidia_runtime.relay_governance import governed_scope
from app.nvidia_runtime.switchyard_router import ReasoningEffort, resolve_reasoning_target

logger = logging.getLogger("lifeshield.life_safety")

# Below this, the evidence itself is ambiguous/degraded enough that
# synthesizing guidance is a genuine reasoning task — route to the
# high-effort model. At or above it, sources already agree unambiguously and
# the task is close to templating a narrative from evidence that's already
# clear, so the low-effort tier suffices.
LOW_EFFORT_CONFIDENCE_FLOOR = 0.8


def _reasoning_effort_for(gates: list[GateResult]) -> ReasoningEffort:
    """Deliberately keyed on evidence_verifier alone, not min(all gate
    confidences): openshell_supervisor is DEGRADED by design whenever no
    OpenShell cluster is configured (a specialist-trust/infra fact, not an
    evidence-ambiguity one), and would otherwise force every run to "high"
    regardless of how clean the underlying evidence actually is."""
    evidence_gate = next((g for g in gates if g.gate_name == "evidence_verifier"), None)
    if evidence_gate and evidence_gate.status == GateStatus.PASSED and evidence_gate.confidence >= LOW_EFFORT_CONFIDENCE_FLOOR:
        return "low"
    return "high"

SYSTEM_PROMPT = """You are a life-safety guidance writer for emergency \
managers, not the public. You are given a verified evidence summary and \
gate results for one flood event. Write guidance ONLY from what's in the \
evidence — never invent locations, numbers, or hazards not present in the \
input. Return compact JSON: {"headline": str, "guidance_points": [str, ...], \
"hazard_narrative": str}. Each guidance_point must be actionable and specific \
to a location or hazard mentioned in the evidence."""


async def synthesize_life_safety_guidance(
    bundle: EventBundle,
    gates: list[GateResult],
    vision: DamageEvidence | None,
    settings: Settings,
) -> LifeSafetyGuidance:
    evidence_summary = [
        {"source": i.source.value, "summary": i.summary, "item_id": i.item_id}
        for i in bundle.items
    ]
    gate_summary = [{"gate": g.gate_name, "status": g.status.value, "reasoning": g.reasoning} for g in gates]
    overall_confidence = min([g.confidence for g in gates], default=0.0)

    user_prompt = json.dumps(
        {
            "event_label": bundle.label,
            "window": {"start": bundle.window_start.isoformat(), "end": bundle.window_end.isoformat()},
            "evidence": evidence_summary,
            "gates": gate_summary,
            "vision_specialist": vision.model_dump() if vision else None,
        },
        default=str,
    )

    effort = _reasoning_effort_for(gates)
    target = resolve_reasoning_target(settings, effort=effort)
    agent_harness = "direct"
    with governed_scope(
        "life_safety_narrative",
        "Llm",
        metadata={"event_id": bundle.event_id, "model": target.model, "reasoning_effort": effort},
    ):
        try:
            # Hazard Overlay Agent (DeepAgents) attempted first — matches the
            # architecture diagram's "02 Geospatial / Hazard Overlay Agent".
            # Falls back to a direct NIM call on any failure; see
            # vision_specialist.py's module docstring for the verified,
            # repeatable multi-tool-binding failure mode on this NIM account
            # that this fallback exists for.
            structured = await run_hazard_agent(SYSTEM_PROMPT, user_prompt, settings, effort)
            parsed = {
                "headline": structured.headline,
                "guidance_points": structured.guidance_points,
                "hazard_narrative": structured.hazard_narrative,
            }
            agent_harness = "deepagents"
        except Exception as exc:  # noqa: BLE001 - DeepAgents harness failure -> fall back to the proven direct call
            logger.warning("Hazard Overlay Agent failed (%s); falling back to direct NIM call.", exc)
            try:
                # disable_thinking on the low-effort tier: nemotron-3.5-lightning
                # is a reasoning model whose chain-of-thought length is
                # non-deterministic — verified it sometimes answers directly and
                # sometimes spends 2000-5000+ tokens "thinking" first, hitting
                # finish_reason="length" mid-thought and silently degrading to
                # the fallback below despite the API call succeeding. The low
                # tier exists to be fast and cheap on already-clear evidence;
                # thinking mode fights that purpose as well as reliability, so
                # it's turned off outright rather than just widened token
                # budgets (which reduce but don't eliminate the failure mode).
                raw = await nim_client.chat_completion(
                    target, system=SYSTEM_PROMPT, user=user_prompt, max_tokens=2000, disable_thinking=(effort == "low")
                )
                parsed = _parse(raw)
            except Exception as exc2:  # noqa: BLE001 - NIM unreachable in this sandbox / no key configured -> degrade, don't crash
                parsed = {
                    "headline": "[LLM unavailable] Evidence-only summary",
                    "guidance_points": [i["summary"] for i in evidence_summary[:5]],
                    "hazard_narrative": f"[LLM unavailable: {exc2}] Falling back to raw evidence summaries.",
                }
                overall_confidence = min(overall_confidence, 0.3)

    return LifeSafetyGuidance(
        headline=parsed["headline"],
        guidance_points=parsed["guidance_points"],
        hazard_narrative=parsed["hazard_narrative"],
        confidence=round(overall_confidence, 3),
        citing_evidence=[i["item_id"] for i in evidence_summary],
        reasoning_effort=effort,
        model_used=target.model,
        agent_harness=agent_harness,
    )


def _parse(raw: str) -> dict:
    import re

    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not match:
        raise ValueError(f"No JSON object found in model output: {raw[:200]}")
    data = json.loads(match.group(0))
    return {
        "headline": data.get("headline", "Life-safety guidance"),
        "guidance_points": data.get("guidance_points", []),
        "hazard_narrative": data.get("hazard_narrative", ""),
    }
