"""
Hazard Overlay / Life-Safety Agent — DeepAgents wrapper around life-safety
narrative synthesis, matching the architecture diagram's "02 Geospatial /
Hazard Overlay Agent" role.

No tool is needed here (unlike exposure/evacuation): turning verified
evidence + gate results into guidance text is inherently a generation task,
not a "call a deterministic function and narrate its output" task. The
DeepAgent still binds its own built-in tools (filesystem/task) regardless of
whether we pass any — see the module docstring in vision_specialist.py for
the verified, repeatable failure mode this triggers on this NIM account
(multi-tool binding malforms the response or 500s). life_safety.py's caller
falls back to a direct NIM chat_completion call (the pre-existing, proven
path) on any failure here, exactly like the vision specialist.
"""
from __future__ import annotations

from pydantic import BaseModel

from app.config import Settings
from app.nvidia_runtime.openshell_specialist import build_fallback_chat_model
from app.nvidia_runtime.switchyard_router import ReasoningEffort, resolve_reasoning_chain


class HazardAgentOutput(BaseModel):
    headline: str
    guidance_points: list[str]
    hazard_narrative: str


def _chat_model(settings: Settings, effort: ReasoningEffort):
    from langchain_nvidia_ai_endpoints import ChatNVIDIA

    chain = resolve_reasoning_chain(settings, effort=effort)
    # timeout=10: fail fast if the DeepAgents harness is going to fail on
    # this account, so the direct-call fallback isn't delayed. Unlike
    # ChatOpenAI, ChatNVIDIA has no max_retries field at all — passing one
    # gets forwarded into the request body itself, which the NIM endpoint
    # then rejects outright ("Unsupported parameter(s): max_retries").
    return build_fallback_chat_model(chain, model_cls=ChatNVIDIA, timeout=10.0)


async def run_hazard_agent(
    system_prompt: str, user_prompt: str, settings: Settings, effort: ReasoningEffort
) -> HazardAgentOutput:
    from deepagents import create_deep_agent
    from langchain_core.messages import HumanMessage

    agent = create_deep_agent(
        model=_chat_model(settings, effort),
        tools=[],
        system_prompt=system_prompt,
        name="hazard_overlay_agent",
        response_format=HazardAgentOutput,
    )
    result = await agent.ainvoke({"messages": [HumanMessage(content=user_prompt)]})
    structured = result.get("structured_response")
    if not isinstance(structured, HazardAgentOutput):
        raise ValueError(f"Hazard agent did not return a structured response (got {type(structured)})")
    return structured
