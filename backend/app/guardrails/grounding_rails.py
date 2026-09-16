"""
NeMo Guardrails — verifies an AI-written life-safety narrative stays
grounded in the verified evidence it was given, before it reaches the
operator.

Every narrative-producing prompt in this app already instructs the model
"use ONLY what's in evidence, never invent a fact" — until this module
existed, nothing checked whether it actually complied; that was enforced
by the prompt alone. This adds a real, second-layer NeMo Guardrails check:
the narrative and the evidence it was given are compared, and the app's
own evidence-only fallback is used instead if the check finds an
unsupported claim.

Verified against the installed nemoguardrails==0.24.0 package (not
guessed) that this should NOT use the library's reserved "self check
facts" action, tempting as that name is for this exact job: that action
drives the full Colang dialog engine per call — verified live that it
triggers a `generate_user_intent` LLM call before the fact-check itself
even runs, meaning one grounding check costs two model calls, not one,
doubling exposure to this account's already-documented NIM socket-
timeout/503 flakiness for zero benefit. This reuses the same lightweight,
single-call `self check input` rail as every other guardrails check in
this app (sms_rails.py, assistant_rails.py), with the evidence/narrative
pair passed as one JSON payload instead of a single message.

Fails open (narrative kept as-is, unchecked) on any guardrails-call
failure — a flaky moderation call should never silently downgrade an
otherwise-fine narrative to the evidence-only fallback.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

from app.config import Settings
from app.nvidia_runtime.openshell_specialist import build_fallback_chat_model
from app.nvidia_runtime.switchyard_router import resolve_reasoning_chain

logger = logging.getLogger("lifeshield.guardrails.grounding")

CONFIG_DIR = Path(__file__).resolve().parent / "config_grounding"

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


async def check_grounding(evidence_text: str, narrative: str, settings: Settings) -> tuple[bool, str | None]:
    """Returns (grounded, note). `grounded=False` means the narrative
    contains a claim not supported by the evidence it was given — the
    caller should fall back to an evidence-only summary. `note` is set
    both when blocked (the reason) and when the check itself degraded (so
    the caller can tell "verified as grounded" apart from "grounding was
    never actually checked this run")."""
    from nemoguardrails.rails.llm.options import GenerationOptions

    payload = json.dumps({"evidence": evidence_text, "narrative": narrative})
    try:
        rails = _get_rails(settings)
        result = await rails.generate_async(
            messages=[{"role": "user", "content": payload}],
            options=GenerationOptions(log={"activated_rails": True}),
        )
        activated = result.log.activated_rails if result.log else []
        blocked = [r for r in activated if r.stop]
        if blocked:
            return False, f"Blocked by NeMo Guardrails ({blocked[0].name}) — narrative contained an unsupported claim."
        return True, None
    except Exception as exc:  # noqa: BLE001 - NIM unreachable/unconfigured -> fail open, keep the narrative as-is
        logger.warning("Grounding check failed (%s); narrative kept unchecked this run.", exc)
        return True, "Grounding check unavailable this run (degraded) — narrative was not verified against evidence."
