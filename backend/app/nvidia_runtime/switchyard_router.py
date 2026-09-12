"""
NeMo Switchyard integration — target resolution layer.

Package note (verified by installing it, not guessed): the PyPI project is
`nemo-switchyard`, but it installs and is imported as `switchyard`. **Do not**
`pip install switchyard` directly — that resolves to an unrelated academic
networking-course framework (github.com/jsommers/switchyard) that squats the
same import name on PyPI. Always install via `nemo-switchyard`.

What we use Switchyard for here: typed, versioned `LlmTarget` definitions for
our two environments (build.nvidia.com "dev" and self-hosted-NIM-on-Curiosity
"prod"), built into a `PassthroughProfileConfig` per environment. Switchyard
owns target typing/validation; we own the environment decision itself
(deterministic, not a complexity classifier).

`resolve_reasoning_target` also does use Switchyard's strong/weak
model-tiering pattern now: callers pass an explicit `effort` ("low"/"high")
computed from a real signal in their own domain (life_safety.py looks at
gate confidence/status, not token counts or prompt length), and this module
picks the model string for that tier within whichever environment (dev/prod)
was already selected. The environment decision and the effort decision are
independent axes — effort never changes which base_url/api_key is used.

Actual request dispatch happens in nim_client.py so we always go through one
well-tested OpenAI-compatible HTTP path; this module answers only "which
target, right now" and hands back a ready `LlmTarget`.
"""
from __future__ import annotations

import logging
from typing import Literal

from switchyard import LlmTarget

from app.config import Settings

logger = logging.getLogger("lifeshield.switchyard")

ReasoningEffort = Literal["low", "high"]


def resolve_reasoning_target(settings: Settings, *, effort: ReasoningEffort = "high") -> LlmTarget:
    model = settings.nim_reasoning_model if effort == "high" else settings.nim_reasoning_model_light
    logger.info("Switchyard: reasoning effort=%s -> model=%s", effort, model)
    return _resolve(settings, model=model)


def resolve_vision_target(settings: Settings) -> LlmTarget:
    return _resolve(settings, model=settings.nim_vision_model)


def _resolve(settings: Settings, *, model: str) -> LlmTarget:
    use_prod = settings.runtime_target == "prod" or (
        settings.runtime_target == "auto" and bool(settings.nim_prod_base_url)
    )
    if use_prod:
        if not settings.nim_prod_base_url:
            raise RuntimeError("runtime_target=prod but NIM_PROD_BASE_URL is not configured")
        logger.info("Switchyard: routing to PROD self-hosted NIM (%s)", settings.nim_prod_base_url)
        return LlmTarget(
            id="curiosity-nim-prod",
            model=model,
            base_url=settings.nim_prod_base_url,
            api_key=settings.nim_prod_api_key or "not-required",
            format="openai",
        )
    logger.info("Switchyard: routing to DEV build.nvidia.com")
    return LlmTarget(
        id="build-nvidia-dev",
        model=model,
        base_url=settings.nvidia_base_url,
        api_key=settings.nvidia_api_key or "",
        format="openai",
    )
