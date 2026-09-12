"""
Exposure Agent — DeepAgents wrapper around the deterministic insurer-exposure
calculation, matching the architecture diagram's "04 Insurance / Exposure
Agent" role.

Guardrail preserved exactly as in insurer_exposure.py: "no model ever
produces a dollar figure." The agent's only tool IS that deterministic
calculation — every numeric field in the returned InsurerExposureOutput
comes from compute_insurer_exposure()'s math, captured directly from the
tool call in our own code, never re-typed or re-derived by the model. The
agent's sole contribution is `narrative`, a short underwriter-facing
explanation of numbers it read back from the tool.

Falls back to calling compute_insurer_exposure() directly (no agent, no
narrative) on any failure — see the vision_specialist.py module docstring
for the verified, repeatable multi-tool-binding failure mode on this NIM
account that this fallback exists for.
"""
from __future__ import annotations

from app.agents.vision_specialist import DamageEvidence
from app.config import Settings
from app.decision.insurer_exposure import compute_insurer_exposure
from app.models.schemas import EventBundle, InsurerExposureOutput
from app.nvidia_runtime.switchyard_router import resolve_reasoning_target

SYSTEM_PROMPT = """You are an insurance exposure agent. Call compute_exposure \
to get the deterministic exposure figures for this event — never estimate or \
invent the numbers yourself. Then write a short (2-3 sentence) narrative for \
an underwriter explaining what the tool returned in plain language."""


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


async def run_exposure_agent(
    bundle: EventBundle, vision: DamageEvidence | None, confidence: float, settings: Settings
) -> InsurerExposureOutput:
    from deepagents import create_deep_agent
    from langchain_core.messages import HumanMessage
    from langchain_core.tools import tool
    from pydantic import BaseModel

    class ExposureSummary(BaseModel):
        narrative: str

    captured: dict[str, InsurerExposureOutput] = {}

    @tool
    def compute_exposure() -> dict:
        """Computes the deterministic insurer exposure (TIV, damage ratios,
        gross/net/capped loss) for this event. Call this before writing your
        summary — never estimate the numbers yourself."""
        result = compute_insurer_exposure(bundle, vision, confidence)
        captured["result"] = result
        return result.model_dump()

    agent = create_deep_agent(
        model=_chat_model(settings),
        tools=[compute_exposure],
        system_prompt=SYSTEM_PROMPT,
        name="exposure_agent",
        response_format=ExposureSummary,
    )
    result = await agent.ainvoke(
        {"messages": [HumanMessage(content="Compute and summarize the insurer exposure for this event.")]}
    )
    structured = result.get("structured_response")
    if not isinstance(structured, ExposureSummary) or "result" not in captured:
        raise ValueError("Exposure agent did not call the tool and/or return a structured summary")

    return captured["result"].model_copy(update={"narrative": structured.narrative, "agent_harness": "deepagents"})
