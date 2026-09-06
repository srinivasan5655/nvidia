"""
NeMo Relay integration — governance and observability on every model and tool
call, per the pptx guardrail: "NeMo Relay governs every call."

Verified against the installed `nemo-relay` 0.8.4 package (not guessed):
  - `nemo_relay.scope.scope(name, scope_type, metadata=..., data=..., input=...)`
    is a contextmanager; `metadata` is the JSON bag recorded on the scope start
    event (NOT `attributes=`, which is a separate typed `ScopeAttributes`
    field for native OTEL-style attributes).
  - `ScopeType.Llm` / `ScopeType.Tool` / `ScopeType.Guardrail` / `ScopeType.Agent`
    are the semantic types we use for NIM calls, evidence-adapter calls,
    decision gates, and the orchestrator respectively.
  - `AtofExporterConfig()` takes zero constructor args; fields are set after
    construction. We export to a local file sink under `var/relay_traces/`
    so every replayed demo run leaves an inspectable trajectory file — this is
    the audit trail the deck's "Audit" guardrail promises.

If `relay_enabled=False` (or the package can't initialize, e.g. no exporter
configured), calls fall through to no-op scopes so the app still runs — but a
gate/agent function should never reach into nemo_relay directly, only through
this module, so flipping that flag is the only place behavior changes.
"""
from __future__ import annotations

import logging
import os
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

import nemo_relay as nr

from app.config import Settings

logger = logging.getLogger("lifeshield.relay")

_initialized = False


def init_relay(settings: Settings) -> None:
    """Configure the local file (ATOF) exporter once per process. Call this
    from the FastAPI lifespan startup hook."""
    global _initialized
    if _initialized or not settings.relay_enabled:
        return

    out_dir = Path(settings.relay_export_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    cfg = nr.AtofExporterConfig()
    cfg.mode = nr.AtofExporterMode.Append
    cfg.output_directory = str(out_dir)
    cfg.filename = "lifeshield_event.atof.jsonl"

    try:
        exporter = nr.AtofExporter(cfg)
        exporter.register("lifeshield-atof")  # subscribes itself to the active scope stack's events
        logger.info("NeMo Relay ATOF exporter writing to %s", exporter.path)
    except Exception as exc:  # pragma: no cover - defensive: exporter wiring varies by Relay version
        logger.warning("NeMo Relay exporter not fully wired (%s); scopes still run, tracing to console only.", exc)

    nr.create_scope_stack()
    _initialized = True
    logger.info("NeMo Relay initialized -> %s", out_dir)


@contextmanager
def governed_scope(name: str, scope_type: str, *, metadata: dict[str, Any] | None = None) -> Iterator[Any]:
    """Wrap one unit of work (an LLM call, a tool/adapter call, a decision
    gate) in a Relay scope. Falls back to a no-op context manager if Relay
    is disabled, so callers never need an `if relay_enabled` branch."""
    settings_relay_on = _initialized
    if not settings_relay_on:
        yield None
        return

    stype = getattr(nr.ScopeType, scope_type, nr.ScopeType.Custom)
    with nr.scope.scope(name, stype, metadata=metadata or {}) as handle:
        yield handle


def scope_id(handle: Any) -> str | None:
    if handle is None:
        return None
    return getattr(handle, "uuid", None) or str(handle)
