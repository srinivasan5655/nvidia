from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.nvidia_runtime.relay_governance import init_relay
from app.routers import events

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    init_relay(settings)
    logging.getLogger("lifeshield.main").info(
        "LifeShield AI backend up | evidence_mode=%s runtime_target=%s relay_enabled=%s openshell_enabled=%s",
        settings.evidence_mode, settings.runtime_target, settings.relay_enabled, settings.openshell_enabled,
    )
    yield


app = FastAPI(title="LifeShield AI", version="0.1.0", lifespan=lifespan)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(events.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "lifeshield-ai-backend"}


@app.get("/api/v1/config")
async def config():
    s = get_settings()
    return {
        "evidence_mode": s.evidence_mode,
        "runtime_target": s.runtime_target,
        "relay_enabled": s.relay_enabled,
        "openshell_enabled": s.openshell_enabled,
        "confidence_gate_min": s.confidence_gate_min,
        "require_human_approval": s.require_human_approval,
    }
