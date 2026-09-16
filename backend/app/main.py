from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import FIXTURES_DIR, get_settings
from app.nvidia_runtime.relay_governance import init_relay
from app.routers import assistant, eval as eval_router, events, notifications, relay

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
    # Wide open: allow_origin_regex reflects whatever Origin the browser
    # actually sent (rather than a literal "*", which browsers refuse to
    # combine with allow_credentials=True) -- so every origin is allowed,
    # not just the localhost:5173 default in settings.cors_allow_origins.
    allow_origin_regex=".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(events.router)
app.include_router(relay.router)
app.include_router(notifications.router)
app.include_router(assistant.router)
app.include_router(eval_router.router)

# Serves app/evidence/fixtures/field_image_flood.jpg (and the other fixture
# files) so the browser can render the same field image the vision
# specialist analyzed — EventBundle.field_image_path is a server-side
# filesystem path today and was otherwise unreachable from the frontend.
app.mount("/static/fixtures", StaticFiles(directory=str(FIXTURES_DIR)), name="fixtures")


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
        "hide_passed_gates": s.hide_passed_gates,
    }
