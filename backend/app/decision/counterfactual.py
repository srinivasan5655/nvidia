"""
Decision Output — Counterfactual ("What If") Analysis.

Runs once, after a run completes with an actual life-safety recommendation
(never on a blocked run — there's nothing to counterfactually compare
against if the pipeline never got far enough to recommend anything). Always
the low-effort model tier: this is a single templated narrative task over
evidence that has already been verified and summarized by every gate ahead
of it, not a fresh reasoning problem.

Guardrail, same family as life_safety.py's: the model narrates, it never
invents a number. The prompt explicitly asks for qualitative reasoning
("more households", "longer exposure", "higher risk to X") and forbids
new dollar figures or casualty counts — the insurer_exposure output already
owns the one number-producing path in this app, and duplicating it here
with an LLM would contradict that guardrail.
"""
from __future__ import annotations

import logging

from app.config import Settings
from app.models.schemas import (
    CounterfactualAnalysis,
    EvacuationPlan,
    EventBundle,
    GateResult,
    InsurerExposureOutput,
    LifeSafetyGuidance,
)
from app.nvidia_runtime import nim_client
from app.nvidia_runtime.relay_governance import governed_scope
from app.nvidia_runtime.switchyard_router import resolve_reasoning_chain

logger = logging.getLogger("lifeshield.counterfactual")

SYSTEM_PROMPT = """You are a disaster-response after-action analyst. You are \
given one flood event's verified evidence, the life-safety guidance that was \
issued, and (if available) the evacuation plan and estimated insurer \
exposure. Write a short "what if this warning had never been issued" \
counterfactual: 2-4 sentences, plain language, grounded ONLY in the evidence \
given. Reason qualitatively about additional risk to life and additional \
delay/confusion for residents. Do NOT invent a new dollar figure, casualty \
count, or statistic that is not already in the input — describe risk in \
relative terms (e.g. "significantly more households", "far less warning \
time") instead. Return plain text, no JSON, no markdown headers."""


async def generate_counterfactual(
    bundle: EventBundle,
    gates: list[GateResult],
    life_safety: LifeSafetyGuidance,
    insurer_exposure: InsurerExposureOutput | None,
    evacuation_plan: EvacuationPlan | None,
    settings: Settings,
) -> CounterfactualAnalysis:
    evidence_summary = [{"source": i.source.value, "summary": i.summary} for i in bundle.items]
    user_prompt = (
        f"Event: {bundle.label} ({bundle.city_label})\n"
        f"Evidence: {evidence_summary}\n"
        f"Life-safety headline: {life_safety.headline}\n"
        f"Life-safety guidance: {life_safety.guidance_points}\n"
        + (f"Evacuation: {evacuation_plan.narrative or evacuation_plan.methodology}\n" if evacuation_plan else "")
        + (
            f"Estimated insurer exposure: {insurer_exposure.total_estimated_exposure:.0f} "
            f"across {insurer_exposure.total_policies_in_footprint} policies\n"
            if insurer_exposure
            else ""
        )
    )

    chain = resolve_reasoning_chain(settings, effort="low")
    target = chain[0]
    with governed_scope(
        "counterfactual_narrative", "Llm", metadata={"event_id": bundle.event_id, "model": target.model}
    ) as handle:
        try:
            narrative = await nim_client.chat_completion(
                chain, system=SYSTEM_PROMPT, user=user_prompt, max_tokens=400, disable_thinking=True, relay_handle=handle
            )
            return CounterfactualAnalysis(narrative=narrative.strip(), model_used=target.model)
        except Exception as exc:  # noqa: BLE001 - NIM unreachable/unconfigured -> degrade, don't crash the run
            logger.warning("Counterfactual narrative failed (%s); returning evidence-only fallback.", exc)
            return CounterfactualAnalysis(
                narrative=(
                    "[AI analysis unavailable] Without this warning, residents in the affected area would have had "
                    "no advance notice of the flooding described in the evidence above, and the emergency response "
                    "described in the guidance would not have started when it did."
                ),
                model_used="none",
            )
