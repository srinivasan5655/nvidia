"""
NeMo Retriever integration — embedding-based grounding for the Assistant
chat. Same dev/prod split as nim_client.py's reasoning/vision targets: a
self-hosted NeMo Retriever embedding NIM, on its own port (requires
Linux/Docker — the microservices ship as containers, same constraint that
ruled out OpenShell on this Windows dev box), with the same primary/backup
failover chain as nim_client.py — connection/timeout/5xx errors on the
self-hosted port fail over to the hosted build.nvidia.com embedding
endpoint, a plain HTTPS call needing only an API key. A 4xx is left to
propagate (a real request/config bug, not an outage — see nim_client.py's
module docstring for why that distinction matters).

Scope note: this deliberately skips the separate NeMo Retriever reranking
microservice and does cosine-similarity ranking on the embeddings directly
— the embedding model IS the core of Retriever, and the assistant's corpus
(app/knowledge/glossary.py) is small enough (a few dozen short docs) that a
second reranking pass isn't needed to get relevant results.

`select_relevant()` below is the one piece of ranking logic that DID need
fixing: a fixed top-K cutoff was measurably capping retrieval precision
(see its own docstring) independent of ranking quality. It's a cutoff
policy, not a rerank — the ordering it operates on still comes straight
from cosine similarity above.
"""
from __future__ import annotations

import logging
import math
from typing import Literal, TypeVar

import openai
from openai import AsyncOpenAI

from app.config import Settings

logger = logging.getLogger("lifeshield.retriever")

InputType = Literal["query", "passage"]

T = TypeVar("T")

# Same failover set as nim_client.py: retry the next endpoint only when the
# backend is down/slow/erroring server-side, never on a 4xx (a real bug that
# would fail identically everywhere).
_FAILOVER_EXCEPTIONS = (openai.APIConnectionError, openai.APITimeoutError, openai.InternalServerError)


def _chain(settings: Settings) -> list[tuple[AsyncOpenAI, str]]:
    """Ordered (client, model) pairs to try in turn. Honors the same
    RUNTIME_TARGET pin as the reasoning/vision targets (switchyard_router.py):
    "dev" forces build.nvidia.com only (no failover), "prod" forces the
    self-hosted embedding NIM only (no failover), "auto" (default) tries
    self-hosted first and falls back to build.nvidia.com on failure."""
    dev = (
        AsyncOpenAI(base_url=settings.nvidia_base_url, api_key=settings.nvidia_api_key or ""),
        settings.nemo_retriever_embed_model,
    )
    if settings.runtime_target == "dev":
        return [dev]

    if not settings.nemo_retriever_self_hosted_url:
        if settings.runtime_target == "prod":
            raise RuntimeError("RUNTIME_TARGET=prod but NEMO_RETRIEVER_SELF_HOSTED_URL is not configured")
        return [dev]

    prod = (
        AsyncOpenAI(base_url=settings.nemo_retriever_self_hosted_url, api_key="not-required"),
        settings.nemo_retriever_embed_model,
    )
    if settings.runtime_target == "prod":
        return [prod]
    return [prod, dev]


async def embed_texts(settings: Settings, texts: list[str], *, input_type: InputType) -> list[list[float]]:
    """Embeds a batch of texts. `input_type` matters: NeMo Retriever's
    embedding models are asymmetric (a "what does this document mean"
    embedding differs from a "what is this question asking" embedding for
    the same model) — passing the wrong one silently degrades retrieval
    quality rather than erroring, so callers must be explicit."""
    chain = _chain(settings)
    for i, (client, model) in enumerate(chain):
        try:
            resp = await client.embeddings.create(
                model=model,
                input=texts,
                extra_body={"input_type": input_type, "truncate": "END"},
            )
            return [d.embedding for d in resp.data]
        except _FAILOVER_EXCEPTIONS as exc:
            if i + 1 >= len(chain):
                raise
            logger.warning(
                "NeMo Retriever endpoint %s failed (%s); failing over to build.nvidia.com.",
                client.base_url, exc,
            )
    return []  # unreachable — loop always returns or raises


def cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def select_relevant(
    scored: list[tuple[T, float]],
    *,
    max_k: int,
    min_score: float = 0.15,
    relative_gap: float = 0.88,
) -> list[tuple[T, float]]:
    """Adaptive-K retrieval cutoff, replacing a fixed top-K slice.

    Added after NeMo Evaluator's own "assistant-retrieval" benchmark
    (eval/nemo_evaluator_suite.py) measured 0.32 precision against the
    hand-labeled golden set (eval/retrieval_dataset.py) — and the root
    cause turned out to be mechanical, not a ranking-quality problem: most
    golden questions have exactly ONE correct doc, but a fixed top-K=3/4
    always returns K documents regardless of how many are actually
    relevant, which caps precision at 1/K on every one of those questions
    even with a perfect ranking. The retriever wasn't the problem; always
    returning a fixed number of results was.

    This keeps the top-scoring document, then keeps each next document
    only while it stays within `relative_gap` of the top score AND clears
    the absolute `min_score` floor — so a clearly-dominant top match now
    returns alone (fixing the precision-capping case above), while a
    question that genuinely spans two close docs (a real case in the
    golden set — see RetrievalCase's own docstring) still returns both,
    up to `max_k`. Both call sites that rank the same glossary corpus
    (decision/assistant.py's _retrieve and eval/nemo_evaluator_suite.py's
    RetrievalSolver) call this instead of slicing `scored[:k]` directly, so
    the benchmark measures the exact cutoff logic the live Assistant uses.
    """
    if not scored:
        return []
    ordered = sorted(scored, key=lambda pair: pair[1], reverse=True)
    top_score = ordered[0][1]
    selected: list[tuple[T, float]] = []
    for doc, score in ordered[:max_k]:
        if score < min_score:
            break
        if selected and score < top_score * relative_gap:
            break
        selected.append((doc, score))
    return selected
