from __future__ import annotations

from fastapi import APIRouter

from app.config import get_settings
from app.decision.assistant import answer_question
from app.models.schemas import AssistantAnswer, AssistantChatRequest

router = APIRouter(prefix="/api/v1/assistant", tags=["assistant"])


@router.post("/chat", response_model=AssistantAnswer)
async def assistant_chat(request: AssistantChatRequest) -> AssistantAnswer:
    settings = get_settings()
    return await answer_question(request.question, request.event_id, settings)
