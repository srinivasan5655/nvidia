"""
Exposure Agent — narrator over the deterministic insurer-exposure
calculation, matching the architecture diagram's "04 Insurance / Exposure
Agent" role.

Guardrail preserved exactly as before: "no model ever produces a dollar
figure." The agent's only input IS compute_insurer_exposure()'s output —
every numeric field in the returned InsurerExposureOutput comes from that
deterministic math, captured directly in our own code, never re-typed or
re-derived by the model. The model's sole contribution is `narrative`, a
short underwriter-facing explanation of numbers it was handed.

Architecture note (changed 2026-09-14, in response to a jury critique this
session took seriously): this used to attempt a DeepAgents multi-tool
agentic loop first and only fall back to a single direct NIM call if that
timed out. Verified live and repeatedly on this account: the DeepAgents
tier reliably timed out here — same failure mode documented in
vision_specialist.py — so in practice this call site was ALWAYS paying for
a ~10s failed attempt before reaching the call that actually produces the
narrative. More fundamentally, "read back five numbers and write two
sentences" is a templating task, not a multi-step tool-use problem — it
never needed an agentic harness at all. The direct call is now the only
tier: same output, no wasted latency, no complexity the task doesn't need.
"""
from __future__ import annotations

import logging

from app.agents.vision_specialist import DamageEvidence
from app.config import Settings
from app.decision.insurer_exposure import compute_insurer_exposure
from app.models.schemas import EventBundle, InsurerExposureOutput
from app.nvidia_runtime import nim_client
from app.nvidia_runtime.relay_governance import governed_scope
from app.nvidia_runtime.switchyard_router import resolve_reasoning_chain

logger = logging.getLogger("lifeshield.exposure_agent")

SYSTEM_PROMPT = """You are an insurance exposure agent. You are given the ALREADY-COMPUTED, deterministic \
exposure figures for one event — never re-derive, round differently, or second-guess these numbers. Write a short \
(2-3 sentence) narrative for an underwriter explaining what they mean in plain language."""


async def _narrative(result: InsurerExposureOutput, settings: Settings) -> str:
    chain = resolve_reasoning_chain(settings, effort="low")
    target = chain[0]
    with governed_scope("exposure_narrative", "Llm", metadata={"model": target.model}) as handle:
        user_prompt = (
            f"Policies in footprint: {result.total_policies_in_footprint}\n"
            f"Total insured value: ${result.total_tiv_in_footprint:,.0f}\n"
            f"Estimated exposure (capped): ${result.total_estimated_exposure:,.0f}\n"
            f"Methodology: {result.methodology}"
        )
        return (
            await nim_client.chat_completion(
                chain,
                system=SYSTEM_PROMPT,
                user=user_prompt,
                max_tokens=250,
                disable_thinking=True,
                relay_handle=handle,
            )
        ).strip()


async def run_exposure_agent(
    bundle: EventBundle, vision: DamageEvidence | None, confidence: float, settings: Settings
) -> InsurerExposureOutput:
    result = compute_insurer_exposure(bundle, vision, confidence)
    try:
        narrative = await _narrative(result, settings)
        if not narrative:
            raise ValueError("empty narrative returned")
        return result.model_copy(update={"narrative": narrative, "agent_harness": "direct"})
    except Exception as exc:  # noqa: BLE001 - NIM unreachable/unconfigured -> honest degrade to math-only
        logger.warning("Exposure narrative call failed (%s); returning math with no narrative.", exc)
        return result
