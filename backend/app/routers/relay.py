"""
Audit trail — serves the NeMo Relay ATOF export so the UI can show the same
trace file the README promises ("Audit Trail" tab, `relay_scope_id` on every
GateResult). Read-only, additive: nothing here writes to the trace, and
nothing about the existing /api/v1/events routes changes.
"""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, Query

from app.config import get_settings

router = APIRouter(prefix="/api/v1/relay", tags=["relay"])


def _trace_path() -> Path:
    settings = get_settings()
    return Path(settings.relay_export_dir) / "lifeshield_event.atof.jsonl"


def _read_records(path: Path) -> list[dict]:
    records: list[dict] = []
    if not path.exists():
        return records
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                continue  # a partially-flushed line; skip rather than fail the request
    return records


@router.get("/status")
async def relay_status():
    settings = get_settings()
    path = _trace_path()
    exists = path.exists()
    count = len(_read_records(path)) if exists else 0
    return {
        "enabled": settings.relay_enabled,
        "export_path": str(path),
        "exists": exists,
        "record_count": count,
    }


@router.get("/trace")
async def relay_trace(limit: int = Query(default=200, ge=1, le=5000)):
    records = _read_records(_trace_path())
    return records[-limit:]
