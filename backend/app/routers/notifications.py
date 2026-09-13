from __future__ import annotations

from fastapi import APIRouter

from app.config import get_settings
from app.decision.sms_draft import SUPPORTED_LANGUAGES, draft_sms_message
from app.models.schemas import SmsDraftRequest, SmsDraftResult, SmsSendRequest, SmsSendResult
from app.notifications import sms

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


@router.get("/sms/languages")
async def sms_languages() -> dict:
    return {"languages": [{"code": code, "name": name} for code, name in SUPPORTED_LANGUAGES.items()]}


@router.post("/sms/draft", response_model=SmsDraftResult)
async def sms_draft(request: SmsDraftRequest) -> SmsDraftResult:
    settings = get_settings()
    return await draft_sms_message(
        city_label=request.city_label,
        headline=request.headline,
        guidance_points=request.guidance_points,
        language_code=request.language_code,
        settings=settings,
    )


@router.get("/sms/status")
async def sms_status() -> dict:
    settings = get_settings()
    return {
        "configured": sms.is_configured(settings),
        "to_number_masked": sms.mask_number(settings.sms_demo_recipient),
        "from_number_masked": sms.mask_number(settings.twilio_from_number),
        "guardrails_enabled": True,  # always-on: every send is checked before it reaches Twilio (see sms.py)
    }


@router.post("/sms/send", response_model=SmsSendResult)
async def sms_send(request: SmsSendRequest) -> SmsSendResult:
    settings = get_settings()
    return await sms.send_demo_sms(request.message, settings)
