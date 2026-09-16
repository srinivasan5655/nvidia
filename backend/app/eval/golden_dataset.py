"""
Golden dataset for the LifeShield evaluation suite — a fixed set of
(city, evidence_mode, inject_contradiction) inputs with known-correct
expected outcomes, run through the REAL pipeline (orchestrator.run_event_pipeline),
never a mocked or simulated one. Every assertion below is a deterministic
check against the same gate/status fields the UI already shows — no LLM
grades these, matching evidence_verifier's own "no model decides what's
trustworthy" discipline.

Two normal-path cases (Houston, Chennai) plus their 'Simulate Contradiction'
red-team counterpart — Bangalore is left out only to keep total suite
runtime reasonable (each normal-path case is a real multi-NIM-call pipeline
run, unbounded to ~30-100s+ depending on live NVIDIA endpoint latency).
"""
from __future__ import annotations

from pydantic import BaseModel


class EvalCase(BaseModel):
    case_id: str
    label: str
    city: str
    inject_contradiction: bool = False
    # What a PASSING run of this case must be true of — checked against the
    # real EventRunResult, not asserted blindly.
    expect_blocked: bool
    """True for the red-team cases: the pipeline should collapse to
    'blocked' at the evidence_verifier/confidence_gate. False for the
    normal-path cases: it should clear every gate and reach a
    recommendation."""


GOLDEN_DATASET: list[EvalCase] = [
    EvalCase(
        case_id="houston_normal",
        label="Houston — normal evidence, should pass every gate",
        city="houston",
        inject_contradiction=False,
        expect_blocked=False,
    ),
    EvalCase(
        case_id="chennai_normal",
        label="Chennai — normal evidence, should pass every gate",
        city="chennai",
        inject_contradiction=False,
        expect_blocked=False,
    ),
    EvalCase(
        case_id="houston_contradiction",
        label="Houston — Simulate Contradiction, should block on collapsed evidence",
        city="houston",
        inject_contradiction=True,
        expect_blocked=True,
    ),
    EvalCase(
        case_id="chennai_contradiction",
        label="Chennai — Simulate Contradiction, should block on collapsed evidence",
        city="chennai",
        inject_contradiction=True,
        expect_blocked=True,
    ),
]
