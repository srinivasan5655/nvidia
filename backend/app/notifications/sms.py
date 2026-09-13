"""
Demo SMS console — sends one message to one preconfigured recipient via
Twilio's REST API.

Deliberately NOT the `twilio` PyPI SDK: this project already depends on
`httpx` for every other outbound HTTP call (see app/evidence/*.py,
app/nvidia_runtime/nim_client.py), and Twilio's Messages resource is a single
plain REST call (HTTP Basic auth + form-encoded body) — adding a whole SDK
dependency for one endpoint isn't worth it.

Guardrail: this is a demo console, not a general SMS gateway. The recipient
is always `settings.sms_demo_recipient` — there is no code path anywhere
that accepts an arbitrary destination number from a request.
"""
from __future__ import annotations

import logging

import httpx

from app.config import Settings
from app.guardrails import sms_rails
from app.models.schemas import SmsSendResult

logger = logging.getLogger("lifeshield.sms")

TWILIO_API_BASE = "https://api.twilio.com/2010-04-01"


def is_configured(settings: Settings) -> bool:
    return bool(
        settings.twilio_account_sid
        and settings.twilio_auth_token
        and settings.twilio_from_number
        and settings.sms_demo_recipient
    )


def mask_number(number: str | None) -> str | None:
    """+15551234567 -> +1•••••34567 — enough to confirm it's the right
    number on screen during a demo without fully exposing it."""
    if not number:
        return None
    if len(number) <= 4:
        return "•" * len(number)
    return f"{number[:2]}{'•' * (len(number) - 6)}{number[-4:]}"


async def send_demo_sms(message: str, settings: Settings) -> SmsSendResult:
    if not is_configured(settings):
        return SmsSendResult(
            sent=False,
            reason="not_configured",
            detail="Twilio credentials and/or SMS_DEMO_RECIPIENT are not set on the backend (.env).",
        )

    recipient_masked = mask_number(settings.sms_demo_recipient)

    allowed, moderation_note = await sms_rails.check_message(message, settings)
    if not allowed:
        logger.info("SMS blocked by guardrails: %s", moderation_note)
        return SmsSendResult(
            sent=False, reason="guardrails_blocked", detail=moderation_note, to_number_masked=recipient_masked
        )

    url = f"{TWILIO_API_BASE}/Accounts/{settings.twilio_account_sid}/Messages.json"
    data = {"To": settings.sms_demo_recipient, "From": settings.twilio_from_number, "Body": message}

    try:
        async with httpx.AsyncClient(timeout=settings.http_timeout_seconds) as client:
            resp = await client.post(
                url, data=data, auth=(settings.twilio_account_sid, settings.twilio_auth_token)
            )
        if resp.status_code >= 400:
            detail = resp.json().get("message", resp.text) if resp.content else resp.text
            logger.warning("Twilio send failed (%s): %s", resp.status_code, detail)
            return SmsSendResult(
                sent=False, reason="twilio_error", detail=str(detail), to_number_masked=recipient_masked
            )
        payload = resp.json()
        return SmsSendResult(
            sent=True,
            # moderation_note is only non-None here when the guardrails check
            # itself degraded (see sms_rails.check_message) — surfaces as an
            # honest "sent unmoderated" flag rather than implying every send
            # was checked when the LLM call failed.
            reason="guardrails_degraded" if moderation_note else None,
            detail=moderation_note,
            to_number_masked=recipient_masked,
            provider_sid=payload.get("sid"),
        )
    except httpx.HTTPError as exc:
        logger.warning("Twilio send request failed: %s", exc)
        return SmsSendResult(sent=False, reason="network_error", detail=str(exc), to_number_masked=recipient_masked)
