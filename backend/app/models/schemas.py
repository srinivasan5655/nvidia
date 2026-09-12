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
    # Population/vulnerability baseline (CDC/ATSDR SVI, itself built from
    # Census ACS 5-year estimates — see evidence/population_svi.py) and real
    # shelter-capable sites (OpenStreetMap) — both informational context for
    # decision outputs, not flood-hazard evidence. evidence_verifier.py
    # deliberately excludes both from its source-agreement scoring; see
    # HAZARD_SOURCES there.
    POPULATION_SVI = "population_svi"
    OSM_SHELTER = "osm_shelter"


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
    # Which Switchyard reasoning tier/model produced this narrative — "low"
    # when evidence was clean and unambiguous (all gates passed, high
    # confidence), "high" when the model had to reason over degraded/
    # conflicting signals. Defaults kept for pre-existing callers/tests that
    # construct this model without the new fields.
    reasoning_effort: Literal["low", "high"] = "high"
    model_used: str = ""
    # Which harness produced headline/guidance_points/hazard_narrative:
    # "deepagents" when the DeepAgents-wrapped call succeeded end-to-end,
    # "direct" when it fell back to a plain NIM chat completion (see
    # app/agents/hazard_agent.py). Independent of reasoning_effort — that's
    # which model tier, this is which calling harness.
    agent_harness: Literal["deepagents", "direct"] = "direct"


class InsurerPolicy(BaseModel):
    policy_id: str
    latitude: float
    longitude: float
    total_insured_value: float
    coverage_limit: float
    deductible: float


class InsurerExposureLine(BaseModel):
    policy_id: str
    latitude: float
    longitude: float
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
    # Agent-authored underwriter narrative — set only on the "deepagents"
    # harness path (see app/agents/exposure_agent.py). Every numeric field
    # above always comes from compute_insurer_exposure()'s deterministic
    # math regardless of harness; the agent only narrates numbers it read
    # back from that tool, never computes or restates them itself.
    narrative: str = ""
    agent_harness: Literal["deepagents", "direct"] = "direct"


class EvacuationRouteLeg(BaseModel):
    """One candidate origin->shelter route. Deterministic, like insurer
    exposure: no model ever picks a route or a shelter — OSRM (real public
    routing engine) computes the path, geometry, distance and duration; a
    shelter only appears here if it's a real evidence item from the OSM
    adapter above."""

    shelter_item_id: str  # EvidenceItem.item_id of the OSM_SHELTER source
    shelter_name: str
    shelter_latitude: float
    shelter_longitude: float
    distance_km: float
    duration_min: float
    route_geometry: list[list[float]]  # [[lon, lat], ...] — OSRM path, or a 2-point straight line if degraded
    routed_live: bool  # False when OSRM was unreachable and this is a great-circle estimate, not a real road route
    closure_warnings: list[str] = Field(default_factory=list)  # nearby TranStar incident summaries, if any


class EvacuationPlan(BaseModel):
    origin_latitude: float
    origin_longitude: float
    origin_basis: str  # e.g. "centroid of reported high-water incidents" or "event footprint centroid"
    routes: list[EvacuationRouteLeg]
    methodology: str
    confidence: float
    citing_evidence: list[str]
    # Agent-authored dispatcher narrative — set only on the "deepagents"
    # harness path (see app/agents/evacuation_agent.py). Every route/
    # distance/duration above always comes from compute_evacuation_plan()'s
    # OSRM-backed math regardless of harness.
    narrative: str = ""
    agent_harness: Literal["deepagents", "direct"] = "direct"


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
    evacuation_plan: Optional[EvacuationPlan] = None
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
