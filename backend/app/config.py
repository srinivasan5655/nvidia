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

from pydantic import Field, field_validator
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
    # CDC/ATSDR SVI — public, keyless ArcGIS REST service (verified live).
    # E_TOTPOP on this layer is itself sourced from Census ACS 5-year
    # estimates, so this one call covers both "population baseline" and
    # "SVI vulnerability" without a separate Census API key/adapter.
    svi_base_url: str = (
        "https://onemap.cdc.gov/onemapservices/rest/services/SVI/"
        "CDC_ATSDR_Social_Vulnerability_Index_2022_USA/MapServer/2"
    )
    # OpenStreetMap Overpass — public, keyless.
    overpass_base_url: str = "https://overpass-api.de/api/interpreter"
    http_timeout_seconds: float = 15.0

    # --- Evacuation routing (real-time, not part of the evidence replay/live
    # split — always attempted live regardless of evidence_mode, same as the
    # NIM calls; degrades to a straight-line estimate if unreachable) ---
    osrm_base_url: str = "http://router.project-osrm.org"

    # --- NVIDIA runtime: build.nvidia.com (dev) ---
    nvidia_api_key: str | None = Field(default=None, alias="NVIDIA_API_KEY")
    nvidia_base_url: str = "https://integrate.api.nvidia.com/v1"
    # High-effort reasoning target: full-size model for tasks that require
    # synthesizing ambiguous/degraded/conflicting evidence.
    nim_reasoning_model: str = "nvidia/nemotron-3-super-120b-a12b"
    # Low-effort reasoning target: Switchyard's strong/weak model-tiering
    # feature, actually used now — same Nemotron 3 family, much smaller
    # active-parameter count, for tasks that are closer to templating a
    # narrative from evidence that already unambiguously agrees. Verified
    # working on build.nvidia.com (returns clean JSON in `content`, its
    # chain-of-thought goes to a separate `reasoning_content` field we
    # already discard).
    nim_reasoning_model_light: str = "nvidia/nemotron-3.5-lightning-30b-a3b"
    # nvidia/neva-22b is listed in the build.nvidia.com catalog but returns a
    # 404 ("Function ... Not found for account") on at least one verified
    # account; meta/llama-3.2-11b-vision-instruct is confirmed fast and
    # reliable for the direct (no-tools) NIM vision call. It does 400 when
    # tools are bound alongside an image, which is why the DeepAgents path
    # (vision_specialist._chat_model) hardcodes a different model rather than
    # reusing this setting — see that function's comment for the full story.
    nim_vision_model: str = "meta/llama-3.2-11b-vision-instruct"

    # --- Cost estimation ---
    # build.nvidia.com's hosted catalog publishes no per-token price — it's
    # free for prototyping under the NVIDIA Developer Program, so there is
    # no real dollar figure to report today. These are a stand-in generic
    # LLM-API rate (NOT sourced from or billed by NVIDIA) so Observability
    # can show a labeled *estimated* cost instead of no cost signal at all.
    # Override both if you're on a paid tier or a self-hosted deployment
    # with a real cost basis — see relay_governance.py's record_call_metrics.
    nim_cost_per_1k_input_usd: float = 0.0002
    nim_cost_per_1k_output_usd: float = 0.0006

    # --- NVIDIA runtime: self-hosted NIM on Curiosity v2 (prod) ---
    # Two separate self-hosted deployments, on two separate ports: the
    # 120b high-effort reasoning model and the 30b (fine-tuned) low-effort
    # reasoning model each run as their own vLLM/NIM instance and are NOT
    # interchangeable — a self-hosted server only ever serves the one model
    # it was launched with (see switchyard_router.py's module docstring).
    # Vision (11b) has no self-hosted deployment; it always routes to
    # build.nvidia.com.
    nim_prod_base_url: str | None = None  # 120b nemotron-3-super, high-effort
    nim_prod_api_key: str | None = None
    nim_prod_light_base_url: str | None = None  # 30b nemotron-3.5-lightning (fine-tuned), low-effort
    nim_prod_light_api_key: str | None = None
    # Optional overrides for the `model` string sent to each self-hosted
    # endpoint, when it differs from the build.nvidia.com catalog name above
    # (nim_reasoning_model / nim_reasoning_model_light). vLLM registers a
    # model under whatever name it was launched with -- verified live that a
    # fine-tuned checkpoint served via vLLM can register under its full HF
    # repo path (e.g. "nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-BF16"),
    # not the shorthand catalog id build.nvidia.com uses. Sending the wrong
    # one 404s silently (nim_client.py's caller degrades to a fallback
    # instead of crashing, so this is easy to miss without checking
    # GET <prod_base_url>/models). Leave unset when the two names happen to
    # match (true for nim_reasoning_model/120b as of this writing).
    nim_prod_model: str | None = None
    nim_prod_light_model: str | None = None

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
    # "default" is the only workspace guaranteed to exist -- the OpenShell CLI
    # has no command to create a named workspace, and "lifeshield-specialists"
    # (this field's value before 2026-09-16) was never provisioned on the
    # gateway, causing every sandboxed specialist call to fail with a gRPC
    # NOT_FOUND ("workspace 'lifeshield-specialists' not found"), verified
    # live on the Curiosity v2 cluster.
    openshell_workspace: str = "default"
    # Empty by default -- an unset `SandboxTemplate.image` (proto3 zero value)
    # is the exact same wire request the CLI sends when `--from` is omitted,
    # which lets the gateway pick its own default sandbox image. That default
    # image is a hard requirement here, not just a convenience: OpenShell's
    # in-container supervisor validates that a `sandbox` user/group (uid/gid
    # 998) already exists in the image before it'll run anything, and the
    # default image has that baked in. Both prior attempts failed this same
    # validation -- "lifeshield-sandbox-py:latest" (a local-only image whose
    # Dockerfile lived in ephemeral /tmp and is gone, so the gateway 404'd
    # trying to pull it from a registry) and, after that, the stock
    # "python:3.12-slim" (pulled fine, but has no `sandbox` user, so the
    # supervisor killed the container immediately with no other error) --
    # both verified live on Curiosity v2. flood_vision.py (the only thing
    # that runs in this sandbox) is stdlib-only, so the default image's own
    # bundled Python is already more than enough; only override this if a
    # specialist ever needs something the default image doesn't have, and
    # any replacement image must itself include the `sandbox` user/group.
    openshell_sandbox_image: str = ""

    # --- Decision gate thresholds (deterministic, not LLM-decided) ---
    confidence_gate_min: float = 0.55
    evidence_min_agreeing_sources: int = 2
    evidence_max_age_minutes: int = 90

    # --- Human approval ---
    require_human_approval: bool = True

    # --- Frontend display toggles ---
    # Hides the "passed" status badge on the Agentic Runtime gate pipeline
    # cards -- passing is the expected/silent state, so this lets a deployment
    # declutter the UI down to just the gates that need attention
    # (blocked/degraded), without touching gate logic itself.
    hide_passed_gates: bool = False

    # --- NeMo Retriever (assistant chat's grounding embeddings) ---
    # Same dev/prod split as the reasoning/vision NIM targets above: an
    # optional self-hosted embedding NIM endpoint (requires a Linux/Docker
    # host — NeMo Retriever microservices ship as NIM containers, same
    # constraint as OpenShell) falling back to the hosted build.nvidia.com
    # embedding endpoint, which needs nothing but nvidia_api_key.
    nemo_retriever_self_hosted_url: str | None = None
    # Verified working on this account/build.nvidia.com as of 2026-09-13 —
    # nvidia/nv-embedqa-e5-v5 (the more commonly documented choice) returned
    # HTTP 410 Gone (retired), and several other catalog embedding models
    # 404 ("Function ... Not found for account") the same way
    # nvidia/neva-22b does elsewhere in this app; this one is confirmed live.
    nemo_retriever_embed_model: str = "nvidia/nemotron-3-embed-1b"

    # --- Demo SMS console (Twilio) ---
    # All optional and unset by default — the SMS console degrades to a
    # clear "not configured" state rather than crashing when these are
    # absent, exactly like nvidia_api_key/openshell_* above. Every message
    # goes to ONE preconfigured recipient (sms_demo_recipient), never an
    # arbitrary number the frontend supplies — this is a demo console, not a
    # general SMS gateway.
    twilio_account_sid: str | None = Field(default=None, alias="TWILIO_ACCOUNT_SID")
    twilio_auth_token: str | None = Field(default=None, alias="TWILIO_AUTH_TOKEN")
    twilio_from_number: str | None = Field(default=None, alias="TWILIO_FROM_NUMBER")
    sms_demo_recipient: str | None = Field(default=None, alias="SMS_DEMO_RECIPIENT")

    # .env.example ships lines like `SMS_DEMO_RECIPIENT=            # comment`
    # so the field reads as blank until a real value is filled in before the
    # `#`. python-dotenv strips a trailing comment correctly once there's a
    # real token before it, but when the value is left blank it hands back
    # the comment text itself as the "value" (confirmed against the
    # installed python-dotenv) — silently polluting is_configured() checks
    # and the masked-number status display with template prose instead of
    # None. Treat anything that's empty or comment-only, once stripped, as
    # genuinely unset for every optional secret/number field that follows
    # this same .env.example convention.
    @field_validator(
        "nvidia_api_key", "twilio_account_sid", "twilio_auth_token", "twilio_from_number", "sms_demo_recipient",
        mode="before",
    )
    @classmethod
    def _blank_or_comment_only_to_none(cls, v: str | None) -> str | None:
        if v is None:
            return None
        stripped = v.strip()
        return None if (not stripped or stripped.startswith("#")) else v


@lru_cache
def get_settings() -> Settings:
    return Settings()
