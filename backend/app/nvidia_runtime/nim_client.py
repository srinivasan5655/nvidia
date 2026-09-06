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


async def chat_completion(target: LlmTarget, *, system: str, user: str, temperature: float = 0.2, max_tokens: int = 800) -> str:
    client = _client_for(target)
    resp = await client.chat.completions.create(
        model=target.model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=temperature,
        max_tokens=max_tokens,
    )
    return resp.choices[0].message.content or ""


async def vision_completion(target: LlmTarget, *, prompt: str, image_path: str, max_tokens: int = 500) -> str:
    """Send a geo-tagged field/drone image to a NIM vision-language model
    (e.g. nvidia/neva-22b, or Qwen2.5-VL if self-hosted) for structured
    damage-evidence extraction. NIM vision endpoints accept the same
    OpenAI-style `image_url` content block with a base64 data URI."""
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

    resp = await client.chat.completions.create(
        model=target.model,
        messages=[{"role": "user", "content": content}],
        max_tokens=max_tokens,
    )
    return resp.choices[0].message.content or ""
