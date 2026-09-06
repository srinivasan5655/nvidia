"""
Gate 2 — Confidence Gate.

Deterministic threshold check on the Evidence Verifier's output. This is the
single place that decides whether the pipeline is even allowed to spend a
NIM call on this event. Blocking here is cheap and fast; it's what lets the
demo show "a blocked low-confidence case returning an evidence gap" (deck,
slide 6) without touching any model.
"""
from __future__ import annotations

from app.config import Settings
from app.models.schemas import GateResult, GateStatus
from app.nvidia_runtime.relay_governance import governed_scope, scope_id


def check_confidence(evidence_gate: GateResult, settings: Settings) -> GateResult:
    with governed_scope(
        "confidence_gate", "Guardrail",
        metadata={"evidence_confidence": evidence_gate.confidence, "threshold": settings.confidence_gate_min},
    ) as handle:
        if evidence_gate.status == GateStatus.BLOCKED:
            return GateResult(
                gate_name="confidence_gate",
                status=GateStatus.BLOCKED,
                confidence=evidence_gate.confidence,
                reasoning="Evidence verifier already blocked this event; confidence gate cannot override a block.",
                evidence_used=evidence_gate.evidence_used,
                relay_scope_id=scope_id(handle),
            )

        if evidence_gate.confidence < settings.confidence_gate_min:
            return GateResult(
                gate_name="confidence_gate",
                status=GateStatus.BLOCKED,
                confidence=evidence_gate.confidence,
                reasoning=(
                    f"Evidence confidence {evidence_gate.confidence:.2f} is below the "
                    f"{settings.confidence_gate_min:.2f} minimum required to run specialists. "
                    f"Returning an evidence gap instead of a low-confidence answer."
                ),
                evidence_used=evidence_gate.evidence_used,
                relay_scope_id=scope_id(handle),
            )

        status = GateStatus.PASSED if evidence_gate.status == GateStatus.PASSED else GateStatus.DEGRADED
        return GateResult(
            gate_name="confidence_gate",
            status=status,
            confidence=evidence_gate.confidence,
            reasoning=f"Confidence {evidence_gate.confidence:.2f} clears the {settings.confidence_gate_min:.2f} minimum; specialists may run.",
            evidence_used=evidence_gate.evidence_used,
            relay_scope_id=scope_id(handle),
        )
