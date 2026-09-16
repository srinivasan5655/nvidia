"""
Evacuation Planner Agent — narrator over the deterministic OSRM-based route
computation, matching the architecture diagram's "03 Response / Evacuation
Planner" role.

Same discipline as exposure_agent.py: every route, distance, and duration
comes from compute_evacuation_plan()'s real routing computation, captured
directly in our own code. The model's sole contribution is `narrative`, a
short dispatcher-facing summary of the routes it was handed.

Architecture note (changed 2026-09-14, same reasoning as exposure_agent.py):
this used to attempt a DeepAgents multi-tool agentic loop first. Verified
live and repeatedly on this account: that tier reliably timed out — same
failure mode documented in vision_specialist.py — so this call site was
always paying for a failed ~10s attempt before reaching the call that
actually produces the narrative. "Read back a route list and write two
sentences" is a templating task, not a multi-step tool-use problem; the
direct call is now the only tier.
"""
from __future__ import annotations

import logging

from app.config import Settings
from app.decision.evacuation import compute_evacuation_plan
from app.models.schemas import EvacuationPlan, EventBundle
from app.nvidia_runtime import nim_client
from app.nvidia_runtime.relay_governance import governed_scope
from app.nvidia_runtime.switchyard_router import resolve_reasoning_chain

logger = logging.getLogger("lifeshield.evacuation_agent")

SYSTEM_PROMPT = """You are an evacuation planning agent. You are given the ALREADY-COMPUTED, deterministic \
route(s) for one event — never invent or adjust a shelter, distance, or duration. Write a short (2-3 sentence) \
narrative for an emergency dispatcher summarizing them, flagging any route with a closure warning."""


async def _narrative(plan: EvacuationPlan, settings: Settings) -> str:
    chain = resolve_reasoning_chain(settings, effort="low")
    target = chain[0]
    with governed_scope("evacuation_narrative", "Llm", metadata={"model": target.model}) as handle:
        route_lines = "\n".join(
            f"- {r.shelter_name}: {r.distance_km} km, {r.duration_min} min"
            + (f" (closure warnings: {r.closure_warnings})" if r.closure_warnings else "")
            for r in plan.routes
        ) or "No candidate routes were found."
        user_prompt = f"Routes:\n{route_lines}\nMethodology: {plan.methodology}"
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


async def run_evacuation_agent(bundle: EventBundle, settings: Settings, *, confidence: float) -> EvacuationPlan | None:
    plan = await compute_evacuation_plan(bundle, settings, confidence=confidence)
    if plan is None:
        return None
    try:
        narrative = await _narrative(plan, settings)
        if not narrative:
            raise ValueError("empty narrative returned")
        return plan.model_copy(update={"narrative": narrative, "agent_harness": "direct"})
    except Exception as exc:  # noqa: BLE001 - NIM unreachable/unconfigured -> honest degrade to math-only
        logger.warning("Evacuation narrative call failed (%s); returning routes with no narrative.", exc)
        return plan
