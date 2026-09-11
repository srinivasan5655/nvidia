from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.config import get_settings
from app.decision import approval
from app.models.schemas import ApprovalRequest, EventRunResult, ReplayEventRequest
from app.orchestrator import run_event_pipeline

router = APIRouter(prefix="/api/v1/events", tags=["events"])


@router.post("/replay", response_model=EventRunResult)
async def replay_event(request: ReplayEventRequest) -> EventRunResult:
    """Run the full evidence-to-decision pipeline against the committed
    replay fixtures — this is 'today's demo: one replayed Houston event'."""
    settings = get_settings()
    result = await run_event_pipeline(
        settings, label=request.label, evidence_mode=request.evidence_mode
    )
    approval.save_run(result)
    return result


@router.get("", response_model=list[EventRunResult])
async def list_events() -> list[EventRunResult]:
    return approval.list_runs()


@router.get("/{event_id}", response_model=EventRunResult)
async def get_event(event_id: str) -> EventRunResult:
    result = approval.get_run(event_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"No event run found with id {event_id}")
    return result


@router.post("/{event_id}/approve", response_model=EventRunResult)
async def approve_event(event_id: str, request: ApprovalRequest) -> EventRunResult:
    try:
        result = approval.apply_approval(event_id, request)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if result is None:
        raise HTTPException(status_code=404, detail=f"No event run found with id {event_id}")
    return result
