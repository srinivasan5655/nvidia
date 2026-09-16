"""
Golden-dataset evaluation runner — executes every case in golden_dataset.py
through the real, unmodified orchestrator.run_event_pipeline (the exact same
code path "Check Now" and "Simulate Contradiction" use), times it, and
checks a fixed set of deterministic assertions against the real result.

No LLM grades pass/fail here — every assertion reads a field the UI already
displays (overall_status, a gate's confidence, whether life-safety guidance
cites any evidence). That's a deliberate choice: an eval suite whose
pass/fail judgment itself depends on an LLM call is slower, non-deterministic
across runs, and undermines the exact "no model decides what's trustworthy"
principle this app is built around everywhere else.
"""
from __future__ import annotations

import logging
import time

from app.config import Settings
from app.eval.golden_dataset import GOLDEN_DATASET, EvalCase
from app.models.schemas import EvalAssertion, EvalCaseResult, EvalSuiteResult, EventRunResult, GateStatus
from app.orchestrator import run_event_pipeline

logger = logging.getLogger("lifeshield.eval")

_last_result: EvalSuiteResult | None = None


def get_last_result() -> EvalSuiteResult | None:
    return _last_result


def _assertions_for(case: EvalCase, result: EventRunResult) -> list[EvalAssertion]:
    evidence_gate = next((g for g in result.gates if g.gate_name == "evidence_verifier"), None)
    policy_gate = next((g for g in result.gates if g.gate_name == "policy_verifier"), None)
    confidence = evidence_gate.confidence if evidence_gate else None
    threshold = 0.55  # settings.confidence_gate_min default — the actual value used is checked via the gate's own PASS/BLOCK, this is just for the human-readable assertion text

    if case.expect_blocked:
        return [
            EvalAssertion(
                name="pipeline_blocked",
                expected="blocked",
                actual=result.overall_status,
                passed=result.overall_status == "blocked",
            ),
            EvalAssertion(
                name="evidence_confidence_collapsed",
                expected=f"< {threshold}",
                actual=f"{confidence:.2f}" if confidence is not None else "n/a",
                passed=confidence is not None and confidence < threshold,
            ),
        ]

    grounded = bool(result.life_safety and len(result.life_safety.citing_evidence) > 0)
    policy_ok = policy_gate is None or policy_gate.status != GateStatus.BLOCKED
    return [
        EvalAssertion(
            name="pipeline_not_blocked",
            expected="!= blocked",
            actual=result.overall_status,
            passed=result.overall_status != "blocked",
        ),
        EvalAssertion(
            name="evidence_confidence_meets_threshold",
            expected=f">= {threshold}",
            actual=f"{confidence:.2f}" if confidence is not None else "n/a",
            passed=confidence is not None and confidence >= threshold,
        ),
        EvalAssertion(
            name="life_safety_grounded_in_evidence",
            expected="citing_evidence non-empty",
            actual=f"{len(result.life_safety.citing_evidence)} item(s)" if result.life_safety else "no life_safety output",
            passed=grounded,
        ),
        EvalAssertion(
            name="policy_verifier_not_blocked",
            expected="!= blocked",
            actual=policy_gate.status.value if policy_gate else "did not run",
            passed=policy_ok,
        ),
    ]


async def _run_case(case: EvalCase, settings: Settings) -> EvalCaseResult:
    started = time.monotonic()
    try:
        result = await run_event_pipeline(
            settings,
            label=f"[eval] {case.label}",
            city=case.city,
            inject_contradiction=case.inject_contradiction,
        )
        latency_ms = int((time.monotonic() - started) * 1000)
        assertions = _assertions_for(case, result)
        evidence_gate = next((g for g in result.gates if g.gate_name == "evidence_verifier"), None)
        return EvalCaseResult(
            case_id=case.case_id,
            label=case.label,
            city=case.city,
            passed=all(a.passed for a in assertions),
            overall_status=result.overall_status,
            confidence=evidence_gate.confidence if evidence_gate else None,
            latency_ms=latency_ms,
            assertions=assertions,
        )
    except Exception as exc:  # noqa: BLE001 - a real infra failure is itself a failed case, reported honestly
        latency_ms = int((time.monotonic() - started) * 1000)
        logger.warning("Eval case %s raised: %s", case.case_id, exc)
        return EvalCaseResult(
            case_id=case.case_id,
            label=case.label,
            city=case.city,
            passed=False,
            overall_status="error",
            confidence=None,
            latency_ms=latency_ms,
            assertions=[],
            error=str(exc),
        )


async def run_golden_suite(settings: Settings) -> EvalSuiteResult:
    global _last_result
    cases: list[EvalCaseResult] = []
    for case in GOLDEN_DATASET:
        cases.append(await _run_case(case, settings))

    passed_count = sum(1 for c in cases if c.passed)
    avg_latency = int(sum(c.latency_ms for c in cases) / len(cases)) if cases else 0
    suite_result = EvalSuiteResult(
        total_cases=len(cases),
        passed_count=passed_count,
        failed_count=len(cases) - passed_count,
        avg_latency_ms=avg_latency,
        cases=cases,
    )
    _last_result = suite_result
    return suite_result
