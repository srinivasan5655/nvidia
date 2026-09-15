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

--- Primary/backup chain (added for Curiosity v2 self-hosted vLLM) ---

Switchyard 0.2.0 (verified against the installed package, not assumed) has
no availability-based failover profile — its routing profiles all tier by
task complexity (a classifier/judge picking "strong" vs "weak"), never by
backend health. So "vLLM primary, build.nvidia.com backup" is implemented
here, at the application level, as an ordered `list[LlmTarget]`: nim_client.py
(direct calls) and the DeepAgents chat-model builders (via
`.with_fallbacks()`) both walk the list in order and move to the next
target only on a connection/timeout/5xx failure.

This only engages when `runtime_target="auto"` (the default) — an explicit
`"dev"` or `"prod"` pin stays a hard pin with no failover, preserving the
documented contract that those two values force one specific environment.
`"auto"` already meant "prod when configured, else dev"; extending that to
"prod when configured and reachable, else dev" is the same intent, not a new
toggle. When `nim_prod_base_url` is unset (today's actual state), the chain
always collapses to the single dev target — identical behavior to before
this was added.

--- Prod eligibility is per model, not just per environment ---

A self-hosted NIM/vLLM instance serves exactly one model (verified against a
real instance on Curiosity v2: NGC's `nim/nvidia/nemotron-3-super-120b-a12b`
container only answers for that one model). `nim_prod_base_url` is a single
config field, but that does NOT mean every call kind should route to it —
today only the high-effort reasoning model has a self-hosted instance;
low-effort reasoning (`nemotron-3.5-lightning-30b-a3b`) and vision
(`llama-3.2-11b-vision-instruct`) do not. Routing those to a NIM instance
that doesn't have the model loaded would 404 — a 4xx, deliberately excluded
from nim_client.py's failover set (a 4xx means a real bug, not an outage;
masking it by silently falling back would hide exactly the kind of
misconfiguration this comment describes). So each `resolve_*_chain` function
below passes its own `prod_eligible` flag to `_resolve_chain`, and
`_resolve_chain` treats "not eligible" as "no prod deployment exists for
this model" — always dev, even under an explicit `runtime_target=prod` pin,
because that pin can't be honored for a model prod was never given.
"""
from __future__ import annotations

import logging
from typing import Literal

from switchyard import LlmTarget

from app.config import Settings

logger = logging.getLogger("lifeshield.switchyard")

ReasoningEffort = Literal["low", "high"]


def resolve_reasoning_target(settings: Settings, *, effort: ReasoningEffort = "high") -> LlmTarget:
    """Primary target only — kept for callers that don't (yet) do failover.
    Prefer `resolve_reasoning_chain` for anything that dispatches a real
    request, so an unreachable self-hosted vLLM degrades to build.nvidia.com
    instead of failing the call outright."""
    return resolve_reasoning_chain(settings, effort=effort)[0]


def resolve_vision_target(settings: Settings) -> LlmTarget:
    """Primary target only — see resolve_reasoning_target's note."""
    return resolve_vision_chain(settings)[0]


def resolve_reasoning_chain(settings: Settings, *, effort: ReasoningEffort = "high") -> list[LlmTarget]:
    model = settings.nim_reasoning_model if effort == "high" else settings.nim_reasoning_model_light
    logger.info("Switchyard: reasoning effort=%s -> model=%s", effort, model)
    # Only the high-effort model has a self-hosted prod instance today (see
    # module docstring) — low-effort stays dev-only until a prod deployment
    # of nemotron-3.5-lightning actually exists.
    return _resolve_chain(settings, model=model, prod_eligible=(effort == "high"))


def resolve_vision_chain(settings: Settings) -> list[LlmTarget]:
    # No self-hosted vision NIM exists yet — see module docstring.
    return _resolve_chain(settings, model=settings.nim_vision_model, prod_eligible=False)


def _target(settings: Settings, *, model: str, prod: bool) -> LlmTarget:
    if prod:
        return LlmTarget(
            id="curiosity-nim-prod",
            model=model,
            base_url=settings.nim_prod_base_url,
            api_key=settings.nim_prod_api_key or "not-required",
            format="openai",
        )
    return LlmTarget(
        id="build-nvidia-dev",
        model=model,
        base_url=settings.nvidia_base_url,
        api_key=settings.nvidia_api_key or "",
        format="openai",
    )


def _resolve_chain(settings: Settings, *, model: str, prod_eligible: bool) -> list[LlmTarget]:
    dev = _target(settings, model=model, prod=False)

    if settings.runtime_target == "dev":
        logger.info("Switchyard: routing to DEV build.nvidia.com (pinned)")
        return [dev]

    if not settings.nim_prod_base_url:
        if settings.runtime_target == "prod":
            raise RuntimeError("runtime_target=prod but NIM_PROD_BASE_URL is not configured")
        logger.info("Switchyard: routing to DEV build.nvidia.com (prod not configured)")
        return [dev]

    if not prod_eligible:
        if settings.runtime_target == "prod":
            logger.warning(
                "Switchyard: runtime_target=prod but model=%s has no self-hosted prod deployment "
                "(NIM_PROD_BASE_URL only serves the high-effort reasoning model); routing to DEV instead "
                "of pinning to a NIM instance that doesn't have this model loaded.",
                model,
            )
        logger.info("Switchyard: routing to DEV build.nvidia.com (model=%s not deployed to prod)", model)
        return [dev]

    prod = _target(settings, model=model, prod=True)
    if settings.runtime_target == "prod":
        logger.info("Switchyard: routing to PROD self-hosted NIM (%s, pinned)", settings.nim_prod_base_url)
        return [prod]

    logger.info(
        "Switchyard: routing to PROD self-hosted NIM (%s) with DEV build.nvidia.com as failover",
        settings.nim_prod_base_url,
    )
    return [prod, dev]
