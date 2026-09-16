from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from sse_starlette.sse import EventSourceResponse

from app.config import get_settings
from app.decision import approval
from app.decision.after_action_report import generate_after_action_report
from app.decision.briefing import generate_decision_brief, generate_executive_briefing
from app.decision.cap_export import CapExportError, generate_cap_alert
from app.decision.fnol import generate_fnol_draft
from app.decision.portfolio_pml import compute_portfolio_pml
from app.decision.proactive_monitor import scan_for_emerging_risk
from app.models.schemas import (
    AfterActionReportResult,
    ApprovalRequest,
    BriefingResult,
    CapAlertResult,
    DecisionBrief,
    EventRunResult,
    FnolDraft,
    PortfolioPmlResult,
    ProactiveAlert,
    ReplayEventRequest,
)
from app.orchestrator import run_event_pipeline

router = APIRouter(prefix="/api/v1/events", tags=["events"])


@router.post("/replay", response_model=EventRunResult)
async def replay_event(request: ReplayEventRequest) -> EventRunResult:
    """Run the full evidence-to-decision pipeline against the committed
    replay fixtures — this is 'today's demo: one replayed Houston event'."""
    settings = get_settings()
    result = await run_event_pipeline(
        settings,
        label=request.label,
        city=request.city,
        evidence_mode=request.evidence_mode,
        inject_contradiction=request.inject_contradiction,
    )
    approval.save_run(result)
    return result


@router.get("/replay/stream")
async def replay_event_stream(
    label: str = Query(default="Houston heavy-rain event (replayed)"),
    city: str = Query(default="houston"),
    evidence_mode: str | None = Query(default=None),
    inject_contradiction: bool = Query(default=False),
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
                settings,
                label=label,
                city=city,
                evidence_mode=evidence_mode,
                inject_contradiction=inject_contradiction,
                on_progress=on_progress,
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


@router.get("/proactive-alerts", response_model=list[ProactiveAlert])
async def proactive_alerts() -> list[ProactiveAlert]:
    """Polled by the frontend (see ProactiveAlertsBanner.tsx) to surface
    alerts the system raised on its own — see decision/proactive_monitor.py
    for what "on its own" means here. Registered ahead of GET /{event_id}
    so this literal path segment isn't swallowed by that dynamic route."""
    settings = get_settings()
    return await scan_for_emerging_risk(settings)


@router.get("/portfolio/pml", response_model=PortfolioPmlResult)
async def portfolio_pml() -> PortfolioPmlResult:
    """Cross-event Probable Maximum Loss rollup for the Insurance persona
    (see decision/portfolio_pml.py) — registered ahead of GET /{event_id}
    for the same reason as /proactive-alerts above: this literal path must
    not be swallowed by that dynamic route."""
    return compute_portfolio_pml()


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


@router.post("/{event_id}/briefing", response_model=BriefingResult)
async def briefing_for_event(event_id: str) -> BriefingResult:
    """Executive Briefing — one more read-only narrative composed over an
    already-completed run's own output (see decision/briefing.py). Never
    recomputes and never changes overall_status/approval_status; generated
    fresh on each call rather than cached, since approval/decision state can
    change between requests for the same event_id."""
    result = approval.get_run(event_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"No event run found with id {event_id}")
    settings = get_settings()
    return await generate_executive_briefing(result, settings)


@router.post("/{event_id}/decision-brief", response_model=DecisionBrief)
async def decision_brief_for_event(event_id: str) -> DecisionBrief:
    """Decision-support brief for the moment a duty officer is actually
    about to click Approve/Reject — distinct from the Executive Briefing
    above, which is for a reader who never watched the run. See
    decision/briefing.py's generate_decision_brief for why this exists."""
    result = approval.get_run(event_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"No event run found with id {event_id}")
    settings = get_settings()
    return await generate_decision_brief(result, result.forward_risk_forecast, settings)


@router.post("/{event_id}/cap-alert", response_model=CapAlertResult)
async def cap_alert_for_event(event_id: str) -> CapAlertResult:
    """CAP (Common Alerting Protocol) export for the Government persona —
    see decision/cap_export.py. Only ever succeeds for an APPROVED run; a
    409 here means the run hasn't been approved yet, not a server error."""
    result = approval.get_run(event_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"No event run found with id {event_id}")
    try:
        cap_xml, tier = generate_cap_alert(result)
    except CapExportError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return CapAlertResult(event_id=event_id, cap_xml=cap_xml, alert_tier=tier)


@router.post("/{event_id}/after-action-report", response_model=AfterActionReportResult)
async def after_action_report_for_event(event_id: str) -> AfterActionReportResult:
    """After-Action Report for the Government persona — see
    decision/after_action_report.py. Meaningful once a run has been decided
    (approved or rejected); generated on demand, not cached, same as the
    Executive Briefing and Decision Brief above."""
    result = approval.get_run(event_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"No event run found with id {event_id}")
    settings = get_settings()
    return await generate_after_action_report(result, settings)


@router.post("/{event_id}/policies/{policy_id}/fnol-draft", response_model=FnolDraft)
async def fnol_draft_for_policy(event_id: str, policy_id: str) -> FnolDraft:
    """FNOL draft for one policy in this event's footprint — see
    decision/fnol.py. 404 if the event or the policy_id isn't found in this
    run's own InsurerExposureOutput.lines (never a made-up policy)."""
    result = approval.get_run(event_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"No event run found with id {event_id}")
    if result.insurer_exposure is None:
        raise HTTPException(status_code=404, detail=f"Event {event_id} has no insurer exposure computed")
    line = next((l for l in result.insurer_exposure.lines if l.policy_id == policy_id), None)
    if line is None:
        raise HTTPException(status_code=404, detail=f"No policy {policy_id} in event {event_id}'s exposure lines")
    settings = get_settings()
    return await generate_fnol_draft(result.event, line, settings)
