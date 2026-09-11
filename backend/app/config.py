"""
Central configuration for LifeShield AI.

Two runtime targets:
  - DEV  : build.nvidia.com hosted NIM endpoints (fast to iterate, needs NVIDIA_API_KEY)
  - PROD : self-hosted NIM on the Curiosity v2 B300 cluster (NIM_PROD_BASE_URL)

Switching is a Switchyard routing decision (see nvidia_runtime/switchyard_router.py),
not an if/else scattered through the codebase.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parent.parent
FIXTURES_DIR = Path(__file__).resolve().parent / "evidence" / "fixtures"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- App ---
    app_name: str = "LifeShield AI"
    log_level: str = "INFO"
    cors_allow_origins: list[str] = ["http://localhost:5173"]

    # --- Evidence mode ---
    # "replay"  -> read de-identified JSON fixtures committed in evidence/fixtures/
    #              (this is what today's demo runs on, and what CI runs on)
    # "live"    -> call the real public NWS / USGS / HCFCD / TranStar / FEMA endpoints
    evidence_mode: Literal["replay", "live"] = "replay"

    # --- Evidence source endpoints (used only when evidence_mode == "live") ---
    nws_base_url: str = "https://api.weather.gov"
    usgs_base_url: str = "https://waterservices.usgs.gov/nwis/iv/"
    hcfcd_base_url: str = "https://www.harriscountyfws.org/arcgis/rest/services"
    transtar_base_url: str = "https://traffic.houstontranstar.org/api"
    fema_base_url: str = "https://www.fema.gov/api/open/v2"
    http_timeout_seconds: float = 15.0

    # --- NVIDIA runtime: build.nvidia.com (dev) ---
    nvidia_api_key: str | None = Field(default=None, alias="NVIDIA_API_KEY")
    nvidia_base_url: str = "https://integrate.api.nvidia.com/v1"
    nim_reasoning_model: str = "nvidia/nemotron-3-super-120b-a12b"
    nim_vision_model: str = "nvidia/neva-22b"

    # --- NVIDIA runtime: self-hosted NIM on Curiosity v2 (prod) ---
    nim_prod_base_url: str | None = None
    nim_prod_api_key: str | None = None

    # deterministic router: "dev" pins build.nvidia.com, "prod" pins self-hosted NIM,
    # "auto" (default) uses prod when nim_prod_base_url is configured, else dev.
    runtime_target: Literal["dev", "prod", "auto"] = "auto"

    # --- NeMo Relay (governance / observability on every LLM + tool call) ---
    relay_enabled: bool = True
    relay_export_dir: str = str(REPO_ROOT / "var" / "relay_traces")

    # --- OpenShell (sandboxed specialist execution) ---
    openshell_enabled: bool = False  # requires a live OpenShell cluster; off by default in replay mode
    openshell_endpoint: str | None = None
    openshell_bearer_token: str | None = None
    openshell_cluster: str | None = None
    openshell_workspace: str = "lifeshield-specialists"
    openshell_sandbox_image: str = "lifeshield-sandbox-py:latest"

    # --- Decision gate thresholds (deterministic, not LLM-decided) ---
    confidence_gate_min: float = 0.55
    evidence_min_agreeing_sources: int = 2
    evidence_max_age_minutes: int = 90

    # --- Human approval ---
    require_human_approval: bool = True


@lru_cache
def get_settings() -> Settings:
    return Settings()
