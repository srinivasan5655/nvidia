"""
Thin async client for NVIDIA NIM endpoints (OpenAI-compatible Chat Completions
API), used for both build.nvidia.com (dev) and self-hosted NIM on Curiosity
v2 (prod). Every call is wrapped in a NeMo Relay LLM scope by the caller
(see nvidia_runtime/relay_governance.py) — this module never calls the model
directly outside a Relay scope in agent code paths.

`chat_completion`/`vision_completion` also accept an ordered
`list[LlmTarget]` (see switchyard_router.resolve_reasoning_chain /
resolve_vision_chain) for primary/backup failover: a self-hosted vLLM
target first, build.nvidia.com second. Only connection/timeout/5xx errors
advance to the next target — a 4xx means the request itself is wrong, and
retrying it against a different backend would silently mask that bug
instead of surfacing it.
"""
from __future__ import annotations

import base64
import logging
import time
from pathlib import Path
from typing import Any, Sequence

import openai
from openai import AsyncOpenAI
from switchyard import LlmTarget

from app.config import get_settings
from app.nvidia_runtime.relay_governance import estimate_cost_usd, record_call_metrics

logger = logging.getLogger("lifeshield.nim")

# Errors worth retrying on the next target in the chain: the backend is down,
# slow, or erroring server-side. Anything else (400, 401, 404, ...) is a
# request/config bug that will fail identically everywhere, so it's left to
# propagate immediately rather than burning latency on a doomed retry.
_FAILOVER_EXCEPTIONS = (openai.APIConnectionError, openai.APITimeoutError, openai.InternalServerError)


def _client_for(target: LlmTarget) -> AsyncOpenAI:
    return AsyncOpenAI(base_url=target.base_url, api_key=target.api_key or "not-required")


def _record_usage(relay_handle: Any, target: LlmTarget, usage: Any, *, latency_ms: float) -> None:
    if usage is None:
        return
    prompt_tokens = usage.prompt_tokens or 0
    completion_tokens = usage.completion_tokens or 0
    settings = get_settings()
    record_call_metrics(
        relay_handle,
        model=target.model,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=usage.total_tokens or 0,
        latency_ms=latency_ms,
        cost_usd=estimate_cost_usd(settings, prompt_tokens=prompt_tokens, completion_tokens=completion_tokens),
    )


def _as_chain(target: "LlmTarget | Sequence[LlmTarget]") -> list[LlmTarget]:
    return list(target) if isinstance(target, (list, tuple)) else [target]


async def _with_failover(targets: "LlmTarget | Sequence[LlmTarget]", call):
    """Runs `call(target)` against each target in order, advancing to the
    next one only on _FAILOVER_EXCEPTIONS. Re-raises the last error once the
    chain is exhausted, so existing callers' try/except degrade logic keeps
    working unchanged."""
    chain = _as_chain(targets)
    for i, target in enumerate(chain):
        try:
            return await call(target)
        except _FAILOVER_EXCEPTIONS as exc:
            if i + 1 >= len(chain):
                raise
            logger.warning(
                "NIM target %s (%s) failed (%s); failing over to %s.",
                target.id, target.model, exc, chain[i + 1].id,
            )


async def chat_completion(
    target: "LlmTarget | Sequence[LlmTarget]",
    *,
    system: str,
    user: str,
    temperature: float = 0.2,
    max_tokens: int = 2000,
    disable_thinking: bool = False,
    relay_handle: Any = None,
) -> str:
    """``disable_thinking`` forwards `chat_template_kwargs: {"thinking": false}`
    — verified against nvidia/nemotron-3.5-lightning-30b-a3b on build.nvidia.com
    (dev), where it suppresses the model's chain-of-thought entirely
    (reasoning_content comes back null) instead of leaving it to chance
    whether that reasoning fits under max_tokens before the real answer.
    Without this, the same model was non-deterministically spending
    2000-5000+ tokens "thinking" before ever emitting its JSON answer,
    hitting finish_reason="length" mid-thought on roughly one call in three
    at max_tokens=2000-5000 — a silent, intermittent degrade to the "[LLM
    unavailable]" fallback despite the API call itself succeeding.

    The self-hosted vLLM prod target (same checkpoint, served under the
    "lifeshield" alias) uses a different chat-template key for the same
    toggle — `enable_thinking`, not `thinking` — verified live via
    `curl http://10.187.9.29:8069/v1/chat/completions` from the Curiosity v2
    host itself. Both keys are sent together so this works unmodified against
    either backend: each ignores the key it doesn't recognize rather than
    rejecting the request (verified for both), so this is not a per-target
    branch, just belt-and-suspenders."""
    kwargs: dict = {}
    if disable_thinking:
        kwargs["extra_body"] = {"chat_template_kwargs": {"thinking": False, "enable_thinking": False}}

    async def _call(t: LlmTarget) -> str:
        started = time.monotonic()
        resp = await _client_for(t).chat.completions.create(
            model=t.model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
            **kwargs,
        )
        _record_usage(relay_handle, t, resp.usage, latency_ms=(time.monotonic() - started) * 1000)
        return resp.choices[0].message.content or ""

    return await _with_failover(target, _call)


async def vision_completion(
    target: "LlmTarget | Sequence[LlmTarget]",
    *,
    prompt: str,
    image_path: str,
    max_tokens: int = 500,
    json_mode: bool = False,
    relay_handle: Any = None,
) -> str:
    """Send a geo-tagged field/drone image to a NIM vision-language model
    (e.g. meta/llama-3.2-11b-vision-instruct, or a self-hosted VLM in prod)
    for structured damage-evidence extraction. NIM vision endpoints accept
    the same OpenAI-style `image_url` content block with a base64 data URI.

    ``json_mode`` requests strict `{"type": "json_object"}` response
    formatting — verified against meta/llama-3.2-11b-vision-instruct on
    build.nvidia.com, where it reliably replaces free-form markdown prose
    with a single parseable JSON object. If a target model/endpoint doesn't
    support the parameter, the API call raises and the caller's existing
    exception handling degrades the gate — this never introduces a new
    failure mode, only a better-formatted success path."""
    path = Path(image_path)
    if path.exists():
        b64 = base64.b64encode(path.read_bytes()).decode()
        image_url = f"data:image/jpeg;base64,{b64}"
    else:
        logger.warning("Field image %s not found; vision call proceeds text-only (degraded).", image_path)
        image_url = None

    content: list[dict] = [{"type": "text", "text": prompt}]
    if image_url:
        content.append({"type": "image_url", "image_url": {"url": image_url}})

    kwargs: dict = {}
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    async def _call(t: LlmTarget) -> str:
        started = time.monotonic()
        resp = await _client_for(t).chat.completions.create(
            model=t.model,
            messages=[{"role": "user", "content": content}],
            max_tokens=max_tokens,
            **kwargs,
        )
        _record_usage(relay_handle, t, resp.usage, latency_ms=(time.monotonic() - started) * 1000)
        return resp.choices[0].message.content or ""

    return await _with_failover(target, _call)
