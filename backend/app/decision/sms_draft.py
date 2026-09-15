"""
Decision Output — SMS Alert Drafting.

Turns the already-verified life-safety headline/guidance into a short,
citizen-facing SMS in the operator's chosen language. Same guardrail family
as counterfactual.py and life_safety.py: the model translates/condenses, it
never invents a new location, number, or hazard beyond what's in the
headline/guidance it was given. Unlike those two, this runs on the
high-effort model tier even though the task looks templated — verified live
that the low-effort tier's translations into non-Latin scripts are
unreliable (see draft_sms_message's inline comment for what that looked
like).

The draft is a starting point an operator reviews and can edit before
sending, same as every other AI-generated field in this app (see
components/common/AiBadge.tsx on the frontend) — it is NOT sent directly;
app/notifications/sms.py's NeMo Guardrails check still runs on whatever text
is actually in the message box at send time, regardless of whether it came
from this draft or was hand-typed.
"""
from __future__ import annotations

import logging

from app.config import Settings
from app.models.schemas import SmsDraftResult
from app.nvidia_runtime import nim_client
from app.nvidia_runtime.relay_governance import governed_scope
from app.nvidia_runtime.switchyard_router import resolve_reasoning_chain

logger = logging.getLogger("lifeshield.sms_draft")

# Display name -> the exact language name given to the model. Kept in Python
# (not just the frontend) so the prompt always names the language the same
# way the UI does, and so a language can't reach the model without also
# being a validated, known option.
SUPPORTED_LANGUAGES: dict[str, str] = {
    "en": "English",
    "es": "Spanish",
    "hi": "Hindi",
    "ta": "Tamil",
    "kn": "Kannada",
    "te": "Telugu",
    "fr": "French",
    "zh": "Simplified Chinese",
    "vi": "Vietnamese",
}

SYSTEM_PROMPT = """You write short public SMS emergency alerts for citizens, translating/condensing an \
already-verified life-safety headline and guidance into ONE alert message.

Rules:
- Write the ENTIRE message in the requested target language — no English unless the target language IS English.
- Maximum 300 characters (fits two SMS segments). Be concise.
- Use ONLY the facts given in the headline/guidance below — never invent a new location, number, hazard, or \
instruction that isn't already there.
- Plain, clear, urgent tone appropriate for a public safety alert. No hashtags, no emoji, no markdown.
- Start with "LifeShield AI Alert" translated naturally into the target language (or kept as a brand name if that \
reads more naturally), then the city name, then the core warning.
- Return ONLY the message text — no quotes, no preamble, no explanation."""


def _fallback_message(city_label: str, headline: str, language: str) -> str:
    """English-only, deterministic — used when the draft LLM call fails.
    Never silently mixes a requested non-English language with untranslated
    English text; it degrades honestly to English and says so via
    model_used="none" rather than guessing a translation itself."""
    return f"LifeShield AI Alert — {city_label}: {headline}. Stay tuned to official channels for updates."


async def draft_sms_message(
    *, city_label: str, headline: str, guidance_points: list[str], language_code: str, settings: Settings
) -> SmsDraftResult:
    language_name = SUPPORTED_LANGUAGES.get(language_code, "English")
    user_prompt = (
        f"City: {city_label}\n"
        f"Headline: {headline}\n"
        f"Guidance points: {guidance_points[:4]}\n"
        f"Target language: {language_name}"
    )

    # High effort, not low: verified live that the low-effort tier
    # (nemotron-3.5-lightning) produces garbled, occasionally
    # fact-wrong output on non-English targets (mixed-script gibberish,
    # even the wrong city name) — translation into a low-resource script
    # needs more capability than templating a narrative from evidence
    # that already agrees, which is what "low effort" is tuned for
    # elsewhere in this app.
    chain = resolve_reasoning_chain(settings, effort="high")
    target = chain[0]
    with governed_scope(
        "sms_draft_narrative", "Llm", metadata={"model": target.model, "language": language_code}
    ) as handle:
        try:
            raw = await nim_client.chat_completion(
                chain,
                system=SYSTEM_PROMPT,
                user=user_prompt,
                max_tokens=500,
                # Verified live this is NOT optional for this model on this
                # task: without it, nemotron-3-super sometimes writes its
                # planning ("We need to produce a Tamil message, starting
                # with...") directly into `content` in English instead of
                # routing it to the separate reasoning_content field —
                # unlike the finish_reason="length" failure mode documented
                # in life_safety.py, this one isn't a truncation, it's the
                # model choosing to show its work inline. Forcing thinking
                # off removes that channel entirely.
                disable_thinking=True,
                relay_handle=handle,
            )
            message = raw.strip().strip('"')
            if not message:
                raise ValueError("empty draft returned")
            return SmsDraftResult(message=message, model_used=target.model, language=language_code)
        except Exception as exc:  # noqa: BLE001 - NIM unreachable/unconfigured -> degrade to an English template
            logger.warning("SMS draft failed (%s); falling back to an English template.", exc)
            return SmsDraftResult(
                message=_fallback_message(city_label, headline, language_code), model_used="none", language="en"
            )
