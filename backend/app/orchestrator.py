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
from datetime import timedelta
from typing import Any, Awaitable, Callable, Optional

from app.agents.confidence_gate import check_confidence
from app.agents.evacuation_agent import run_evacuation_agent
from app.agents.evidence_verifier import HAZARD_SOURCES, verify_evidence
from app.agents.exposure_agent import run_exposure_agent
from app.agents.openshell_supervisor import run_openshell_supervisor
from app.agents.policy_verifier import verify_policy
from app.config import Settings
from app.decision.counterfactual import generate_counterfactual
from app.decision.evacuation import compute_evacuation_plan
from app.decision.insurer_exposure import compute_insurer_exposure
from app.decision.life_safety import synthesize_life_safety_guidance
from app.evidence.builder import build_event_bundle
from app.models.schemas import ApprovalStatus, EventBundle, EventRunResult, EvidenceSource, GateResult, GateStatus
from app.nvidia_runtime.relay_governance import governed_scope

logger = logging.getLogger("lifeshield.orchestrator")

# (stage_name, payload) -> None. Payload shapes: "evidence_assembled" carries
# {"event": EventBundle}; "gate" carries {"gate": GateResult}; "outputs_ready"
# carries {"life_safety": ..., "insurer_exposure": ...}; "complete" carries
# {"result": EventRunResult}. Purely additive instrumentation hook — when
# None (the default, and always the case for POST /replay), behavior and
# timing are byte-for-byte identical to before this hook existed.
ProgressCallback = Callable[[str, dict[str, Any]], Awaitable[None]]


async def _emit(on_progress: Optional[ProgressCallback], stage: str, payload: dict[str, Any]) -> None:
    if on_progress is not None:
        await on_progress(stage, payload)


async def run_event_pipeline(
    settings: Settings,
    *,
    label: str,
    city: str = "houston",
    evidence_mode: str | None = None,
    inject_contradiction: bool = False,
    on_progress: Optional[ProgressCallback] = None,
) -> EventRunResult:
    """Run the pipeline. ``evidence_mode`` ('replay' or 'live'), when given,
    overrides the server-default settings.evidence_mode for this call only:
    a per-request copy is made so concurrent requests never race on the
    shared Settings singleton. ``on_progress``, when given, is awaited after
    each pipeline stage so a caller (e.g. an SSE route) can stream progress;
    it never changes what is returned. ``inject_contradiction`` is the
    'Simulate Contradiction' red-team demo path — see
    _apply_red_team_contradiction."""
    if evidence_mode is not None and evidence_mode != settings.evidence_mode:
        settings = settings.model_copy(update={"evidence_mode": evidence_mode})
    bundle = await build_event_bundle(settings, label=label, city=city)
    if inject_contradiction:
        bundle = _apply_red_team_contradiction(bundle)
    await _emit(on_progress, "evidence_assembled", {"event": bundle})

    with governed_scope("lifeshield_event_pipeline", "Agent", metadata={"event_id": bundle.event_id, "label": label}):
        gates: list[GateResult] = []

        evidence_gate = verify_evidence(bundle, settings)
        gates.append(evidence_gate)
        await _emit(on_progress, "gate", {"gate": evidence_gate})

        confidence_result = check_confidence(evidence_gate, settings)
        gates.append(confidence_result)
        await _emit(on_progress, "gate", {"gate": confidence_result})

        if confidence_result.status == GateStatus.BLOCKED:
            logger.info("Event %s blocked at confidence gate: %s", bundle.event_id, confidence_result.reasoning)
            result = EventRunResult(event=bundle, gates=gates, overall_status="blocked", approval_status=ApprovalStatus.NOT_REQUIRED)
            await _emit(on_progress, "complete", {"result": result})
            return result

        openshell_gate, vision_evidence = await run_openshell_supervisor(bundle, settings)
        gates.append(openshell_gate)
        await _emit(on_progress, "gate", {"gate": openshell_gate})

        policy_gate = verify_policy(bundle, gates, settings)
        gates.append(policy_gate)
        await _emit(on_progress, "gate", {"gate": policy_gate})

        if policy_gate.status == GateStatus.BLOCKED:
            logger.info("Event %s blocked at policy verifier: %s", bundle.event_id, policy_gate.reasoning)
            result = EventRunResult(event=bundle, gates=gates, overall_status="blocked", approval_status=ApprovalStatus.NOT_REQUIRED)
            await _emit(on_progress, "complete", {"result": result})
            return result

        overall_confidence = min(g.confidence for g in gates)

        # Sequential, not asyncio.gather: verified that concurrently-open
        # NeMo Relay scopes on separate tasks corrupt the shared native scope
        # stack ("invalid argument: scope handle is not at the top of the
        # stack") once more than one of these does real async work under its
        # own governed_scope — true the moment all three could attempt a
        # DeepAgents call. Relay's scope() does accept an explicit parent
        # `handle=`, which might allow safe concurrency, but the native
        # (Rust-backed) push/pop stack's behavior under concurrent handles
        # isn't documented clearly enough to trust for a live demo; a few
        # extra seconds of latency is a better trade than a 500 on some
        # fraction of runs.
        life_safety = await synthesize_life_safety_guidance(bundle, gates, vision_evidence, settings)
        insurer_exposure = await _compute_exposure_async(bundle, vision_evidence, overall_confidence, settings)
        evacuation_plan = await _compute_evacuation_async(bundle, settings, overall_confidence)
        await _emit(
            on_progress,
            "outputs_ready",
            {"life_safety": life_safety, "insurer_exposure": insurer_exposure, "evacuation_plan": evacuation_plan},
        )

        counterfactual = await generate_counterfactual(
            bundle, gates, life_safety, insurer_exposure, evacuation_plan, settings
        )
        await _emit(on_progress, "counterfactual_ready", {"counterfactual": counterfactual})

        result = EventRunResult(
            event=bundle,
            gates=gates,
            life_safety=life_safety,
            evacuation_plan=evacuation_plan,
            insurer_exposure=insurer_exposure,
            counterfactual=counterfactual,
            overall_status="awaiting_approval" if settings.require_human_approval else "approved",
            approval_status=ApprovalStatus.PENDING if settings.require_human_approval else ApprovalStatus.NOT_REQUIRED,
        )
        await _emit(on_progress, "complete", {"result": result})
        return result


def _apply_red_team_contradiction(bundle: EventBundle) -> EventBundle:
    """'Simulate Contradiction' demo path: keeps only the NWS hazard items
    (simulating USGS, HCFCD, TranStar and FEMA feeds going silent mid-event)
    and backdates the surviving reading past the staleness window. This is
    the ONLY place evidence is ever deliberately altered in this app — the
    mutated bundle is then run through the exact same unmodified
    evidence_verifier/confidence_gate math as any real event, so the
    resulting BLOCKED status and collapsed confidence score are genuine gate
    output, not a scripted UI state. Non-hazard sources (population_svi,
    osm_shelter) are left untouched since they aren't part of the
    "independent sources agree" count in the first place."""
    kept_source = EvidenceSource.NWS
    stale_cutoff = timedelta(hours=6)
    new_items = []
    for item in bundle.items:
        if item.source in HAZARD_SOURCES and item.source != kept_source:
            continue
        if item.source == kept_source:
            item = item.model_copy(update={"is_replay": False, "observed_at": item.observed_at - stale_cutoff})
        new_items.append(item)
    return bundle.model_copy(update={"items": new_items, "red_team_injected": True})


async def _compute_exposure_async(bundle, vision_evidence, confidence, settings):
    # Exposure Agent (DeepAgents) attempted first — matches the architecture
    # diagram's "04 Insurance / Exposure Agent". Its only tool IS
    # compute_insurer_exposure(), so every numeric field is still that
    # deterministic math regardless of which branch runs; the agent only
    # adds a narrative. Falls back to calling the math directly on any
    # DeepAgents failure — see vision_specialist.py's module docstring for
    # the verified multi-tool-binding failure mode on this NIM account.
    with governed_scope("insurer_exposure_calc", "Agent", metadata={"event_id": bundle.event_id}):
        try:
            return await run_exposure_agent(bundle, vision_evidence, confidence, settings)
        except Exception as exc:  # noqa: BLE001 - DeepAgents harness failure -> fall back to deterministic math directly
            logger.warning("Exposure Agent failed (%s); falling back to direct calculation.", exc)
            return compute_insurer_exposure(bundle, vision_evidence, confidence)


async def _compute_evacuation_async(bundle, settings, confidence):
    # Evacuation Planner Agent (DeepAgents) attempted first — matches the
    # architecture diagram's "03 Response / Evacuation Planner". Its only
    # tool IS compute_evacuation_plan(), so every route/distance/duration is
    # still that OSRM-backed math regardless of which branch runs. Falls
    # back to calling it directly on any DeepAgents failure.
    with governed_scope("evacuation_plan_calc", "Agent", metadata={"event_id": bundle.event_id}):
        try:
            return await run_evacuation_agent(bundle, settings, confidence=confidence)
        except Exception as exc:  # noqa: BLE001 - DeepAgents harness failure -> fall back to deterministic routing directly
            logger.warning("Evacuation Agent failed (%s); falling back to direct calculation.", exc)
            return await compute_evacuation_plan(bundle, settings, confidence=confidence)
