from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.config import get_settings
from app.eval.golden_dataset import GOLDEN_DATASET
from app.eval.runner import get_last_result, run_golden_suite
from app.models.schemas import EvalSuiteResult

router = APIRouter(prefix="/api/v1/eval", tags=["eval"])


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
