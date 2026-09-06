"""
Vision specialist — a LangChain DeepAgent whose only job is structured flood
damage-evidence extraction from a geo-tagged field image, matching the deck's
"Build NVIDIA vision model on flood imagery for grounded damage evidence."

Model backend: `ChatNVIDIA` (langchain-nvidia-ai-endpoints), pointed at
build.nvidia.com in dev or self-hosted NIM in prod via the same Switchyard
target resolution used everywhere else (nvidia_runtime.switchyard_router).

This agent is meant to run *inside* an OpenShell sandbox (see
`openshell_supervisor.py`, which launches it there) so a compromised or
misbehaving specialist can't reach anything but the one image it was given —
matching the openshell-deepagent reference pattern (NVIDIA OpenShell sandbox +
LangChain DeepAgents harness + Nemotron-class model).
"""
from __future__ import annotations

from pydantic import BaseModel, Field

from app.config import Settings
from app.nvidia_runtime.switchyard_router import resolve_vision_target

SYSTEM_PROMPT = """You are a flood-damage evidence specialist. You are given \
one geo-tagged field or drone image from a flood event. Extract ONLY what is \
visually verifiable in the image. Do not speculate about anything outside the \
frame. Return calibrated confidence, not certainty."""


class DamageEvidence(BaseModel):
    flooding_observed: bool
    estimated_water_depth_ft: float | None = Field(default=None, description="null if not estimable")
    structural_damage_observed: bool
    road_blocked: bool
    visible_hazards: list[str] = Field(default_factory=list)
    confidence: float
    narrative: str


def _chat_model(settings: Settings):
    # Deferred import: only construct the LangChain NVIDIA client when this
    # specialist actually runs, so config without any NVIDIA_API_KEY set can
    # still boot the rest of the app (e.g. for gate-only unit tests).
    from langchain_nvidia_ai_endpoints import ChatNVIDIA

    target = resolve_vision_target(settings)
    return ChatNVIDIA(model=target.model, base_url=target.base_url, api_key=target.api_key or "not-required")


def build_vision_specialist(settings: Settings):
    """Returns a compiled DeepAgent graph. Caller (openshell_supervisor)
    decides whether to invoke it locally or ship it into an OpenShell sandbox."""
    from deepagents import create_deep_agent

    model = _chat_model(settings)
    agent = create_deep_agent(
        model=model,
        tools=[],  # no external tools — the guardrail is that this specialist can ONLY look at the image it's given
        system_prompt=SYSTEM_PROMPT,
        name="flood_vision_specialist",
        response_format=DamageEvidence,
    )
    return agent


async def run_vision_specialist_locally(settings: Settings, *, image_path: str) -> DamageEvidence:
    """Fallback path when no OpenShell cluster is configured: call the NIM
    vision endpoint directly (no sandbox isolation). Used in replay-mode demo
    runs; `openshell_supervisor` marks the gate DEGRADED when this path is
    taken, so the audit trail is honest about the missing isolation."""
    from app.nvidia_runtime import nim_client

    target = resolve_vision_target(settings)
    raw = await nim_client.vision_completion(
        target,
        prompt=(
            SYSTEM_PROMPT
            + "\n\nRespond as compact JSON matching this schema: "
            + str(DamageEvidence.model_json_schema())
        ),
        image_path=image_path,
    )
    return _parse_or_degrade(raw)


def _parse_or_degrade(raw_text: str) -> DamageEvidence:
    import json
    import re

    match = re.search(r"\{.*\}", raw_text, re.DOTALL)
    if not match:
        return DamageEvidence(
            flooding_observed=False,
            structural_damage_observed=False,
            road_blocked=False,
            confidence=0.0,
            narrative=f"[vision specialist returned unparseable output, degraded] {raw_text[:200]}",
        )
    try:
        data = json.loads(match.group(0))
        return DamageEvidence(**data)
    except Exception as exc:  # noqa: BLE001 - deliberately broad: any parse failure degrades, never crashes
        return DamageEvidence(
            flooding_observed=False,
            structural_damage_observed=False,
            road_blocked=False,
            confidence=0.0,
            narrative=f"[vision specialist output failed validation: {exc}]",
        )
