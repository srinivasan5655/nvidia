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
    city: str = "houston"  # "houston" | "chennai" | "bangalore"
    city_label: str = "Houston, TX"
    polygon: list[list[float]]  # [[lon, lat], ...] closed ring
    window_start: datetime
    window_end: datetime
    evidence_mode: Literal["replay", "live"] = "replay"
    created_at: datetime = Field(default_factory=now_utc)
    items: list[EvidenceItem] = Field(default_factory=list)
    field_image_path: Optional[str] = None
    red_team_injected: bool = False
    """True when this bundle was deliberately mutated by the 'Simulate
    Contradiction' red-team path (see orchestrator._apply_red_team_contradiction)
    — every downstream gate still runs its real, unmodified deterministic
    logic against this bundle; only the evidence itself was altered."""

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


class CounterfactualAnalysis(BaseModel):
    """AI-written "what if this warning had never been issued" narrative,
    generated once per completed event — a plain-language counterfactual,
    not a second set of deterministic numbers. Never fabricates a dollar
    figure or a body count; the prompt explicitly asks for qualitative
    reasoning grounded in the same evidence the rest of the pipeline saw."""

    narrative: str
    model_used: str = ""
    generated_at: datetime = Field(default_factory=now_utc)


class ForecastHorizon(BaseModel):
    """One projected point on the forward risk timeline. `narrative` is the
    only model-written field; everything else is either a fixed label or
    copied from the deterministic trend fed into the prompt."""

    label: Literal["+6h", "+12h", "+24h"]
    narrative: str


class ForwardRiskForecast(BaseModel):
    """AI-derived forward projection — the app's answer to "where is this
    going," not just "where is this now." `trend_basis` is 100% deterministic
    (real rate-of-change arithmetic over the same USGS gauge readings already
    in the evidence bundle, see decision/forecast.py's compute_gauge_trend);
    the model narrates the implication of that trend at each horizon and is
    explicitly forbidden from inventing a new number. Optional on
    EventRunResult: only produced when life_safety exists and at least one
    trend-bearing (USGS) evidence item was present."""

    trend_basis: list[str]
    horizons: list[ForecastHorizon]
    model_used: str = ""
    generated_at: datetime = Field(default_factory=now_utc)


class ProactiveAlert(BaseModel):
    """One alert the system decided to raise on its own, without a human
    clicking 'Check Now' on that specific event — see
    decision/proactive_monitor.py. Distinct from every other narrative in
    this app in one respect: it's the only one triggered by a background
    scan noticing a trend crossing a threshold, not by a request."""

    event_id: str
    city_label: str
    headline: str
    narrative: str
    severity: Literal["watch", "warning"]
    model_used: str = ""
    triggered_at: datetime = Field(default_factory=now_utc)


class DecisionBrief(BaseModel):
    """A short brief generated for the person about to click Approve/Reject
    — not the Executive Briefing (that's for a reader who wasn't watching
    the run at all). This answers one question: 'what changed, and what's
    the trend, since the evidence was last this clear?' Built only from this
    run's own fields plus its forecast, never outside knowledge."""

    event_id: str
    summary: str
    model_used: str = ""
    generated_at: datetime = Field(default_factory=now_utc)


class ShelterDispatchPriority(BaseModel):
    """One shelter's resource-dispatch ranking — a different question from
    the Evacuation Plan's "nearest first": which shelter should a duty
    officer staff/resupply FIRST for the biggest plausible impact. See
    decision/resource_dispatch.py for the (explicitly illustrative)
    capacity assumption this is built on."""

    shelter_item_id: str
    shelter_name: str
    distance_km: float
    capacity_illustrative: int
    priority_score: float
    rank: int


class ResourceDispatchPlan(BaseModel):
    event_id: str
    shelters: list[ShelterDispatchPriority] = Field(default_factory=list)
    methodology: str
    generated_at: datetime = Field(default_factory=now_utc)


class ParametricTriggerResult(BaseModel):
    """Deterministic evaluation of whether this event's real gauge
    rate-of-rise crosses an illustrative parametric-insurance payout
    threshold — see decision/parametric_trigger.py. Tiers/payouts are
    illustrative (no real contract exists yet); the peak_rate and basis are
    real, measured numbers, not invented ones."""

    event_id: str
    triggered: bool
    tier: Optional[str] = None
    peak_rate: float
    basis: list[str] = Field(default_factory=list)
    payout_pct_illustrative: Optional[float] = None
    generated_at: datetime = Field(default_factory=now_utc)


class EventRunResult(BaseModel):
    event: EventBundle
    gates: list[GateResult] = Field(default_factory=list)
    life_safety: Optional[LifeSafetyGuidance] = None
    insurer_exposure: Optional[InsurerExposureOutput] = None
    evacuation_plan: Optional[EvacuationPlan] = None
    counterfactual: Optional[CounterfactualAnalysis] = None
    forward_risk_forecast: Optional[ForwardRiskForecast] = None
    # Everything below is new and purely additive — a default is always
    # provided, so any code (frontend or backend) that predates these
    # fields sees behavior byte-identical to before they existed.
    resource_dispatch: Optional[ResourceDispatchPlan] = None
    parametric_trigger: Optional[ParametricTriggerResult] = None
    alert_tier: Literal["watch", "warning", "emergency"] = "watch"
    """NWS/IMD-style public-alerting vocabulary for this event, computed
    deterministically from the real CAP severity/urgency fields already in
    the NWS/IMD evidence item — see decision/alert_tiers.py. Independent of
    overall_status, which never changes meaning or values because of this."""
    overall_status: Literal["blocked", "awaiting_approval", "approved", "rejected"] = "blocked"
    approval_status: ApprovalStatus = ApprovalStatus.PENDING
    approval_note: Optional[str] = None


# ---------------------------------------------------------------------------
# API request/response models
# ---------------------------------------------------------------------------

class ReplayEventRequest(BaseModel):
    scenario: str = "houston_heavy_rain"
    label: str = "Houston heavy-rain event (replayed)"
    city: str = "houston"  # "houston" | "chennai" | "bangalore"
    evidence_mode: Literal["replay", "live"] | None = None
    """Per-request override of the server-default evidence_mode. None = use server default."""
    inject_contradiction: bool = False
    """Red-team demo flag: simulate 4 of 5 hazard feeds going silent and the
    remaining one arriving stale, then run the real evidence_verifier/
    confidence_gate against that — see orchestrator._apply_red_team_contradiction."""


class ApprovalRequest(BaseModel):
    decision: Literal["approved", "rejected"]
    note: Optional[str] = None
    approver: str = "duty_officer"


class SmsSendRequest(BaseModel):
    message: str


class SmsSendResult(BaseModel):
    sent: bool
    reason: str | None = None  # e.g. "not_configured", "twilio_error"
    detail: str | None = None
    to_number_masked: str | None = None
    provider_sid: str | None = None


class SmsDraftRequest(BaseModel):
    city_label: str
    headline: str
    guidance_points: list[str] = Field(default_factory=list)
    language_code: str = "en"


class SmsDraftResult(BaseModel):
    message: str
    model_used: str
    language: str


class AssistantChatRequest(BaseModel):
    question: str
    event_id: str | None = None
    """If given and a matching run exists, its live state (hazard headline,
    gate statuses, exposure/evacuation summary) is added to the grounding
    context alongside the retrieved glossary passages."""


class AssistantCitation(BaseModel):
    doc_id: str
    title: str
    score: float


class AssistantAnswer(BaseModel):
    answer: str
    model_used: str
    citations: list[AssistantCitation] = Field(default_factory=list)
    grounded_in_current_event: bool = False
    blocked: bool = False
    """True when NeMo Guardrails blocked the operator's question before it
    ever reached the retriever/model — see app/guardrails/assistant_rails.py.
    Distinct from a plain "model unavailable" fallback so the UI can show
    a different state for "we chose not to answer" vs. "we couldn't"."""


# ---------------------------------------------------------------------------
# Golden-dataset evaluation
# ---------------------------------------------------------------------------

class EvalAssertion(BaseModel):
    name: str
    expected: str
    actual: str
    passed: bool


class EvalCaseResult(BaseModel):
    case_id: str
    label: str
    city: str
    passed: bool
    overall_status: str
    confidence: float | None = None
    latency_ms: int
    assertions: list[EvalAssertion] = Field(default_factory=list)
    error: str | None = None
    """Set only if the pipeline itself raised — a real infra failure, not an
    assertion mismatch. Reported honestly as a failed case either way."""


# ---------------------------------------------------------------------------
# Executive briefing
# ---------------------------------------------------------------------------

class BriefingResult(BaseModel):
    """A short, decision-oriented summary of one completed event run, for a
    reader who wasn't watching the pipeline execute — a Chief Minister, a
    portfolio head, a duty officer's supervisor. Same discipline as every
    other narrative in this app: built only from that run's own gates/
    life-safety/exposure/evacuation output, never from outside knowledge."""

    event_id: str
    briefing: str
    model_used: str
    generated_at: datetime = Field(default_factory=now_utc)


class EvalSuiteResult(BaseModel):
    run_at: datetime = Field(default_factory=now_utc)
    total_cases: int
    passed_count: int
    failed_count: int
    avg_latency_ms: int
    cases: list[EvalCaseResult] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# NeMo Evaluator — quality-metric benchmarks (real nemo-evaluator package,
# custom scorers; see app/eval/nemo_evaluator_suite.py)
# ---------------------------------------------------------------------------

class NemoEvalSample(BaseModel):
    """One scored sample within a benchmark — the question/case plus the
    exact metric values that sample earned, so a number in the aggregate
    can always be traced back to which case produced it."""

    input_label: str
    scores: dict[str, float]
    detail: str | None = None


class NemoEvalBenchmark(BaseModel):
    name: str
    metric: str
    """Human-readable description of what this benchmark measures and how
    (e.g. 'grounded ONLY by real NeMo Guardrails self_check_input calls
    against each case's own evidence')."""
    description: str
    sample_count: int
    aggregate: dict[str, float]
    """Mean of each metric across all samples in this benchmark, e.g.
    {"precision": 0.83, "recall": 0.91, "f1": 0.87, "accuracy": 0.86}."""
    samples: list[NemoEvalSample] = Field(default_factory=list)
    latency_ms: int


class NemoEvalReport(BaseModel):
    run_at: datetime = Field(default_factory=now_utc)
    engine: str = "nemo-evaluator"
    engine_version: str
    benchmarks: list[NemoEvalBenchmark] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Government feature set — CAP alert export, After-Action Report
# ---------------------------------------------------------------------------

class CapAlertResult(BaseModel):
    """A CAP 1.2 (OASIS Common Alerting Protocol) XML package — the format
    US IPAWS/Wireless Emergency Alerts and most national EM systems require
    before a warning can trigger a real public broadcast. See
    decision/cap_export.py: only ever generated for an APPROVED run, and
    every field in the XML is a reformatting of a value this pipeline
    already produced and a human already approved — never new content."""

    event_id: str
    cap_xml: str
    alert_tier: Literal["watch", "warning", "emergency"]
    generated_at: datetime = Field(default_factory=now_utc)


class AfterActionReportResult(BaseModel):
    """Post-incident compliance document — the report FEMA/NDMA-style
    agencies are typically required to file after a real event. Built only
    from this run's own gates/life-safety/exposure/evacuation/counterfactual
    output plus the actual human approval decision — see
    decision/after_action_report.py."""

    event_id: str
    report_text: str
    model_used: str
    generated_at: datetime = Field(default_factory=now_utc)


# ---------------------------------------------------------------------------
# Insurance feature set — FNOL draft, portfolio PML rollup
# ---------------------------------------------------------------------------

class FnolDraft(BaseModel):
    """A draft First Notice of Loss intake packet for one policy already
    inside this event's footprint — see decision/fnol.py. Every numeric
    field is copied verbatim from the already-final InsurerExposureLine;
    only incident_description is model-written. status is always
    'draft_pending_review' — this is intake support for a human adjuster,
    never an automated approval or payment."""

    event_id: str
    policy_id: str
    incident_description: str
    estimated_loss: float
    net_of_deductible: float
    capped_at_limit: float
    status: Literal["draft_pending_review"] = "draft_pending_review"
    model_used: str
    generated_at: datetime = Field(default_factory=now_utc)


class PortfolioPmlResult(BaseModel):
    """Cross-event Probable Maximum Loss rollup — sums the SAME already-
    final InsurerExposureOutput totals across every run currently held (see
    decision/portfolio_pml.py). Pure aggregation; no per-policy number is
    ever recomputed here, only summed once per event."""

    total_events: int
    aggregate_estimated_exposure: float
    aggregate_tiv: float
    by_city: dict[str, float] = Field(default_factory=dict)
    by_status: dict[str, float] = Field(default_factory=dict)
    generated_at: datetime = Field(default_factory=now_utc)
