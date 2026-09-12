"""
Evacuation Planner Agent — DeepAgents wrapper around the deterministic
OSRM-based route computation, matching the architecture diagram's
"03 Response / Evacuation Planner" role.

Same discipline as exposure_agent.py: the agent's only tool IS
compute_evacuation_plan(); every route, distance, and duration comes from
that real routing computation, captured directly from the tool call. The
agent's sole contribution is `narrative`, a short dispatcher-facing summary
of the routes it read back from the tool.

Falls back to calling compute_evacuation_plan() directly (no agent, no
narrative) on any failure — see vision_specialist.py's module docstring for
the verified multi-tool-binding failure mode this fallback exists for.
"""
from __future__ import annotations

from app.config import Settings
from app.decision.evacuation import compute_evacuation_plan
from app.models.schemas import EvacuationPlan, EventBundle
from app.nvidia_runtime.switchyard_router import resolve_reasoning_target

SYSTEM_PROMPT = """You are an evacuation planning agent. Call plan_evacuation \
to get the deterministic candidate shelters and routes for this event — \
never invent a shelter, route, distance, or duration yourself. Then write a \
short (2-3 sentence) narrative for an emergency dispatcher summarizing what \
the tool returned, flagging any route with a closure warning."""


def _chat_model(settings: Settings):
    from langchain_nvidia_ai_endpoints import ChatNVIDIA

    target = resolve_reasoning_target(settings, effort="low")
    # No max_retries here: unlike ChatOpenAI, ChatNVIDIA has no such field —
    # passing one gets forwarded straight into the request body, which NIM
    # then rejects ("Unsupported parameter(s): max_retries").
    return ChatNVIDIA(
        model=target.model,
        base_url=target.base_url,
        api_key=target.api_key or "not-required",
        timeout=10.0,
    )


async def run_evacuation_agent(bundle: EventBundle, settings: Settings, *, confidence: float) -> EvacuationPlan | None:
    from deepagents import create_deep_agent
    from langchain_core.messages import HumanMessage
    from langchain_core.tools import tool
    from pydantic import BaseModel

    class EvacuationSummary(BaseModel):
        narrative: str

    captured: dict[str, EvacuationPlan | None] = {}

    @tool
    async def plan_evacuation() -> dict:
        """Computes the deterministic evacuation plan (candidate shelters and
        OSRM-routed distances/durations) for this event. Call this before
        writing your summary — never estimate routes yourself."""
        result = await compute_evacuation_plan(bundle, settings, confidence=confidence)
        captured["result"] = result
        return result.model_dump() if result else {"routes": []}

    agent = create_deep_agent(
        model=_chat_model(settings),
        tools=[plan_evacuation],
        system_prompt=SYSTEM_PROMPT,
        name="evacuation_agent",
        response_format=EvacuationSummary,
    )
    result = await agent.ainvoke(
        {"messages": [HumanMessage(content="Plan and summarize evacuation routes for this event.")]}
    )
    structured = result.get("structured_response")
    if not isinstance(structured, EvacuationSummary) or "result" not in captured:
        raise ValueError("Evacuation agent did not call the tool and/or return a structured summary")

    plan = captured["result"]
    if plan is None:
        return None
    return plan.model_copy(update={"narrative": structured.narrative, "agent_harness": "deepagents"})
