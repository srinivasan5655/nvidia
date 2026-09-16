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
`build_fallback_chat_model` / LangChain's `.with_fallbacks()`) both walk the
list in order and move to the next target only on a connection/timeout/5xx
failure.

This only engages when `runtime_target="auto"` (the default) — an explicit
`"dev"` or `"prod"` pin stays a hard pin with no failover, preserving the
documented contract that those two values force one specific environment.
`"auto"` already meant "prod when configured, else dev"; extending that to
"prod when configured and reachable, else dev" is the same intent, not a new
toggle. When `nim_prod_base_url` is unset (today's actual state), the chain
always collapses to the single dev target — identical behavior to before
this was added.

--- Prod eligibility, and prod endpoint, are both per model ---

A self-hosted NIM/vLLM instance serves exactly one model per port (verified
against real instances on Curiosity v2). Three self-hosted deployments exist
today, one per port:
  - `nim_prod_base_url`       -> 120b nemotron-3-super (high-effort reasoning)
  - `nim_prod_light_base_url` -> 30b nemotron-3.5-lightning, fine-tuned
                                  (low-effort reasoning) — a SEPARATE port
                                  from the 120b instance, not the same one
  - `nemo_retriever_self_hosted_url` -> nemotron-3-embed-1b (embeddings;
                                  see retriever_client.py, not this module)
Vision (`llama-3.2-11b-vision-instruct`) has no self-hosted deployment at
all — it always routes to build.nvidia.com, chain of one, no failover to
fail over to.

Routing an effort tier to the wrong prod port (e.g. low-effort to the 120b
instance) would 404 — a 4xx, deliberately excluded from nim_client.py's
failover set (a 4xx means a real bug, not an outage; masking it by silently
falling back would hide exactly the kind of misconfiguration this comment
describes). So each `resolve_*_chain` function below resolves its OWN prod
base_url/api_key pair and passes them to `_resolve_chain`, which treats an
unset prod URL for that specific tier as "no prod deployment exists for
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
    # Each effort tier has its OWN self-hosted port (see module docstring) —
    # never share one prod endpoint across both models. prod_model defaults
    # to the dev/catalog name and is only overridden when vLLM registered
    # the model under a different name (e.g. its full HF repo path).
    if effort == "high":
        dev_model = settings.nim_reasoning_model
        prod_base_url, prod_api_key = settings.nim_prod_base_url, settings.nim_prod_api_key
        prod_model, prod_id = settings.nim_prod_model or dev_model, "curiosity-nim-prod-120b"
    else:
        dev_model = settings.nim_reasoning_model_light
        prod_base_url, prod_api_key = settings.nim_prod_light_base_url, settings.nim_prod_light_api_key
        prod_model, prod_id = settings.nim_prod_light_model or dev_model, "curiosity-nim-prod-30b"
    logger.info("Switchyard: reasoning effort=%s -> dev_model=%s prod_model=%s", effort, dev_model, prod_model)
    return _resolve_chain(
        settings, dev_model=dev_model, prod_model=prod_model,
        prod_base_url=prod_base_url, prod_api_key=prod_api_key, prod_id=prod_id,
    )


def resolve_vision_chain(settings: Settings) -> list[LlmTarget]:
    # No self-hosted vision NIM exists — see module docstring. Always dev.
    return _resolve_chain(
        settings, dev_model=settings.nim_vision_model, prod_model=settings.nim_vision_model,
        prod_base_url=None, prod_api_key=None, prod_id="",
    )


def _target(*, model: str, base_url: str, api_key: str | None, target_id: str) -> LlmTarget:
    return LlmTarget(id=target_id, model=model, base_url=base_url, api_key=api_key or "not-required", format="openai")


def _resolve_chain(
    settings: Settings, *, dev_model: str, prod_model: str,
    prod_base_url: str | None, prod_api_key: str | None, prod_id: str,
) -> list[LlmTarget]:
    dev = LlmTarget(
        id="build-nvidia-dev", model=dev_model, base_url=settings.nvidia_base_url,
        api_key=settings.nvidia_api_key or "", format="openai",
    )

    if settings.runtime_target == "dev":
        logger.info("Switchyard: routing to DEV build.nvidia.com (pinned)")
        return [dev]

    if not prod_base_url:
        if settings.runtime_target == "prod":
            logger.warning(
                "Switchyard: runtime_target=prod but model=%s has no self-hosted prod deployment configured; "
                "routing to DEV instead of pinning to a NIM instance that doesn't exist for this model.",
                dev_model,
            )
        logger.info("Switchyard: routing to DEV build.nvidia.com (no prod deployment configured for model=%s)", dev_model)
        return [dev]

    prod = _target(model=prod_model, base_url=prod_base_url, api_key=prod_api_key, target_id=prod_id)
    if settings.runtime_target == "prod":
        logger.info("Switchyard: routing to PROD self-hosted NIM (%s, model=%s, pinned)", prod_base_url, prod_model)
        return [prod]

    logger.info(
        "Switchyard: routing to PROD self-hosted NIM (%s, model=%s) with DEV build.nvidia.com as failover",
        prod_base_url, prod_model,
    )
    return [prod, dev]
