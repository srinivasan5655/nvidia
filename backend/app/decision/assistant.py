"""
Decision Output — Assistant Chat.

Retrieval-augmented Q&A over this app's own glossary (app/knowledge/glossary.py)
plus, when a run is loaded, that run's live state. Same discipline as every
other narrative in this app: the model is told to answer ONLY from the
context it's given, never invent a fact, and say plainly when the context
doesn't cover the question — grounding, not free-form chat.

Retrieval: NeMo Retriever embeddings (nvidia_runtime/retriever_client.py),
cosine-similarity ranked against the question — see that module's docstring
for why reranking is skipped. The glossary corpus is embedded once and
cached in-process (it's static and tiny), not re-embedded per request.
"""
from __future__ import annotations

import logging

from app.config import Settings
from app.decision import approval
from app.guardrails.assistant_rails import check_question
from app.knowledge.glossary import GLOSSARY
from app.models.schemas import AssistantAnswer, AssistantCitation, EventRunResult
from app.nvidia_runtime import nim_client
from app.nvidia_runtime.relay_governance import governed_scope
from app.nvidia_runtime.retriever_client import cosine_similarity, embed_texts, select_relevant
from app.nvidia_runtime.switchyard_router import resolve_reasoning_chain

logger = logging.getLogger("lifeshield.assistant")

TOP_K = 4

SYSTEM_PROMPT = """You are the LifeShield AI in-app assistant. Answer the operator's question using ONLY the \
context provided below (glossary passages and, if present, the current event's live data).

Rules:
- If the context doesn't contain enough information to answer, say so plainly — never guess or use \
outside knowledge about NWS, USGS, Twilio, NVIDIA, or anything else not already in the context.
- Be concise: 2-4 sentences unless the question needs a list.
- When citing a number (confidence, exposure, distance), use the exact value from the context, never round \
or estimate it yourself.
- Plain text only — no markdown headers, no code blocks."""

_corpus_embeddings_cache: list[list[float]] | None = None


async def _corpus_embeddings(settings: Settings) -> list[list[float]]:
    global _corpus_embeddings_cache
    if _corpus_embeddings_cache is None:
        _corpus_embeddings_cache = await embed_texts(
            settings, [d["text"] for d in GLOSSARY], input_type="passage"
        )
    return _corpus_embeddings_cache


async def _retrieve(settings: Settings, question: str) -> list[tuple[dict, float]]:
    corpus_vectors = await _corpus_embeddings(settings)
    [query_vector] = await embed_texts(settings, [question], input_type="query")
    scored = [(doc, cosine_similarity(query_vector, vec)) for doc, vec in zip(GLOSSARY, corpus_vectors)]
    # Adaptive cutoff (see retriever_client.select_relevant's docstring),
    # not a fixed scored[:TOP_K] slice — a fixed slice always returns TOP_K
    # docs even when only one is actually relevant, which mechanically caps
    # precision regardless of ranking quality. TOP_K here is a ceiling, not
    # a target.
    return select_relevant(scored, max_k=TOP_K)


def _live_state_snapshot(run: EventRunResult) -> str:
    lines = [
        f"Current event: {run.event.city_label} — {run.event.label} (event_id={run.event.event_id})",
        f"Overall status: {run.overall_status}",
    ]
    for gate in run.gates:
        lines.append(f"  Gate '{gate.gate_name}': {gate.status} (confidence {gate.confidence:.2f}) — {gate.reasoning}")
    if run.life_safety:
        lines.append(f"Life-safety headline: {run.life_safety.headline}")
        lines.append(f"Guidance confidence: {run.life_safety.confidence:.2f}")
        for point in run.life_safety.guidance_points:
            lines.append(f"  Guidance point: {point}")
    if run.insurer_exposure:
        lines.append(
            f"Insurer exposure: {run.insurer_exposure.total_policies_in_footprint} polic(ies) in footprint, "
            f"total TIV ${run.insurer_exposure.total_tiv_in_footprint:,.0f}, "
            f"estimated exposure ${run.insurer_exposure.total_estimated_exposure:,.0f}"
        )
    if run.evacuation_plan and run.evacuation_plan.routes:
        nearest = run.evacuation_plan.routes[0]
        lines.append(
            f"Nearest evacuation shelter: {nearest.shelter_name}, {nearest.distance_km} km "
            f"({nearest.duration_min} min drive)"
        )
    return "\n".join(lines)


async def answer_question(question: str, event_id: str | None, settings: Settings) -> AssistantAnswer:
    with governed_scope(
        "assistant_chat", "Llm", metadata={"event_id": event_id, "question_length": len(question)}
    ) as handle:
        # NeMo Guardrails on the operator's free-typed question — the other real
        # free-text-reaches-an-LLM surface in this app besides the SMS console.
        # Fails open (question allowed through) if the check itself degrades,
        # same rule as sms_rails.py.
        allowed, guardrails_note = await check_question(question, settings)
        if not allowed:
            logger.info("Assistant question blocked by guardrails: %s", guardrails_note)
            return AssistantAnswer(
                answer="This question can't be answered by this assistant — it was flagged by NeMo Guardrails "
                "before reaching the model. Try rephrasing an operational question about this event or the app.",
                model_used="none",
                citations=[],
                grounded_in_current_event=False,
                blocked=True,
            )

        try:
            retrieved = await _retrieve(settings, question)
        except Exception as exc:  # noqa: BLE001 - NeMo Retriever unreachable/unconfigured -> honest degrade,
            # same "never crash the real thing" rule as every other NIM call in this app. Previously this raised
            # straight out of the router as an unhandled 500 (retriever failure, unlike every other model call
            # here, wasn't wrapped) - the assistant panel would show a raw error instead of a plain fallback.
            logger.warning("Retriever call failed (%s); answering without retrieved context.", exc)
            retrieved = []
        context_parts = [f"[{doc['title']}]\n{doc['text']}" for doc, _score in retrieved]

        grounded_in_current_event = False
        if event_id:
            run = approval.get_run(event_id)
            if run:
                context_parts.append(f"[Current event live data]\n{_live_state_snapshot(run)}")
                grounded_in_current_event = True

        context = "\n\n".join(context_parts) if context_parts else "(no relevant context found)"
        user_prompt = f"Context:\n{context}\n\nQuestion: {question}"

        chain = resolve_reasoning_chain(settings, effort="low")
        target = chain[0]
        try:
            answer = await nim_client.chat_completion(
                chain,
                system=SYSTEM_PROMPT,
                user=user_prompt,
                max_tokens=400,
                disable_thinking=True,
                relay_handle=handle,
            )
            answer = answer.strip()
            if not answer:
                raise ValueError("empty answer returned")
        except Exception as exc:  # noqa: BLE001 - NIM unreachable/unconfigured -> honest degrade
            logger.warning("Assistant chat failed (%s); returning a plain fallback.", exc)
            return AssistantAnswer(
                answer="The assistant's reasoning model is unavailable right now — please try again shortly.",
                model_used="none",
                citations=[],
                grounded_in_current_event=grounded_in_current_event,
            )

        return AssistantAnswer(
            answer=answer,
            model_used=target.model,
            citations=[
                AssistantCitation(doc_id=doc["id"], title=doc["title"], score=round(score, 3))
                for doc, score in retrieved
            ],
            grounded_in_current_event=grounded_in_current_event,
        )
