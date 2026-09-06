"""
Gate 4 — Policy Verifier.

The last gate before decision-output synthesis. Deterministic rule checks,
not model judgment: matches the deck's "Insurer policy and claims data is
sensitive... compute exposure without sending raw customer records to
agents." This gate verifies that guarantee held for this specific run, and
that the upstream gates actually passed before anything is allowed through.
"""
from __future__ import annotations

from app.config import Settings
from app.models.schemas import EventBundle, GateResult, GateStatus
from app.nvidia_runtime.relay_governance import governed_scope, scope_id


def verify_policy(bundle: EventBundle, upstream_gates: list[GateResult], settings: Settings) -> GateResult:
    with governed_scope(
        "policy_verifier", "Guardrail",
        metadata={"event_id": bundle.event_id, "upstream_gate_count": len(upstream_gates)},
    ) as handle:
        blocked_upstream = [g.gate_name for g in upstream_gates if g.status == GateStatus.BLOCKED]

        pii_fields_seen = _scan_for_pii(bundle)

        violations: list[str] = []
        if blocked_upstream:
            violations.append(f"Upstream gate(s) blocked: {', '.join(blocked_upstream)}")
        if pii_fields_seen:
            violations.append(f"Evidence bundle contains disallowed identifier-shaped fields: {pii_fields_seen}")

        if violations:
            return GateResult(
                gate_name="policy_verifier",
                status=GateStatus.BLOCKED,
                confidence=0.0,
                reasoning="; ".join(violations),
                details={"violations": violations},
                relay_scope_id=scope_id(handle),
            )

        degraded_upstream = [g.gate_name for g in upstream_gates if g.status == GateStatus.DEGRADED]
        status = GateStatus.DEGRADED if degraded_upstream else GateStatus.PASSED
        reasoning = (
            f"No policy violations found. Degraded upstream gates: {degraded_upstream or 'none'}."
            if degraded_upstream
            else "No policy violations found; all upstream gates passed cleanly."
        )
        return GateResult(
            gate_name="policy_verifier",
            status=status,
            confidence=1.0,
            reasoning=reasoning,
            details={"degraded_upstream": degraded_upstream},
            relay_scope_id=scope_id(handle),
        )


_DISALLOWED_KEYS = {"ssn", "social_security", "policyholder_name", "phone_number", "email", "date_of_birth", "account_number"}


def _scan_for_pii(bundle: EventBundle) -> list[str]:
    """Shallow key-name scan across raw evidence payloads. This is a floor,
    not a ceiling — the real privacy boundary is that adapters only ever
    fetch public hazard/infrastructure data, never customer records."""
    hits: set[str] = set()
    for item in bundle.items:
        for key in _flatten_keys(item.raw):
            if key.lower() in _DISALLOWED_KEYS:
                hits.add(key)
    return sorted(hits)


def _flatten_keys(obj, prefix: str = "") -> list[str]:
    keys: list[str] = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            keys.append(k)
            keys.extend(_flatten_keys(v, f"{prefix}.{k}"))
    elif isinstance(obj, list):
        for v in obj:
            keys.extend(_flatten_keys(v, prefix))
    return keys
