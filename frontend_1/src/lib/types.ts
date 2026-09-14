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

export interface EventRunResult {
  event: EventBundle;
  gates: GateResult[];
  life_safety: LifeSafetyGuidance | null;
  insurer_exposure: InsurerExposureOutput | null;
  evacuation_plan: EvacuationPlan | null;
  counterfactual: CounterfactualAnalysis | null;
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
}

export interface RuntimeConfig {
  evidence_mode: "replay" | "live";
  runtime_target: "dev" | "prod" | "auto";
  relay_enabled: boolean;
  openshell_enabled: boolean;
  confidence_gate_min: number;
  require_human_approval: boolean;
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
export type ProgressStage = "evidence_assembled" | "gate" | "outputs_ready" | "counterfactual_ready" | "complete";

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

export interface EvalSuiteResult {
  run_at: string;
  total_cases: number;
  passed_count: number;
  failed_count: number;
  avg_latency_ms: number;
  cases: EvalCaseResult[];
}
