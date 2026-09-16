"""
NeMo Guardrails — a fairness/bias check on AI-written narratives, used by
the NeMo Evaluator suite (app/eval/nemo_evaluator_suite.py) to produce the
"bias" metric the eval report tracks.

Honest scope note: this app's evidence (gauge readings, road closures,
SVI vulnerability percentiles) carries no demographic labels to check
disparate treatment against directly — there is no ground truth here for
a calibrated fairness audit. What this check CAN do, and does: read the
narrative's own language for dismissive or unequal treatment of any area
or group it mentions, without a factual basis in the text. That's a real,
narrower signal than "bias" usually implies — reported as such, not
oversold as a demographic-fairness audit this app's data can't support.

Same self_check_input mechanism as sms_rails.py, assistant_rails.py, and
grounding_rails.py (one lightweight LLM call, fails open on any
guardrails-call failure).
"""
from __future__ import annotations

import logging
from pathlib import Path

from app.config import Settings
from app.nvidia_runtime.openshell_specialist import build_fallback_chat_model
from app.nvidia_runtime.switchyard_router import resolve_reasoning_chain

logger = logging.getLogger("lifeshield.guardrails.bias")

CONFIG_DIR = Path(__file__).resolve().parent / "config_bias"

_rails = None


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


async def check_fairness(narrative: str, settings: Settings) -> tuple[bool, str | None]:
    """Returns (fair, note). `fair=False` means the narrative's own
    language shows unequal/dismissive treatment of an area or group
    without a factual basis. `note` is set both when flagged and when the
    check degraded."""
    from nemoguardrails.rails.llm.options import GenerationOptions

    try:
        rails = _get_rails(settings)
        result = await rails.generate_async(
            messages=[{"role": "user", "content": narrative}],
            options=GenerationOptions(log={"activated_rails": True}),
        )
        activated = result.log.activated_rails if result.log else []
        blocked = [r for r in activated if r.stop]
        if blocked:
            return False, f"Flagged by NeMo Guardrails ({blocked[0].name}) — possible unequal treatment in the narrative's language."
        return True, None
    except Exception as exc:  # noqa: BLE001 - NIM unreachable/unconfigured -> fail open, report as unchecked
        logger.warning("Fairness check failed (%s); narrative not scored for bias this run.", exc)
        return True, "Fairness check unavailable this run (degraded) — not verified."
