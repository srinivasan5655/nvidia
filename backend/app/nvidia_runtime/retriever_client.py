"""
NeMo Retriever integration — embedding-based grounding for the Assistant
chat. Same dev/prod split as nim_client.py's reasoning/vision targets: a
self-hosted NeMo Retriever embedding NIM (requires Linux/Docker — the
microservices ship as containers, same constraint that ruled out OpenShell
on this Windows dev box) falling back to the hosted build.nvidia.com
embedding endpoint, which is a plain HTTPS call needing only an API key.

Scope note: this deliberately skips the separate NeMo Retriever reranking
microservice and does cosine-similarity ranking on the embeddings directly
— the embedding model IS the core of Retriever, and the assistant's corpus
(app/knowledge/glossary.py) is small enough (a few dozen short docs) that a
second reranking pass isn't needed to get relevant results.
"""
from __future__ import annotations

import logging
import math
from typing import Literal

from openai import AsyncOpenAI

from app.config import Settings

logger = logging.getLogger("lifeshield.retriever")

InputType = Literal["query", "passage"]


def _client_and_base(settings: Settings) -> tuple[AsyncOpenAI, str]:
    if settings.nemo_retriever_self_hosted_url:
        logger.info("NeMo Retriever: routing to self-hosted %s", settings.nemo_retriever_self_hosted_url)
        return (
            AsyncOpenAI(base_url=settings.nemo_retriever_self_hosted_url, api_key="not-required"),
            settings.nemo_retriever_embed_model,
        )
    logger.info("NeMo Retriever: routing to hosted build.nvidia.com")
    return (
        AsyncOpenAI(base_url=settings.nvidia_base_url, api_key=settings.nvidia_api_key or ""),
        settings.nemo_retriever_embed_model,
    )


async def embed_texts(settings: Settings, texts: list[str], *, input_type: InputType) -> list[list[float]]:
    """Embeds a batch of texts. `input_type` matters: NeMo Retriever's
    embedding models are asymmetric (a "what does this document mean"
    embedding differs from a "what is this question asking" embedding for
    the same model) — passing the wrong one silently degrades retrieval
    quality rather than erroring, so callers must be explicit."""
    client, model = _client_and_base(settings)
    resp = await client.embeddings.create(
        model=model,
        input=texts,
        extra_body={"input_type": input_type, "truncate": "END"},
    )
    return [d.embedding for d in resp.data]


def cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)
