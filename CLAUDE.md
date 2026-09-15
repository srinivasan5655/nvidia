# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

LifeShield AI — a multi-agent disaster response pipeline built for the NVIDIA GSI Open Hackathon (Team Cognitive Core). It ingests real disaster-evidence feeds (NWS, USGS, HCFCD, TranStar, FEMA), runs them through NVIDIA NIM-backed decision gates, and produces two outputs — life-safety guidance and insurer exposure math — gated behind an explicit human approval step. See `README.md` for the full architecture rationale and the "known gaps" list (unverified live endpoints, in-memory approval store, etc.) before assuming any external integration is production-hardened.

## Repo layout gotcha

**The active frontend source is `frontend_1/`, not `frontend/`.** `frontend/` contains only a stale `dist/` build and `node_modules/` (no tracked source, no `package.json`) — it's leftover cruft, not the app. All frontend work (components, hooks, lib) happens in `frontend_1/src/`. The root README's `cd frontend` instructions are stale; use `frontend_1` instead.

## Commands

### Backend (`backend/`)
```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # fill in NVIDIA_API_KEY for real NIM calls
python run.py                # http://localhost:8000, docs at /docs
```
There is no test suite in this repo (no `pytest.ini`/test files outside `.venv`) — verify backend changes by running the server and exercising `POST /api/v1/events/replay` or the frontend's "Replay" flow.

### Frontend (`frontend_1/`)
```bash
cd frontend_1
npm install
npm run dev      # Vite dev server on :5173, proxies /api, /health, /static to :8000
npm run build     # tsc -b && vite build
npm run lint      # oxlint
```

## Backend architecture

One pipeline, `run_event_pipeline()` in `app/orchestrator.py`, implements the deck's "one path":

```
Evidence Layer → NVIDIA Runtime → Decision Gates → Decision Outputs → Human Approval
```

1. **Evidence Layer** (`app/evidence/`) — one adapter per source (`nws.py`, `usgs.py`, `hcfcd.py`, `transtar.py`, `fema.py`, plus `population_svi.py` and `shelters.py` for non-hazard context). `builder.py` assembles them into one `EventBundle` with full source lineage. `Settings.evidence_mode` ("replay" vs "live") controls whether adapters read committed JSON fixtures (`app/evidence/fixtures/`) or hit real public endpoints — replay is the default and what the demo/CI path uses.

2. **NVIDIA Runtime** (`app/nvidia_runtime/`) — not a pipeline stage itself but the substrate every stage calls through:
   - `switchyard_router.py` — deterministic dev (`build.nvidia.com`) vs prod (self-hosted NIM on Curiosity v2) target resolution, governed by `Settings.runtime_target` ("dev"/"prod"/"auto").
   - `nim_client.py` — the actual OpenAI-compatible dispatch to whichever target Switchyard resolves.
   - `relay_governance.py` — wraps every gate/model/tool call in a `governed_scope(...)` (NeMo Relay). Traces export to `backend/var/relay_traces/lifeshield_event.atof.jsonl` — this file is the audit trail. Relay's native scope stack does not tolerate concurrently-open scopes across asyncio tasks (see the long comment in `orchestrator.py` around `_compute_exposure_async`/`_compute_evacuation_async`) — deterministic outputs are computed sequentially, not via `asyncio.gather`, for this reason.
   - `openshell_specialist.py` — sandboxed DeepAgents specialist execution (OpenShell), used only by the vision gate.

3. **Decision Gates** (`app/agents/`), run in strict order — a `BLOCKED` result at `confidence_gate` or `policy_verifier` short-circuits the pipeline and returns early with no outputs:
   1. `evidence_verifier.py` — deterministic; checks independent-source agreement (`HAZARD_SOURCES` only — `population_svi`/`osm_shelter` are informational, excluded from agreement scoring) and staleness against `evidence_max_age_minutes`.
   2. `confidence_gate.py` — deterministic; compares against `confidence_gate_min`.
   3. `openshell_supervisor.py` — the one non-deterministic gate: an OpenShell-sandboxed DeepAgents vision specialist (`specialists/flood_vision.py`) assesses field imagery, then a validation step.
   4. `policy_verifier.py` — deterministic, checks all prior gate results together.

4. **Decision Outputs** (`app/decision/`) — computed after gates pass, life-safety and insurer-exposure run as separate async paths in the orchestrator:
   - `life_safety.py` — NIM-narrated, evidence-cited guidance (no dollar figures ever come from a model).
   - `insurer_exposure.py` — pure deterministic TIV/limit/deductible math. `agents/exposure_agent.py` (DeepAgents) is tried first as a thin narrative wrapper whose *only tool* is `compute_insurer_exposure()`; on any DeepAgents failure it falls back to calling the math directly — the numeric result is identical either way.
   - `evacuation.py` — OSRM-backed routing; same DeepAgents-first-then-direct-fallback pattern via `agents/evacuation_agent.py`.
   - `counterfactual.py` — "what if" narrative generated after outputs are ready.
   - `approval.py` — in-memory (single-process) store for human approval state; nothing is "approved" without an explicit `POST /events/{id}/approve`.

5. **Guardrails** (`app/guardrails/sms_rails.py`) — the one place free-typed text reaches an LLM before going out to a real phone number (NeMo Guardrails).

`app/orchestrator.py` also supports an `on_progress` callback used by the SSE route (`GET /api/v1/events/replay/stream`) to stream per-stage progress to the frontend without changing pipeline behavior or return values, and an `inject_contradiction` flag (the "Simulate Contradiction" red-team demo) that is the *only* place evidence is ever deliberately mutated — it drops all non-NWS hazard sources and backdates the survivor past the staleness window, then runs the exact same unmodified gate logic on it.

### Config (`app/config.py`)

All runtime behavior is one `Settings` (pydantic-settings, loaded from `backend/.env`) object — dev/prod NIM targets, evidence mode, gate thresholds, OpenShell/Twilio credentials. Everything optional (NVIDIA key, OpenShell, Twilio) degrades to an honest "not configured" state rather than crashing; this pattern is intentional and should be preserved when adding new external integrations.

**Landmine**: install `nemo-switchyard`, never `pip install switchyard` — the bare name resolves to an unrelated PyPI package that squats the same import name.

## Frontend architecture (`frontend_1/`)

React 19 + TypeScript + Vite + Tailwind v4, no router — `App.tsx` is a single-page shell with a `ViewId`-keyed switch over sidebar navigation (`components/shell/Sidebar.tsx`) driving `components/views/*`. State is centered on one `useEventRun()` hook (`hooks/useEventRun.ts`) that owns the run/approve lifecycle and streaming phase (`idle`/`streaming`/`error`/etc.), passed down to every view rather than each view fetching independently. `hooks/useBackend.ts` fetches the `/api/v1/config` runtime info. `lib/api.ts` is the backend client; `lib/types.ts` mirrors the backend Pydantic schemas.

MapLibre GL (`components/map/`) is excluded from Vite's `optimizeDeps` in `vite.config.ts` — its worker chunk doesn't resolve correctly under Vite's dependency pre-bundling otherwise.
