"""
Thin async client for NVIDIA NIM endpoints (OpenAI-compatible Chat Completions
API), used for both build.nvidia.com (dev) and self-hosted NIM on Curiosity
v2 (prod). Every call is wrapped in a NeMo Relay LLM scope by the caller
(see nvidia_runtime/relay_governance.py) — this module never calls the model
directly outside a Relay scope in agent code paths.
"""
from __future__ import annotations

import base64
import logging
from pathlib import Path

from openai import AsyncOpenAI
from switchyard import LlmTarget

logger = logging.getLogger("lifeshield.nim")


def _client_for(target: LlmTarget) -> AsyncOpenAI:
    return AsyncOpenAI(base_url=target.base_url, api_key=target.api_key or "not-required")


async def chat_completion(
    target: LlmTarget,
    *,
    system: str,
    user: str,
    temperature: float = 0.2,
    max_tokens: int = 2000,
    disable_thinking: bool = False,
) -> str:
    """``disable_thinking`` forwards `chat_template_kwargs: {"thinking": false}`
    — verified against nvidia/nemotron-3.5-lightning-30b-a3b, where it
    suppresses the model's chain-of-thought entirely (reasoning_content
    comes back null) instead of leaving it to chance whether that reasoning
    fits under max_tokens before the real answer. Without this, the same
    model was non-deterministically spending 2000-5000+ tokens "thinking"
    before ever emitting its JSON answer, hitting finish_reason="length"
    mid-thought on roughly one call in three at max_tokens=2000-5000 — a
    silent, intermittent degrade to the "[LLM unavailable]" fallback despite
    the API call itself succeeding. If a target model doesn't recognize the
    parameter it's typically ignored, not rejected — kept opt-in regardless
    so a self-hosted prod target's behavior isn't assumed."""
    client = _client_for(target)
    kwargs: dict = {}
    if disable_thinking:
        kwargs["extra_body"] = {"chat_template_kwargs": {"thinking": False}}
    resp = await client.chat.completions.create(
        model=target.model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=temperature,
        max_tokens=max_tokens,
        **kwargs,
    )
    return resp.choices[0].message.content or ""


async def vision_completion(
    target: LlmTarget, *, prompt: str, image_path: str, max_tokens: int = 500, json_mode: bool = False
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
    client = _client_for(target)
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

    resp = await client.chat.completions.create(
        model=target.model,
        messages=[{"role": "user", "content": content}],
        max_tokens=max_tokens,
        **kwargs,
    )
    return resp.choices[0].message.content or ""
