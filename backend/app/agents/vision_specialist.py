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
    # Both verified problems below are specific to DeepAgents' mandatory
    # tool-binding (filesystem/task tools are "protected scaffolding" it
    # always attaches, plus a further tool binding for structured output)
    # combined with an image — the direct, tool-free vision call in
    # run_vision_specialist_locally works fine against the same account.
    #
    # 1. ChatNVIDIA (langchain-nvidia-ai-endpoints) special-cases image-
    #    message formatting per model via an internal registry
    #    (_nv_vlm_adjust_input / model.model_type in chat_models.py).
    #    meta/llama-3.2-11b-vision-instruct isn't in it, so the VLM
    #    image-adjustment step is silently skipped and NIM 400s ("the
    #    number of image tokens (0) must be the same as the number of
    #    images (1)"). Plain ChatOpenAI passes the request through
    #    unmodified and avoids this — same fix nim_client.py already uses.
    # 2. With ChatOpenAI, 11b fails fast (~1-2s) with that same 400 once
    #    tools are bound. The larger 90b variant does NOT 400 — but adding
    #    the structured-output tool binding on top made it hang instead of
    #    erroring: a 120s timeout with LangChain's default retries took
    #    364s (~3 attempts) to finally give up.
    #
    # Net effect: DeepAgents-wrapped vision doesn't reliably work against
    # any vision model on this account today. openshell_supervisor's caller
    # falls back to run_vision_specialist_locally on any exception here, so
    # we deliberately use the model that fails FAST (11b, ~1-2s) rather than
    # the one that hangs, plus a short timeout and no retries as a backstop
    # — the fallback should trigger almost immediately, not after minutes.
    from langchain_openai import ChatOpenAI

    target = resolve_vision_target(settings)
    return ChatOpenAI(
        model=target.model,
        base_url=target.base_url,
        api_key=target.api_key or "not-required",
        timeout=25.0,
        max_retries=0,
    )


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


async def run_vision_specialist_via_deepagent(settings: Settings, *, image_path: str) -> DamageEvidence:
    """The actual DeepAgents path: builds the compiled graph from
    build_vision_specialist() and invokes it with the field image as a
    multimodal message. `response_format=DamageEvidence` on the agent means
    LangChain's structured-output binding parses the model's answer for us —
    state["structured_response"] comes back as a real DamageEvidence
    instance, not text we regex out ourselves (contrast
    run_vision_specialist_locally below, a raw NIM call with hand-rolled
    JSON parsing). This is the in-process branch's real specialist path when
    no OpenShell cluster is configured; the sandboxed path still runs the
    separate, dependency-free app/specialists/flood_vision.py heuristic
    script (DeepAgents/LangGraph aren't installable inside that minimal
    sandbox image)."""
    import base64
    from pathlib import Path

    from langchain_core.messages import HumanMessage

    agent = build_vision_specialist(settings)
    b64 = base64.b64encode(Path(image_path).read_bytes()).decode()
    message = HumanMessage(
        content=[
            {"type": "text", "text": "Analyze this field image for flood damage evidence."},
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
        ]
    )
    result = await agent.ainvoke({"messages": [message]})
    structured = result.get("structured_response")
    if not isinstance(structured, DamageEvidence):
        raise ValueError(f"DeepAgent did not return a structured DamageEvidence response (got {type(structured)})")
    return structured


async def run_vision_specialist_locally(settings: Settings, *, image_path: str) -> DamageEvidence:
    """Fallback path when no OpenShell cluster is configured: call the NIM
    vision endpoint directly (no sandbox isolation). Used in replay-mode demo
    runs; `openshell_supervisor` marks the gate DEGRADED when this path is
    taken, so the audit trail is honest about the missing isolation."""
    from app.nvidia_runtime import nim_client

    target = resolve_vision_target(settings)
    raw = await nim_client.vision_completion(
        target,
        # A hand-written example beats dumping model_json_schema() into the
        # prompt: the schema's Python repr uses single quotes (invalid JSON),
        # and vision-instruct models tend to echo a large embedded schema
        # blob back verbatim before appending their answer — producing
        # `{<echoed schema>, <answer keys>}`, which is neither valid JSON nor
        # parseable. A short literal example keeps the model focused on
        # producing exactly one small object.
        prompt=(
            SYSTEM_PROMPT
            + "\n\nRespond with ONLY a single JSON object, no markdown, no bullet points, no "
            + "explanation outside the object, in exactly this shape (example values only):\n"
            + '{"flooding_observed": true, "estimated_water_depth_ft": 2.5, '
            + '"structural_damage_observed": false, "road_blocked": true, '
            + '"visible_hazards": ["standing_water"], "confidence": 0.7, '
            + '"narrative": "one sentence describing only what is visible"}'
        ),
        image_path=image_path,
        json_mode=True,
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
