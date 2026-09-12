from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from sse_starlette.sse import EventSourceResponse

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


@router.get("/replay/stream")
async def replay_event_stream(
    label: str = Query(default="Houston heavy-rain event (replayed)"),
    evidence_mode: str | None = Query(default=None),
):
    """Same pipeline as POST /replay, but emits one SSE event per stage
    (evidence assembled, each gate, outputs ready, complete) so the UI can
    light up the gate pipeline live instead of waiting on one multi-second
    blocking response. The final 'complete' event carries the identical
    EventRunResult that POST /replay returns, and this route saves it into
    the same in-memory store — GET /api/v1/events sees runs from either path.
    Registered as a plain GET (not under /replay's POST) purely because
    EventSource can only issue GET requests."""
    settings = get_settings()
    queue: asyncio.Queue[tuple[str, dict[str, Any]] | None] = asyncio.Queue()

    async def on_progress(stage: str, payload: dict[str, Any]) -> None:
        await queue.put((stage, payload))

    async def run() -> None:
        try:
            result = await run_event_pipeline(
                settings, label=label, evidence_mode=evidence_mode, on_progress=on_progress
            )
            approval.save_run(result)
        finally:
            await queue.put(None)

    async def event_generator():
        task = asyncio.create_task(run())
        try:
            while True:
                item = await queue.get()
                if item is None:
                    break
                stage, payload = item
                data: dict[str, Any] = {}
                for key, value in payload.items():
                    data[key] = value.model_dump(mode="json") if hasattr(value, "model_dump") else value
                yield {"event": stage, "data": json.dumps(data)}
        finally:
            await task

    return EventSourceResponse(event_generator())


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
