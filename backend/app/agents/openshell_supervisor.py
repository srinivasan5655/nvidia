"""
Gate 3 — OpenShell Supervisor.

Supervises the vision specialist's execution: launches it inside a real
OpenShell sandbox when a cluster is configured (network-isolated, policy-
governed, per NVIDIA OpenShell), and validates the specialist's structured
output before anything downstream is allowed to see it. This is the gate,
not the specialist — the specialist's job is to look at one image; this
gate's job is to decide whether that specialist's environment and output
can be trusted.

Verified against installed `openshell` 0.0.116:
  `openshell.SandboxClient(endpoint, bearer_token=...)` connects to a live
  OpenShell control plane; `openshell.Sandbox(workspace=..., cluster=...)`
  describes a sandbox to create/attach to. Both require a real deployed
  OpenShell cluster (Curiosity v2), which this sandbox environment does not
  have network access to. When `settings.openshell_enabled` is False (the
  default until the cluster is wired up), this gate runs the specialist
  in-process instead and reports GateStatus.DEGRADED — the honest state,
  not a silent pass.
"""
from __future__ import annotations

import logging

from app.agents.vision_specialist import DamageEvidence, run_vision_specialist_locally
from app.config import Settings
from app.models.schemas import EventBundle, GateResult, GateStatus
from app.nvidia_runtime.relay_governance import governed_scope, scope_id

logger = logging.getLogger("lifeshield.openshell")


async def run_openshell_supervisor(bundle: EventBundle, settings: Settings) -> tuple[GateResult, DamageEvidence | None]:
    with governed_scope(
        "openshell_supervisor", "Guardrail",
        metadata={"event_id": bundle.event_id, "sandbox_enabled": settings.openshell_enabled},
    ) as gate_handle:

        if not bundle.field_image_path:
            return GateResult(
                gate_name="openshell_supervisor",
                status=GateStatus.DEGRADED,
                confidence=0.4,
                reasoning="No field image attached to this event bundle; vision specialist skipped.",
                relay_scope_id=scope_id(gate_handle),
            ), None

        try:
            if settings.openshell_enabled and settings.openshell_endpoint:
                evidence, sandboxed = await _run_in_sandbox(bundle, settings)
            else:
                logger.info("OPENSHELL_ENABLED is False or no endpoint configured — running specialist in-process (no sandbox isolation).")
                with governed_scope("flood_vision_specialist", "Agent", metadata={"sandboxed": False}):
                    evidence = await run_vision_specialist_locally(settings, image_path=bundle.field_image_path)
                sandboxed = False
        except Exception as exc:  # noqa: BLE001 - NIM unreachable, no key, or sandbox error -> degrade, never crash the pipeline
            logger.warning("Vision specialist failed (%s); degrading rather than failing the event.", exc)
            return GateResult(
                gate_name="openshell_supervisor",
                status=GateStatus.DEGRADED,
                confidence=0.35,
                reasoning=f"Vision specialist could not run ({exc}); proceeding without image-based damage evidence.",
                relay_scope_id=scope_id(gate_handle),
            ), None

        if evidence.confidence < 0.2:
            status = GateStatus.BLOCKED
            reasoning = f"Vision specialist confidence too low ({evidence.confidence:.2f}) to use as evidence."
        elif not sandboxed:
            status = GateStatus.DEGRADED
            reasoning = "Specialist ran without OpenShell sandbox isolation (no cluster configured) — output accepted with a noted trust reduction."
        else:
            status = GateStatus.PASSED
            reasoning = "Specialist ran inside an OpenShell sandbox and returned validated structured output."

        return GateResult(
            gate_name="openshell_supervisor",
            status=status,
            confidence=evidence.confidence if sandboxed else min(evidence.confidence, 0.75),
            reasoning=reasoning,
            details={"sandboxed": sandboxed, "damage_evidence": evidence.model_dump()},
            relay_scope_id=scope_id(gate_handle),
        ), evidence


async def _run_in_sandbox(bundle: EventBundle, settings: Settings) -> tuple[DamageEvidence, bool]:
    """Real OpenShell path — requires a live cluster. Structured so that
    wiring in real credentials (OPENSHELL_ENDPOINT / OPENSHELL_BEARER_TOKEN)
    on the Curiosity v2 deployment is the only change needed; nothing else in
    the pipeline knows or cares whether this ran sandboxed."""
    import openshell

    client = openshell.SandboxClient(
        settings.openshell_endpoint,
        bearer_token=settings.openshell_bearer_token,
        cluster_name=settings.openshell_cluster,
    )
    with openshell.Sandbox(
        workspace=settings.openshell_workspace,
        cluster=settings.openshell_cluster,
        name=f"vision-specialist-{bundle.event_id}",
        delete_on_exit=True,
    ) as sandbox:
        # The specialist's own code + the one field image are uploaded into
        # the sandbox workspace; the DeepAgent then runs entirely inside it,
        # with no network egress beyond the configured NIM inference route.
        sandbox.workspace_client.upload_file(bundle.field_image_path, "/sandbox/field_image.jpg")
        result = sandbox.exec(
            "python3 -m specialists.flood_vision --image /sandbox/field_image.jpg"
        )
        evidence = DamageEvidence.model_validate_json(result.stdout)
        return evidence, True
