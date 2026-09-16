"""
FNOL (First Notice of Loss) draft — auto-fills the slowest part of a real
claims pipeline (manual intake) for one policy already inside this event's
footprint. Every numeric field is copied verbatim from
compute_insurer_exposure()'s already-final InsurerExposureLine; this module
adds exactly one thing — a short, evidence-grounded incident description —
same narrate-never-compute discipline as every other narrative here.

status is always "draft_pending_review": this is intake support for a
human adjuster, never an automated approval or payment.
"""
from __future__ import annotations

import logging

from app.config import Settings
from app.models.schemas import EventBundle, FnolDraft, InsurerExposureLine
from app.nvidia_runtime import nim_client
from app.nvidia_runtime.relay_governance import governed_scope
from app.nvidia_runtime.switchyard_router import resolve_reasoning_chain

logger = logging.getLogger("lifeshield.fnol")

SYSTEM_PROMPT = """You write a 1-2 sentence First Notice of Loss incident description for one insurance policy, \
from the event evidence given. Never invent a number — the loss figures are already final and given separately. \
Plain, factual, claims-intake tone."""


async def generate_fnol_draft(bundle: EventBundle, line: InsurerExposureLine, settings: Settings) -> FnolDraft:
    evidence_text = "\n".join(f"{i.source.value}: {i.summary}" for i in bundle.items)
    user_prompt = (
        f"Event: {bundle.label} ({bundle.city_label})\n"
        f"Policy: {line.policy_id}\n"
        f"Estimated damage ratio: {line.estimated_damage_ratio:.2f}\n"
        f"Evidence:\n{evidence_text}"
    )
    chain = resolve_reasoning_chain(settings, effort="low")
    target = chain[0]
    with governed_scope(
        "fnol_draft", "Llm", metadata={"event_id": bundle.event_id, "policy_id": line.policy_id, "model": target.model}
    ) as handle:
        try:
            raw = await nim_client.chat_completion(
                chain, system=SYSTEM_PROMPT, user=user_prompt, max_tokens=200, disable_thinking=True, relay_handle=handle
            )
            desc = raw.strip()
            if not desc:
                raise ValueError("empty FNOL description returned")
            model_used = target.model
        except Exception as exc:  # noqa: BLE001 - NIM unreachable/unconfigured -> honest deterministic fallback
            logger.warning("FNOL draft narrative failed (%s); using a deterministic description.", exc)
            desc = (
                f"Policy {line.policy_id} is within the {bundle.label} event footprint; "
                f"estimated damage ratio {line.estimated_damage_ratio:.2f}."
            )
            model_used = "none"

        return FnolDraft(
            event_id=bundle.event_id,
            policy_id=line.policy_id,
            incident_description=desc,
            estimated_loss=line.gross_loss_estimate,
            net_of_deductible=line.net_of_deductible,
            capped_at_limit=line.capped_at_limit,
            model_used=model_used,
        )
