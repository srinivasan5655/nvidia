"""
NeMo Guardrails — moderates the operator's free-typed question to the
Assistant panel before it reaches NeMo Retriever/NIM.

This is the second of the app's two real free-text-reaches-an-LLM
surfaces (the other is sms_rails.py's SMS console) — an operator can type
anything into the Assistant box, and until this module existed nothing
checked it before it reached a model; the system prompt telling the model
to answer only from retrieved context is an instruction, not a guardrail.

Same mechanism as sms_rails.py (verified there, and re-verified here,
against the installed nemoguardrails==0.24.0 package): a `self check
input` rail — real NeMo Guardrails, not a keyword filter — scoped to this
surface's own narrow risk (prompt-injection/jailbreak attempts, abuse, or
completely off-topic spam), never a generic safety filter that would flag
an ordinary question about casualties or evacuation as unsafe.

Fails open (question allowed through, flagged unmoderated) on any
guardrails-call failure — same "degrade honestly, don't block the real
thing" rule as every other NIM call in this app, applied here to an
internal chat instead of a real citizen-facing send.
"""
from __future__ import annotations

import logging
from pathlib import Path

from app.config import Settings
from app.nvidia_runtime.openshell_specialist import build_fallback_chat_model
from app.nvidia_runtime.switchyard_router import resolve_reasoning_chain

logger = logging.getLogger("lifeshield.guardrails.assistant")

CONFIG_DIR = Path(__file__).resolve().parent / "config_assistant"

_rails = None  # lazily built once per process, same as sms_rails.py


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


async def check_question(question: str, settings: Settings) -> tuple[bool, str | None]:
    """Returns (allowed, note) — same shape as sms_rails.check_message.
    `note` is set both when blocked (the reason) and when the check
    degraded (so the caller can tell "checked and clean" apart from
    "never actually checked this run")."""
    from nemoguardrails.rails.llm.options import GenerationOptions

    try:
        rails = _get_rails(settings)
        result = await rails.generate_async(
            messages=[{"role": "user", "content": question}],
            options=GenerationOptions(log={"activated_rails": True}),
        )
        activated = result.log.activated_rails if result.log else []
        blocked = [r for r in activated if r.stop]
        if blocked:
            return False, f"Blocked by NeMo Guardrails ({blocked[0].name})."
        return True, None
    except Exception as exc:  # noqa: BLE001 - NIM unreachable/unconfigured -> fail open, don't block the operator
        logger.warning("Assistant guardrails check failed (%s); allowing the question through unmoderated.", exc)
        return True, "Guardrails check unavailable this run (degraded) — question was not moderated."
