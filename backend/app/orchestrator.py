"""
Orchestrator — the one path described on slide 3 of the deck:

  Evidence Layer -> NVIDIA Runtime (implicit, inside every gate/specialist call)
    -> Decision Gates (evidence_verifier -> confidence_gate -> openshell_supervisor -> policy_verifier)
    -> Decision Outputs (life_safety, insurer_exposure, run in parallel)
    -> human approval

Every stage is wrapped in its own NeMo Relay scope; the orchestrator itself
runs inside a top-level Agent scope so the whole event is one traceable tree
in the exported .atof file.
"""
from __future__ import annotations

import asyncio
import logging

from app.agents.confidence_gate import check_confidence
from app.agents.evidence_verifier import verify_evidence
from app.agents.openshell_supervisor import run_openshell_supervisor
from app.agents.policy_verifier import verify_policy
from app.config import Settings
from app.decision.insurer_exposure import compute_insurer_exposure
from app.decision.life_safety import synthesize_life_safety_guidance
from app.evidence.builder import build_event_bundle
from app.models.schemas import ApprovalStatus, EventRunResult, GateStatus
from app.nvidia_runtime.relay_governance import governed_scope

logger = logging.getLogger("lifeshield.orchestrator")


async def run_event_pipeline(settings: Settings, *, label: str) -> EventRunResult:
    bundle = await build_event_bundle(settings, label=label)

    with governed_scope("lifeshield_event_pipeline", "Agent", metadata={"event_id": bundle.event_id, "label": label}):
        gates = []

        evidence_gate = verify_evidence(bundle, settings)
        gates.append(evidence_gate)

        confidence_result = check_confidence(evidence_gate, settings)
        gates.append(confidence_result)

        if confidence_result.status == GateStatus.BLOCKED:
            logger.info("Event %s blocked at confidence gate: %s", bundle.event_id, confidence_result.reasoning)
            return EventRunResult(event=bundle, gates=gates, overall_status="blocked", approval_status=ApprovalStatus.NOT_REQUIRED)

        openshell_gate, vision_evidence = await run_openshell_supervisor(bundle, settings)
        gates.append(openshell_gate)

        policy_gate = verify_policy(bundle, gates, settings)
        gates.append(policy_gate)

        if policy_gate.status == GateStatus.BLOCKED:
            logger.info("Event %s blocked at policy verifier: %s", bundle.event_id, policy_gate.reasoning)
            return EventRunResult(event=bundle, gates=gates, overall_status="blocked", approval_status=ApprovalStatus.NOT_REQUIRED)

        overall_confidence = min(g.confidence for g in gates)

        life_safety, insurer_exposure = await asyncio.gather(
            synthesize_life_safety_guidance(bundle, gates, vision_evidence, settings),
            _compute_exposure_async(bundle, vision_evidence, overall_confidence),
        )

        result = EventRunResult(
            event=bundle,
            gates=gates,
            life_safety=life_safety,
            insurer_exposure=insurer_exposure,
            overall_status="awaiting_approval" if settings.require_human_approval else "approved",
            approval_status=ApprovalStatus.PENDING if settings.require_human_approval else ApprovalStatus.NOT_REQUIRED,
        )
        return result


async def _compute_exposure_async(bundle, vision_evidence, confidence):
    # insurer_exposure math is synchronous/deterministic; wrapped so it can
    # run concurrently with the life-safety LLM call via asyncio.gather.
    with governed_scope("insurer_exposure_calc", "Tool", metadata={"event_id": bundle.event_id}):
        return compute_insurer_exposure(bundle, vision_evidence, confidence)
