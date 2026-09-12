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

import hashlib
import logging
from pathlib import Path

from app.agents.vision_specialist import (
    DamageEvidence,
    run_vision_specialist_locally,
    run_vision_specialist_via_deepagent,
)
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

        vision_harness = "deepagents"
        try:
            if settings.openshell_enabled and settings.openshell_endpoint:
                evidence, sandboxed = await _run_in_sandbox(bundle, settings)
                vision_harness = "openshell_sandbox"
            else:
                logger.info("OPENSHELL_ENABLED is False or no endpoint configured — running specialist in-process (no sandbox isolation).")
                # Metadata is fixed at scope-open time, before we know which
                # path actually produced the result — so it only records
                # "attempted", not "succeeded". The gate's own
                # details.vision_harness (set below, after we know) is the
                # reliable field; don't infer harness from this scope alone.
                with governed_scope("flood_vision_specialist", "Agent", metadata={"sandboxed": False, "harness_attempted": "deepagents"}):
                    try:
                        evidence = await run_vision_specialist_via_deepagent(settings, image_path=bundle.field_image_path)
                    except Exception as exc:  # noqa: BLE001 - structured-output binding can fail on a given model; fall back, don't crash the gate
                        logger.warning(
                            "DeepAgents vision specialist failed (%s); falling back to the direct NIM call path.", exc
                        )
                        evidence = await run_vision_specialist_locally(settings, image_path=bundle.field_image_path)
                        vision_harness = "direct_nim_call"
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
            details={"sandboxed": sandboxed, "vision_harness": vision_harness, "damage_evidence": evidence.model_dump()},
            relay_scope_id=scope_id(gate_handle),
        ), evidence


async def _run_in_sandbox(bundle: EventBundle, settings: Settings) -> tuple[DamageEvidence, bool]:
    """Real OpenShell path. Creates a live sandbox on the configured OpenShell
    gateway/cluster (``settings.openshell_cluster`` resolves the same
    ~/.config/openshell/gateways/<cluster>/ mTLS metadata the CLI uses - no
    endpoint/bearer plumbing needed), uploads the field image plus the
    dependency-free flood_vision specialist module into it, and runs the
    specialist fully isolated inside the sandbox. Raises on any OpenShell
    failure; the caller (``run_openshell_supervisor``) degrades rather than
    crashing the event pipeline.
    """
    import openshell
    from openshell._proto import openshell_pb2

    from app.specialists import flood_vision as specialist_module

    spec = openshell_pb2.SandboxSpec(
        template=openshell_pb2.SandboxTemplate(image=settings.openshell_sandbox_image),
    )
    # Sandbox names are capped at 19 chars by the gateway; hash the event id
    # down to a short, still-collision-resistant suffix.
    sandbox_name = "vis-" + hashlib.sha1(bundle.event_id.encode()).hexdigest()[:12]

    with openshell.Sandbox(
        workspace=settings.openshell_workspace,
        cluster=settings.openshell_cluster,
        name=sandbox_name,
        delete_on_exit=True,
        spec=spec,
    ) as sandbox:
        setup = sandbox.exec(
            ["bash", "-lc", "mkdir -p /sandbox/specialists && touch /sandbox/specialists/__init__.py"]
        )
        if setup.exit_code != 0:
            raise RuntimeError(f"OpenShell sandbox setup failed: {setup.stderr}")

        image_bytes = Path(bundle.field_image_path).read_bytes()
        upload_image = sandbox.exec(
            ["bash", "-lc", "cat > /sandbox/field_image.jpg"], stdin=image_bytes
        )
        if upload_image.exit_code != 0:
            raise RuntimeError(f"OpenShell field image upload failed: {upload_image.stderr}")

        specialist_bytes = Path(specialist_module.__file__).read_bytes()
        upload_specialist = sandbox.exec(
            ["bash", "-lc", "cat > /sandbox/specialists/flood_vision.py"], stdin=specialist_bytes
        )
        if upload_specialist.exit_code != 0:
            raise RuntimeError(f"OpenShell specialist upload failed: {upload_specialist.stderr}")

        # The specialist's own code + the one field image are uploaded into
        # the sandbox workspace; it then runs entirely inside it, with no
        # network egress beyond whatever the sandbox's policy allows.
        result = sandbox.exec(
            ["python3", "-m", "specialists.flood_vision", "--image", "/sandbox/field_image.jpg"],
            workdir="/sandbox",
        )
        if result.exit_code != 0:
            raise RuntimeError(f"OpenShell specialist exited {result.exit_code}: {result.stderr}")

        evidence = DamageEvidence.model_validate_json(result.stdout)
        return evidence, True
