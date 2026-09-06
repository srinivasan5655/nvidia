"""
Human approval gate — "no operational action leaves the system without a
passed gate" (deck) plus an explicit human sign-off before either decision
output is considered final. This is deliberately NOT a model decision: it's a
human clicking Approve/Reject in the frontend against the already-computed
outputs.

Storage: in-memory dict for the hackathon demo (single-process FastAPI app).
Swapping this for a real datastore is the one piece that needs to change for
multi-instance deployment; every other module only depends on this file's
functions, not on the storage mechanism.
"""
from __future__ import annotations

from app.models.schemas import ApprovalRequest, ApprovalStatus, EventRunResult

_STORE: dict[str, EventRunResult] = {}


def save_run(result: EventRunResult) -> None:
    _STORE[result.event.event_id] = result


def get_run(event_id: str) -> EventRunResult | None:
    return _STORE.get(event_id)


def list_runs() -> list[EventRunResult]:
    return list(_STORE.values())


def apply_approval(event_id: str, request: ApprovalRequest) -> EventRunResult | None:
    result = _STORE.get(event_id)
    if result is None:
        return None
    if result.overall_status != "awaiting_approval":
        raise ValueError(f"Event {event_id} is not awaiting approval (status={result.overall_status}).")

    result.approval_status = ApprovalStatus.APPROVED if request.decision == "approved" else ApprovalStatus.REJECTED
    result.approval_note = request.note
    result.overall_status = "approved" if request.decision == "approved" else "rejected"
    _STORE[event_id] = result
    return result
