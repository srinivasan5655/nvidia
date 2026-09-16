"""
Real NVIDIA NeMo Evaluator integration — verified against the installed
`nemo-evaluator==0.3.0` package (pip-installable, no Docker/Kubernetes;
its RAG-specific named metrics like `rag_faithfulness` belong to the
separate, heavier NeMo Microservices deployment, not this library, so
those metric NAMES are ours — computed by custom scorers plugged into
NeMo Evaluator's own real `@benchmark`/`@scorer`/`run_evaluation` engine,
not a hand-rolled substitute for it).

Two benchmarks, registered via NeMo Evaluator's Bring-Your-Own-Benchmark
API:

  "assistant-retrieval"   — precision/recall/F1/accuracy of NeMo Retriever
                             against a hand-labeled golden dataset
                             (retrieval_dataset.py) of (question -> correct
                             glossary doc_id) pairs. This is retrieval-
                             quality eval coverage the Assistant never had
                             before — every other Golden Dataset case
                             (golden_dataset.py) exercises the event
                             pipeline, never the retriever itself.

  "life-safety-quality"   — faithfulness/completeness/bias/accuracy of the
                             real life-safety narrative from the real
                             pipeline (golden_dataset.py's own non-
                             contradiction cases: houston_normal,
                             chennai_normal), scored by the real NeMo
                             Guardrails checks already built for this app
                             (grounding_rails.py, bias_rails.py) — not a
                             second implementation of them.

Both scorers report their metrics as plain floats in `scoring_details`;
NeMo Evaluator's own `metrics` module (bootstrap CI, McNemar, pass@k) is
built for comparing benchmark RUNS against each other, not for the named
per-sample metrics this report tracks, so those are aggregated here
directly from each run's per-sample results.
"""
from __future__ import annotations

import logging
import time
from typing import Any

import nemo_evaluator as ne

from app.config import Settings, get_settings
from app.eval.golden_dataset import GOLDEN_DATASET
from app.eval.retrieval_dataset import RETRIEVAL_GOLDEN_DATASET
from app.guardrails.bias_rails import check_fairness
from app.guardrails.grounding_rails import check_grounding
from app.knowledge.glossary import GLOSSARY
from app.models.schemas import NemoEvalBenchmark, NemoEvalReport, NemoEvalSample
from app.nvidia_runtime.retriever_client import cosine_similarity, embed_texts, select_relevant
from app.orchestrator import run_event_pipeline

logger = logging.getLogger("lifeshield.nemo_evaluator")

# Matches decision/assistant.py's TOP_K exactly — this benchmark must test
# the same ceiling the live Assistant actually uses, or a passing score here
# wouldn't say anything about production behavior. The real fix for this
# benchmark's precision (previously 0.32) wasn't this number — it was
# switching both call sites from a fixed scored[:k] slice to
# retriever_client.select_relevant()'s adaptive cutoff (see its docstring).
RETRIEVAL_TOP_K = 4

# Windows compatibility fix, verified against the installed nemo-evaluator
# 0.3.0 package's actual source: ne.get_environment() unconditionally calls
# an internal _ensure_builtins() first, which imports every one of NeMo
# Evaluator's own built-in benchmarks — including nmp_harbor, which does a
# bare `import fcntl` (POSIX-only) at module load time and crashes outright
# on Windows. _ensure_builtins() sets its own "already loaded" flag to True
# BEFORE attempting that import, so pre-setting the same flag here skips it
# on every later call without touching nemo_evaluator's own source. This
# only disables NeMo Evaluator's built-in academic benchmarks (MMLU, etc.),
# which nothing in this app uses — our two BYOB benchmarks below are
# registered independently via @benchmark at import time either way.
from nemo_evaluator.environments import registry as _ne_registry  # noqa: E402

_ne_registry._builtins_loaded = True

# Populated synchronously by run_nemo_evaluation_suite() right before the
# life-safety benchmark's environment is constructed — NeMo Evaluator's
# BYOB dataset callable is invoked synchronously (ByobEnvironment.__init__),
# so the real, async pipeline runs that build these rows must happen
# ahead of time, not inside the callable itself.
_life_safety_rows: list[dict[str, Any]] = []


# ---------------------------------------------------------------------------
# Benchmark 1 — Assistant retrieval quality
# ---------------------------------------------------------------------------


def _retrieval_dataset() -> list[dict]:
    return [
        {
            "question": c.question,
            "expected_doc_ids": c.expected_doc_ids,
            "expected_doc_ids_str": ",".join(c.expected_doc_ids),
        }
        for c in RETRIEVAL_GOLDEN_DATASET
    ]


class RetrievalSolver:
    """A NeMo Evaluator Solver whose 'response' is the real NeMo Retriever
    pipeline's top-K retrieved doc_ids for this question — the same
    embed_texts()/cosine_similarity() call the Assistant chat itself makes
    (app/decision/assistant.py's _retrieve), not a re-implementation."""

    def __init__(self, settings: Settings, top_k: int = RETRIEVAL_TOP_K):
        self.settings = settings
        self.top_k = top_k
        self._corpus_vectors: list[list[float]] | None = None

    async def _corpus(self) -> list[list[float]]:
        if self._corpus_vectors is None:
            self._corpus_vectors = await embed_texts(
                self.settings, [d["text"] for d in GLOSSARY], input_type="passage"
            )
        return self._corpus_vectors

    async def solve(self, task) -> "ne.SolveResult":  # noqa: F821 - ne.SolveResult, avoids importing the type just for the hint
        question = task.metadata.get("question", task.prompt)
        corpus_vectors = await self._corpus()
        [query_vector] = await embed_texts(self.settings, [question], input_type="query")
        scored = [(doc["id"], cosine_similarity(query_vector, vec)) for doc, vec in zip(GLOSSARY, corpus_vectors)]
        top = select_relevant(scored, max_k=self.top_k)
        return ne.SolveResult(response=",".join(doc_id for doc_id, _score in top))


@ne.benchmark(
    name="assistant-retrieval",
    dataset=_retrieval_dataset,
    prompt="{question}",
    target_field="expected_doc_ids_str",
)
@ne.scorer
def score_retrieval(sample: "ne.ScorerInput") -> dict:
    retrieved = [d for d in sample.response.split(",") if d] if sample.response else []
    expected = set(sample.metadata.get("expected_doc_ids", []))
    retrieved_set = set(retrieved)

    true_positives = len(retrieved_set & expected)
    precision = true_positives / len(retrieved_set) if retrieved_set else 0.0
    recall = true_positives / len(expected) if expected else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0
    top1_hit = 1.0 if retrieved and retrieved[0] in expected else 0.0

    return {
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "accuracy": top1_hit,
        "correct": top1_hit,
    }


# ---------------------------------------------------------------------------
# Benchmark 2 — Life-safety narrative quality
# ---------------------------------------------------------------------------


async def _build_life_safety_rows(settings: Settings) -> list[dict[str, Any]]:
    """Runs the real pipeline for golden_dataset.py's non-contradiction
    cases (the same real event data every other Golden Dataset run uses)
    and packages each one's real life-safety narrative + evidence for
    scoring. Contradiction cases are skipped — they block before
    life_safety ever runs, so there's nothing to score."""
    rows: list[dict[str, Any]] = []
    for case in GOLDEN_DATASET:
        if case.inject_contradiction:
            continue
        result = await run_event_pipeline(
            settings, label=f"[nemo-eval] {case.label}", city=case.city, inject_contradiction=False
        )
        ls = result.life_safety
        if not ls or ls.headline.startswith("[LLM unavailable]"):
            # Nothing real to score — the run degraded before producing a
            # model-written narrative at all.
            continue
        evidence_text = "\n".join(f"{i.source.value}: {i.summary}" for i in result.event.items)
        narrative_text = "\n".join([ls.headline, ls.hazard_narrative, *ls.guidance_points])
        rows.append(
            {
                "case_id": case.case_id,
                "city": case.city,
                "narrative": narrative_text,
                "evidence_text": evidence_text,
                "citing_evidence": ls.citing_evidence,
                "all_evidence_ids": [i.item_id for i in result.event.items],
            }
        )
    return rows


def _life_safety_dataset() -> list[dict]:
    # Sync on purpose — see _life_safety_rows' module docstring above.
    return list(_life_safety_rows)


class PrecomputedResponseSolver:
    """The 'response' being scored is a narrative the real pipeline already
    produced, not something to generate fresh — this Solver just hands it
    back so NeMo Evaluator's normal seed -> solve -> verify flow still
    applies to it."""

    async def solve(self, task) -> "ne.SolveResult":  # noqa: F821
        return ne.SolveResult(response=task.metadata.get("narrative", ""))


@ne.benchmark(
    name="life-safety-quality",
    dataset=_life_safety_dataset,
    prompt="{case_id}",
    target_field="evidence_text",
)
@ne.scorer
async def score_life_safety(sample: "ne.ScorerInput") -> dict:
    narrative = sample.response
    evidence_text = sample.metadata.get("evidence_text", "")
    citing = set(sample.metadata.get("citing_evidence", []))
    all_ids = set(sample.metadata.get("all_evidence_ids", []))
    settings = get_settings()

    grounded, _grounding_note = await check_grounding(evidence_text, narrative, settings)
    fair, _fairness_note = await check_fairness(narrative, settings)

    # Completeness: how much of the evidence actually offered to the model
    # made it into the guidance's own citations — a real coverage ratio,
    # not a hallucination check (that's faithfulness, above).
    completeness = (len(citing & all_ids) / len(all_ids)) if all_ids else 1.0
    faithfulness = 1.0 if grounded else 0.0
    bias = 1.0 if fair else 0.0  # 1.0 = no unfair/unequal language detected
    accuracy = 1.0 if (grounded and completeness >= 0.4) else 0.0

    return {
        "faithfulness": faithfulness,
        "completeness": round(completeness, 4),
        "bias": bias,
        "accuracy": accuracy,
        "correct": accuracy,
    }


# ---------------------------------------------------------------------------
# Orchestration — run both benchmarks, build the report
# ---------------------------------------------------------------------------


def _extract_results(run_dict: dict[str, Any]) -> list[Any]:
    return run_dict.get("_results", []) or []


def _sample_scoring_details(result: Any) -> dict[str, float]:
    details = getattr(result, "scoring_details", None)
    if details is None and isinstance(result, dict):
        details = result.get("scoring_details", {})
    return {k: v for k, v in (details or {}).items() if isinstance(v, (int, float))}


def _sample_label(result: Any, idx: int, label_field: str) -> str:
    meta = getattr(result, "metadata", None)
    if meta is None and isinstance(result, dict):
        meta = result.get("metadata", {})
    return str((meta or {}).get(label_field, idx))


def _build_benchmark_report(
    *, name: str, metric: str, description: str, run_dict: dict[str, Any], label_field: str, latency_ms: int
) -> NemoEvalBenchmark:
    results = _extract_results(run_dict)
    samples: list[NemoEvalSample] = []
    totals: dict[str, float] = {}
    for idx, result in enumerate(results):
        scores = _sample_scoring_details(result)
        for key, value in scores.items():
            if key == "correct":
                continue
            totals[key] = totals.get(key, 0.0) + value
        samples.append(NemoEvalSample(input_label=_sample_label(result, idx, label_field), scores=scores))

    n = len(samples) or 1
    aggregate = {key: round(total / n, 4) for key, total in totals.items()}

    return NemoEvalBenchmark(
        name=name,
        metric=metric,
        description=description,
        sample_count=len(samples),
        aggregate=aggregate,
        samples=samples,
        latency_ms=latency_ms,
    )


async def run_nemo_evaluation_suite() -> NemoEvalReport:
    settings = get_settings()
    benchmarks: list[NemoEvalBenchmark] = []

    t0 = time.monotonic()
    retrieval_env = ne.get_environment("assistant-retrieval")
    retrieval_run = await ne.run_evaluation(retrieval_env, RetrievalSolver(settings), max_concurrent=4)
    benchmarks.append(
        _build_benchmark_report(
            name="assistant-retrieval",
            metric="Precision / Recall / F1 / Accuracy @ top-3",
            description=(
                "NeMo Retriever's real retrieval against a hand-labeled golden dataset of "
                f"{len(RETRIEVAL_GOLDEN_DATASET)} (question -> correct glossary doc) pairs — the same embedding "
                "call the Assistant chat itself makes, not a simulation of it."
            ),
            run_dict=retrieval_run,
            label_field="question",
            latency_ms=int((time.monotonic() - t0) * 1000),
        )
    )

    t1 = time.monotonic()
    _life_safety_rows.clear()
    _life_safety_rows.extend(await _build_life_safety_rows(settings))
    life_safety_env = ne.get_environment("life-safety-quality")
    life_safety_run = await ne.run_evaluation(life_safety_env, PrecomputedResponseSolver(), max_concurrent=1)
    benchmarks.append(
        _build_benchmark_report(
            name="life-safety-quality",
            metric="Faithfulness / Completeness / Bias / Accuracy",
            description=(
                "Real life-safety narratives from golden_dataset.py's non-contradiction cases, scored by this "
                "app's own real NeMo Guardrails checks (grounding_rails.py for faithfulness, bias_rails.py for "
                "bias) — completeness is real evidence-citation coverage, not a model's self-report."
            ),
            run_dict=life_safety_run,
            label_field="case_id",
            latency_ms=int((time.monotonic() - t1) * 1000),
        )
    )

    return NemoEvalReport(engine_version=ne.__version__, benchmarks=benchmarks)
