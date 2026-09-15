"""
NeMo Guardrails — moderates the one piece of free-text a human types that
this app actually sends to real people: the SMS console's alert message,
before it goes out over Twilio. Nothing else in the pipeline runs user-typed
text through an LLM unmoderated in the first place (every other prompt is
built from verified evidence, not free text), so this is the one place a
content-moderation rail earns its keep.

Verified against the installed `nemoguardrails==0.24.0` package (not
guessed):
  - `LLMRails(config, llm=<langchain_chat_model>)` takes precedence over any
    `models:` entry in config.yml — the YAML's `models:` block exists only
    to satisfy schema validation; the actual model is always the same
    ChatNVIDIA target/api_key every other agent in this app uses (see
    app/agents/hazard_agent.py's `_chat_model` for the identical pattern).
  - `generate_async(..., options=GenerationOptions(log={"activated_rails":
    True}))` returns a `GenerationResponse` whose `.log.activated_rails` is
    the reliable way to detect a block: each `ActivatedRail.stop` is True
    exactly when that rail decided to halt processing — checking for a
    specific refusal string in `.response` would be fragile by comparison.
  - A guardrails LLM call can fail exactly like any other NIM call (verified
    live: a `LLMCallException` wrapping a socket timeout on this account
    today). This fails OPEN (message allowed, flagged as unmoderated) rather
    than silently blocking a real emergency alert on an infra hiccup — the
    same "degrade honestly, don't crash the real thing" rule as every other
    NIM call in this app, applied to a safety console instead of the demo
    pipeline.
"""
from __future__ import annotations

import logging
from pathlib import Path

from app.config import Settings
from app.nvidia_runtime.openshell_specialist import build_fallback_chat_model
from app.nvidia_runtime.switchyard_router import resolve_reasoning_chain

logger = logging.getLogger("lifeshield.guardrails")

CONFIG_DIR = Path(__file__).resolve().parent / "config"

_rails = None  # lazily built once per process; RailsConfig parsing is not free


def _get_rails(settings: Settings):
    global _rails
    if _rails is not None:
        return _rails

    from langchain_nvidia_ai_endpoints import ChatNVIDIA
    from nemoguardrails import LLMRails, RailsConfig

    chain = resolve_reasoning_chain(settings, effort="low")
    llm = build_fallback_chat_model(chain, model_cls=ChatNVIDIA, timeout=20.0)
    config = RailsConfig.from_path(str(CONFIG_DIR))
    _rails = LLMRails(config, llm=llm)
    return _rails


async def check_message(text: str, settings: Settings) -> tuple[bool, str | None]:
    """Returns (allowed, note). `note` is set both when blocked (the reason)
    and when the check degraded (so the UI can show "sent unmoderated"
    rather than silently implying a message was checked when it wasn't)."""
    from nemoguardrails.rails.llm.options import GenerationOptions

    try:
        rails = _get_rails(settings)
        result = await rails.generate_async(
            messages=[{"role": "user", "content": text}],
            options=GenerationOptions(log={"activated_rails": True}),
        )
        activated = result.log.activated_rails if result.log else []
        blocked = [r for r in activated if r.stop]
        if blocked:
            return False, f"Blocked by NeMo Guardrails ({blocked[0].name})."
        return True, None
    except Exception as exc:  # noqa: BLE001 - NIM unreachable/unconfigured -> fail open, don't block a real alert
        logger.warning("Guardrails check failed (%s); allowing the message through unmoderated.", exc)
        return True, "Guardrails check unavailable this run (degraded) — message was not moderated."
