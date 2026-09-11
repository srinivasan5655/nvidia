from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


# ---------------------------------------------------------------------------
# Evidence layer
# ---------------------------------------------------------------------------

class EvidenceSource(str, Enum):
    NWS = "nws"
    USGS = "usgs"
    HCFCD = "hcfcd"
    TRANSTAR = "transtar"
    FEMA = "fema"
    FIELD_IMAGE = "field_image"


class EvidenceItem(BaseModel):
    """One normalized record from one source. Every field the decision gates
    need to reason about is on this envelope, never buried in a raw payload."""

    item_id: str = Field(default_factory=lambda: new_id("ev"))
    source: EvidenceSource
    source_record_id: str  # the source's own identifier, for lineage / audit
    observed_at: datetime  # when the source says this reading/alert is valid as-of
    retrieved_at: datetime = Field(default_factory=now_utc)
    latitude: float
    longitude: float
    summary: str
    raw: dict[str, Any] = Field(default_factory=dict)  # untouched source payload, for audit
    is_replay: bool = False


class EventBundle(BaseModel):
    """The one auditable evidence record described in the pptx: everything
    the agents are allowed to see for this event, with full source lineage."""

    event_id: str = Field(default_factory=lambda: new_id("evt"))
    label: str
    polygon: list[list[float]]  # [[lon, lat], ...] closed ring
    window_start: datetime
    window_end: datetime
    evidence_mode: Literal["replay", "live"] = "replay"
    created_at: datetime = Field(default_factory=now_utc)
    items: list[EvidenceItem] = Field(default_factory=list)
    field_image_path: Optional[str] = None

    def sources_present(self) -> set[EvidenceSource]:
        return {i.source for i in self.items}


# ---------------------------------------------------------------------------
# Decision gates
# ---------------------------------------------------------------------------

class GateStatus(str, Enum):
    PASSED = "passed"
    BLOCKED = "blocked"
    DEGRADED = "degraded"  # ran, but with reduced confidence / partial evidence


class GateResult(BaseModel):
    gate_name: str
    status: GateStatus
    confidence: float
    reasoning: str
    evidence_used: list[str] = Field(default_factory=list)  # EvidenceItem ids
    details: dict[str, Any] = Field(default_factory=dict)
    ran_at: datetime = Field(default_factory=now_utc)
    relay_scope_id: Optional[str] = None


# ---------------------------------------------------------------------------
# Decision outputs
# ---------------------------------------------------------------------------

class LifeSafetyGuidance(BaseModel):
    headline: str
    guidance_points: list[str]
    hazard_narrative: str
    confidence: float
    citing_evidence: list[str]


class InsurerPolicy(BaseModel):
    policy_id: str
    latitude: float
    longitude: float
    total_insured_value: float
    coverage_limit: float
    deductible: float


class InsurerExposureLine(BaseModel):
    policy_id: str
    total_insured_value: float
    coverage_limit: float
    deductible: float
    estimated_damage_ratio: float
    gross_loss_estimate: float
    net_of_deductible: float
    capped_at_limit: float


class InsurerExposureOutput(BaseModel):
    total_policies_in_footprint: int
    total_tiv_in_footprint: float
    total_estimated_exposure: float
    lines: list[InsurerExposureLine]
    methodology: str
    confidence: float
    citing_evidence: list[str]


class ApprovalStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    NOT_REQUIRED = "not_required"


class EventRunResult(BaseModel):
    event: EventBundle
    gates: list[GateResult] = Field(default_factory=list)
    life_safety: Optional[LifeSafetyGuidance] = None
    insurer_exposure: Optional[InsurerExposureOutput] = None
    overall_status: Literal["blocked", "awaiting_approval", "approved", "rejected"] = "blocked"
    approval_status: ApprovalStatus = ApprovalStatus.PENDING
    approval_note: Optional[str] = None


# ---------------------------------------------------------------------------
# API request/response models
# ---------------------------------------------------------------------------

class ReplayEventRequest(BaseModel):
    scenario: str = "houston_heavy_rain"
    label: str = "Houston heavy-rain event (replayed)"
    evidence_mode: Literal["replay", "live"] | None = None
    """Per-request override of the server-default evidence_mode. None = use server default."""


class ApprovalRequest(BaseModel):
    decision: Literal["approved", "rejected"]
    note: Optional[str] = None
    approver: str = "duty_officer"
