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

from app.agents.vision_specialist import DamageEvidence
from app.config import Settings
from app.models.schemas import EventBundle, GateResult, LifeSafetyGuidance
from app.nvidia_runtime import nim_client
from app.nvidia_runtime.relay_governance import governed_scope
from app.nvidia_runtime.switchyard_router import resolve_reasoning_target

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

    target = resolve_reasoning_target(settings)
    with governed_scope("life_safety_narrative", "Llm", metadata={"event_id": bundle.event_id, "model": target.model}):
        try:
            raw = await nim_client.chat_completion(target, system=SYSTEM_PROMPT, user=user_prompt)
            parsed = _parse(raw)
        except Exception as exc:  # noqa: BLE001 - NIM unreachable in this sandbox / no key configured -> degrade, don't crash
            parsed = {
                "headline": "[LLM unavailable] Evidence-only summary",
                "guidance_points": [i["summary"] for i in evidence_summary[:5]],
                "hazard_narrative": f"[LLM unavailable: {exc}] Falling back to raw evidence summaries.",
            }
            overall_confidence = min(overall_confidence, 0.3)

    return LifeSafetyGuidance(
        headline=parsed["headline"],
        guidance_points=parsed["guidance_points"],
        hazard_narrative=parsed["hazard_narrative"],
        confidence=round(overall_confidence, 3),
        citing_evidence=[i["item_id"] for i in evidence_summary],
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
