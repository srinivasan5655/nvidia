// Mirrors backend/app/models/schemas.py field-for-field. Hand-written, not
// generated — keep in sync manually if the backend schema changes.

export type EvidenceSource =
  | "nws"
  | "usgs"
  | "hcfcd"
  | "transtar"
  | "fema"
  | "field_image"
  | "population_svi"
  | "osm_shelter";

export interface EvidenceItem {
  item_id: string;
  source: EvidenceSource;
  source_record_id: string;
  observed_at: string; // ISO 8601
  retrieved_at: string; // ISO 8601
  latitude: number;
  longitude: number;
  summary: string;
  raw: Record<string, unknown>;
  is_replay: boolean;
}

export type CityKey = "houston" | "chennai" | "bangalore";

/** Which world the shell is currently presenting. "field" keeps the
 * original plain-language guided flow (that persona is why it exists);
 * "command" and "insurance" get the Command Center home, reordered/
 * relabeled toward each world's own first questions — same underlying
 * data both times, since one pipeline run already produces both a
 * life-safety answer and a dollar figure. "executive" gets the same
 * Command Center content again, but read-only (no approve/reject — that
 * stays with Command/Insurance operators) with the briefing pushed front
 * and center, matching an executive reader's actual job: skim, decide,
 * move on. */
export type Persona = "command" | "insurance" | "field" | "executive";

export interface MockUser {
  name: string;
  email: string;
  org: string;
  workspace: Persona;
}

export interface EventBundle {
  event_id: string;
  label: string;
  city: CityKey;
  city_label: string;
  polygon: [number, number][]; // [lon, lat] closed ring
  window_start: string;
  window_end: string;
  evidence_mode: "replay" | "live";
  created_at: string;
  items: EvidenceItem[];
  field_image_path: string | null;
  red_team_injected: boolean;
}

export type GateStatus = "passed" | "blocked" | "degraded";

export type GateName = "evidence_verifier" | "confidence_gate" | "openshell_supervisor" | "policy_verifier";

export interface EvidenceVerifierDetails {
  sources_present: string[];
  stale_items: string[];
  out_of_area_items: string[];
  freshness_score: number;
  agreement_score: number;
  source_score: number;
}

export interface DamageEvidence {
  flooding_observed: boolean;
  estimated_water_depth_ft: number | null;
  structural_damage_observed: boolean;
  road_blocked: boolean;
  visible_hazards: string[];
  confidence: number;
  narrative: string;
}

export interface OpenshellSupervisorDetails {
  sandboxed?: boolean;
  vision_harness?: "deepagents" | "openshell_sandbox" | "direct_nim_call";
  damage_evidence?: DamageEvidence;
}

export interface PolicyVerifierDetails {
  violations?: string[];
  degraded_upstream?: string[];
}

export interface GateResult {
  gate_name: string;
  status: GateStatus;
  confidence: number;
  reasoning: string;
  evidence_used: string[];
  details: EvidenceVerifierDetails | OpenshellSupervisorDetails | PolicyVerifierDetails | Record<string, never>;
  ran_at: string;
  relay_scope_id: string | null;
}

export interface LifeSafetyGuidance {
  headline: string;
  guidance_points: string[];
  hazard_narrative: string;
  confidence: number;
  citing_evidence: string[];
  reasoning_effort: "low" | "high";
  model_used: string;
  agent_harness: "deepagents" | "direct";
}

export interface InsurerExposureLine {
  policy_id: string;
  latitude: number;
  longitude: number;
  total_insured_value: number;
  coverage_limit: number;
  deductible: number;
  estimated_damage_ratio: number;
  gross_loss_estimate: number;
  net_of_deductible: number;
  capped_at_limit: number;
}

export interface InsurerExposureOutput {
  total_policies_in_footprint: number;
  total_tiv_in_footprint: number;
  total_estimated_exposure: number;
  lines: InsurerExposureLine[];
  methodology: string;
  confidence: number;
  citing_evidence: string[];
  narrative: string;
  agent_harness: "deepagents" | "direct";
}

export interface EvacuationRouteLeg {
  shelter_item_id: string;
  shelter_name: string;
  shelter_latitude: number;
  shelter_longitude: number;
  distance_km: number;
  duration_min: number;
  route_geometry: [number, number][]; // [lon, lat]
  routed_live: boolean;
  closure_warnings: string[];
}

export interface EvacuationPlan {
  origin_latitude: number;
  origin_longitude: number;
  origin_basis: string;
  routes: EvacuationRouteLeg[];
  methodology: string;
  confidence: number;
  citing_evidence: string[];
  narrative: string;
  agent_harness: "deepagents" | "direct";
}

export type OverallStatus = "blocked" | "awaiting_approval" | "approved" | "rejected";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "not_required";

export interface CounterfactualAnalysis {
  narrative: string;
  model_used: string;
  generated_at: string;
}

export interface ForecastHorizon {
  label: "+6h" | "+12h" | "+24h";
  narrative: string;
}

/** Forward-looking projection — the app's answer to "where is this going,"
 * not just "where is this now." `trend_basis` is deterministic (real
 * rate-of-change arithmetic over USGS gauge readings); the model only
 * narrates the implication of that trend at each horizon. Null when no
 * gauge had a usable multi-point trend for this event. */
export interface ForwardRiskForecast {
  trend_basis: string[];
  horizons: ForecastHorizon[];
  model_used: string;
  generated_at: string;
}

/** An alert the system raised on its own — a background trend scan
 * crossing a threshold, not a request the user made. See
 * decision/proactive_monitor.py. */
export interface ProactiveAlert {
  event_id: string;
  city_label: string;
  headline: string;
  narrative: string;
  severity: "watch" | "warning";
  model_used: string;
  triggered_at: string;
}

/** A short brief generated for the person about to click Approve/Reject —
 * distinct from the Executive Briefing, which is for a reader who wasn't
 * watching the run at all. */
export interface DecisionBrief {
  event_id: string;
  summary: string;
  model_used: string;
  generated_at: string;
}

/** Resource Dispatch Priority — one shelter's ranking for "which shelter
 * should a duty officer staff/resupply FIRST," distinct from the
 * Evacuation Plan's nearest-first routing. capacity_illustrative is a
 * named, documented assumption (see backend/app/decision/
 * resource_dispatch.py), never presented as a measured figure. */
export interface ShelterDispatchPriority {
  shelter_item_id: string;
  shelter_name: string;
  distance_km: number;
  capacity_illustrative: number;
  priority_score: number;
  rank: number;
}

export interface ResourceDispatchPlan {
  event_id: string;
  shelters: ShelterDispatchPriority[];
  methodology: string;
  generated_at: string;
}

/** Deterministic parametric (index-insurance) trigger evaluation over the
 * same real USGS gauge rate-of-rise the Forward Risk Forecast computes.
 * Tiers/payouts are illustrative — no real parametric contract exists yet;
 * peak_rate and basis are real, measured numbers. */
export interface ParametricTriggerResult {
  event_id: string;
  triggered: boolean;
  tier: string | null;
  peak_rate: number;
  basis: string[];
  payout_pct_illustrative: number | null;
  generated_at: string;
}

export type AlertTier = "watch" | "warning" | "emergency";

export interface EventRunResult {
  event: EventBundle;
  gates: GateResult[];
  life_safety: LifeSafetyGuidance | null;
  insurer_exposure: InsurerExposureOutput | null;
  evacuation_plan: EvacuationPlan | null;
  counterfactual: CounterfactualAnalysis | null;
  forward_risk_forecast: ForwardRiskForecast | null;
  resource_dispatch: ResourceDispatchPlan | null;
  parametric_trigger: ParametricTriggerResult | null;
  alert_tier: AlertTier;
  overall_status: OverallStatus;
  approval_status: ApprovalStatus;
  approval_note: string | null;
}

export interface SmsStatus {
  configured: boolean;
  to_number_masked: string | null;
  from_number_masked: string | null;
  guardrails_enabled: boolean;
}

export interface SmsSendResult {
  sent: boolean;
  reason: string | null;
  detail: string | null;
  to_number_masked: string | null;
  provider_sid: string | null;
}

export interface SmsLanguage {
  code: string;
  name: string;
}

export interface SmsDraftResult {
  message: string;
  model_used: string;
  language: string;
}

export interface AssistantCitation {
  doc_id: string;
  title: string;
  score: number;
}

export interface AssistantAnswer {
  answer: string;
  model_used: string;
  citations: AssistantCitation[];
  grounded_in_current_event: boolean;
  /** True when NeMo Guardrails blocked the question before it reached the
   * model — distinct from a plain "model unavailable" fallback. */
  blocked: boolean;
}

export interface RuntimeConfig {
  evidence_mode: "replay" | "live";
  runtime_target: "dev" | "prod" | "auto";
  relay_enabled: boolean;
  openshell_enabled: boolean;
  confidence_gate_min: number;
  require_human_approval: boolean;
  hide_passed_gates: boolean;
}

export interface RelayStatus {
  enabled: boolean;
  export_path: string;
  exists: boolean;
  record_count: number;
}

export interface RelayMetricMeasurement {
  name: string;
  kind: string;
  value: number;
  value_type: string;
  unit: string | null;
}

export interface RelayRecord {
  atof_version: string;
  category: string | null;
  kind: string; // "scope" (start/end span) | "mark" (a point-in-time event, e.g. token usage)
  name: string;
  metadata: Record<string, unknown> | null;
  parent_uuid: string | null;
  scope_category?: string; // "start" | "end" — only present on kind: "scope" records
  data?: { measurements?: RelayMetricMeasurement[] } | null;
  data_schema?: { name: string; version: string } | null;
  timestamp: string;
  uuid: string;
  [key: string]: unknown;
}

// SSE progress event payloads (backend/app/routers/events.py: /replay/stream)
export type ProgressStage =
  | "evidence_assembled"
  | "gate"
  | "outputs_ready"
  | "counterfactual_ready"
  | "forecast_ready"
  | "complete";

export interface ProgressSourceFetching {
  source: string;
  status: "started" | "done" | "failed";
  item_count?: number;
}
export interface ProgressEvidenceAssembled {
  event: EventBundle;
}
export interface ProgressGate {
  gate: GateResult;
}
export interface ProgressOutputsReady {
  life_safety: LifeSafetyGuidance | null;
  insurer_exposure: InsurerExposureOutput | null;
  evacuation_plan: EvacuationPlan | null;
}
export interface ProgressCounterfactualReady {
  counterfactual: CounterfactualAnalysis;
}
export interface ProgressForecastReady {
  forecast: ForwardRiskForecast | null;
}
export interface ProgressComplete {
  result: EventRunResult;
}

export interface EvalAssertion {
  name: string;
  expected: string;
  actual: string;
  passed: boolean;
}

export interface EvalCaseResult {
  case_id: string;
  label: string;
  city: string;
  passed: boolean;
  overall_status: string;
  confidence: number | null;
  latency_ms: number;
  assertions: EvalAssertion[];
  error: string | null;
}

export interface BriefingResult {
  event_id: string;
  briefing: string;
  model_used: string;
  generated_at: string;
}

export interface EvalSuiteResult {
  run_at: string;
  total_cases: number;
  passed_count: number;
  failed_count: number;
  avg_latency_ms: number;
  cases: EvalCaseResult[];
}

export interface RetrievalCase {
  question: string;
  expected_doc_ids: string[];
}

export interface NemoEvalSample {
  input_label: string;
  scores: Record<string, number>;
  detail: string | null;
}

export interface NemoEvalBenchmark {
  name: string;
  metric: string;
  description: string;
  sample_count: number;
  aggregate: Record<string, number>;
  samples: NemoEvalSample[];
  latency_ms: number;
}

export interface NemoEvalReport {
  run_at: string;
  engine: string;
  engine_version: string;
  benchmarks: NemoEvalBenchmark[];
}

// ---------------------------------------------------------------------------
// Government + Insurance feature set (Product Owner review)
// ---------------------------------------------------------------------------

/** A CAP 1.2 (OASIS Common Alerting Protocol) XML package — only ever
 * generated for an APPROVED run; every field is a reformatting of a value
 * this pipeline already produced and a human already approved. */
export interface CapAlertResult {
  event_id: string;
  cap_xml: string;
  alert_tier: AlertTier;
  generated_at: string;
}

export interface AfterActionReportResult {
  event_id: string;
  report_text: string;
  model_used: string;
  generated_at: string;
}

export interface FnolDraft {
  event_id: string;
  policy_id: string;
  incident_description: string;
  estimated_loss: number;
  net_of_deductible: number;
  capped_at_limit: number;
  status: "draft_pending_review";
  model_used: string;
  generated_at: string;
}

export interface PortfolioPmlResult {
  total_events: number;
  aggregate_estimated_exposure: number;
  aggregate_tiv: number;
  by_city: Record<string, number>;
  by_status: Record<string, number>;
  generated_at: string;
}
