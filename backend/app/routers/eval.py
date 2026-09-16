from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.config import get_settings
from app.eval.golden_dataset import GOLDEN_DATASET
from app.eval.nemo_evaluator_suite import run_nemo_evaluation_suite
from app.eval.retrieval_dataset import RETRIEVAL_GOLDEN_DATASET
from app.eval.runner import get_last_result, run_golden_suite
from app.models.schemas import EvalSuiteResult, NemoEvalReport

router = APIRouter(prefix="/api/v1/eval", tags=["eval"])

_last_nemo_report: NemoEvalReport | None = None


@router.get("/dataset")
async def eval_dataset() -> dict:
    return {"cases": [c.model_dump() for c in GOLDEN_DATASET]}


@router.get("/last", response_model=EvalSuiteResult)
async def eval_last() -> EvalSuiteResult:
    result = get_last_result()
    if result is None:
        raise HTTPException(status_code=404, detail="No evaluation suite has been run yet this session.")
    return result


@router.post("/run", response_model=EvalSuiteResult)
async def eval_run() -> EvalSuiteResult:
    """Runs every golden-dataset case through the real pipeline, sequentially
    (concurrent pipeline runs corrupt NeMo Relay's native scope stack — same
    constraint documented in orchestrator.py). Four real pipeline runs, two
    of which are full normal-path runs with live NIM calls — expect this to
    take a few minutes, not seconds."""
    settings = get_settings()
    return await run_golden_suite(settings)


@router.get("/nemo/dataset")
async def nemo_retrieval_dataset() -> dict:
    return {"cases": [c.model_dump() for c in RETRIEVAL_GOLDEN_DATASET]}


@router.get("/nemo/last", response_model=NemoEvalReport)
async def nemo_eval_last() -> NemoEvalReport:
    if _last_nemo_report is None:
        raise HTTPException(status_code=404, detail="No NeMo Evaluator run yet this session.")
    return _last_nemo_report


@router.post("/nemo/run", response_model=NemoEvalReport)
async def nemo_eval_run() -> NemoEvalReport:
    """Runs the real nemo-evaluator package (verified pip-installed, not a
    stub) against two benchmarks: NeMo Retriever precision/recall/F1 on a
    hand-labeled golden dataset, and life-safety narrative faithfulness/
    completeness/bias on real pipeline runs — see nemo_evaluator_suite.py.
    Slow: the second benchmark runs the real pipeline twice with live NIM
    calls, same latency profile as /eval/run."""
    global _last_nemo_report
    report = await run_nemo_evaluation_suite()
    _last_nemo_report = report
    return report
