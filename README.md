# LifeShield AI — NVIDIA GSI Open Hackathon

Multi-agent disaster response, accelerated by NVIDIA. Team Cognitive Core.

This is a from-scratch build of the architecture in the team's progress deck
("The architecture in one path" — Evidence Layer → NVIDIA Runtime → Decision
Gates → Decision Outputs). It intentionally does **not** reuse the
`IDTCC`/"LifeShield AI" reference repo's product (a synthetic-twin insurance
simulator for 35 Indian cities on AMD MI300X) — that repo shares no
architecture with this one. What's carried over is the visual design
language only (dark console aesthetic, typography, table/badge system),
re-skinned off BMW branding onto an NVIDIA-neutral palette.

## Architecture

```
Evidence Layer          NWS · USGS · HCFCD · TranStar · FEMA adapters
                         → one auditable EventBundle with source lineage
                                    │
NVIDIA Runtime          Switchyard resolves dev (build.nvidia.com) vs
                         prod (self-hosted NIM on Curiosity v2) targets;
                         every call dispatched through nim_client.py;
                         every call wrapped in a NeMo Relay scope
                                    │
Decision Gates          1. evidence_verifier   (deterministic)
                         2. confidence_gate     (deterministic)
                         3. openshell_supervisor (OpenShell-sandboxed
                            DeepAgents vision specialist + validation)
                         4. policy_verifier     (deterministic)
                                    │
Decision Outputs        Life-safety guidance (NIM narrative, evidence-cited)
                         Insurer exposure (deterministic TIV/limit/deductible
                         math — no model ever produces a dollar figure)
                                    │
Human Approval           Nothing is "approved" without an explicit human
                          decision recorded via POST /events/{id}/approve
```

Every gate and every model/tool call is wrapped in a `nemo_relay` scope and
exported to `backend/var/relay_traces/lifeshield_event.atof.jsonl` — that
file is the audit trail.

## NVIDIA services used, and why

| Service | Role | Verified in this build |
|---|---|---|
| [build.nvidia.com](https://build.nvidia.com/) | Hosted NIM endpoints for dev (reasoning + vision models) | `nim_client.py` — real OpenAI-compatible dispatch |
| [NeMo Relay](https://github.com/NVIDIA/NeMo-Relay) | Governs/observes every LLM, tool, and gate call | `relay_governance.py` — real `nemo-relay` 0.8.4 scopes, exported trace file confirmed on disk |
| [NeMo Switchyard](https://github.com/NVIDIA-NeMo/Switchyard) | Deterministic dev/prod target resolution | `switchyard_router.py` — real `LlmTarget`/`PassthroughProfileConfig` |
| [OpenShell](https://github.com/langchain-ai/openshell-deepagent) + DeepAgents | Sandboxed specialist execution (vision damage assessment) | `openshell_specialist.py`, `agents/openshell_supervisor.py` — real `openshell` 0.0.116 + `deepagents` API calls; degrades honestly (not silently) when no cluster is configured |
| `langchain-nvidia-ai-endpoints` | Official NVIDIA LangChain connector for NIM | Used to build the `ChatNVIDIA` model passed into every DeepAgent |

**Package name landmine, already hit and fixed:** install `nemo-switchyard`,
never `pip install switchyard` — the bare name resolves to an unrelated
academic networking framework that squats the same PyPI/import name.

## Running it

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Fill in NVIDIA_API_KEY to get real NIM reasoning/vision calls instead of
# the honest degraded fallback. Leave OPENSHELL_ENABLED=false until the
# Curiosity v2 OpenShell cluster endpoint is available (requires WSL2 per
# the AXIS Curiosity docs — no native Windows OpenShell CLI).
python run.py
```

Backend: http://localhost:8000 · Docs: http://localhost:8000/docs

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend: http://localhost:5173 (Vite dev proxy forwards `/api` and `/health`
to the backend — confirmed working end-to-end in this build).

### Try it

1. Open the frontend, click **Replay Houston Event** on the Overview tab.
2. Watch the four gates resolve on the **Decision Gates** tab.
3. Review both outputs and **approve or reject** on **Outputs & Approval**.
4. Cross-reference the run against the exported Relay trace on **Audit Trail**.

## Known gaps / next steps

- **USGS gauge site IDs** (`08074500`, `08073600`, `08075000`, `08074000`)
  in `evidence/usgs.py` are from training-data recall, not verified live
  against `waterservices.usgs.gov` from this build environment (no network
  egress to that host here) — spot-check before a live demo.
- **OpenShell / self-hosted NIM** paths are real code against the real SDKs,
  but untested against an actual live cluster (this dev environment has no
  network path to a Curiosity v2 OpenShell endpoint or `build.nvidia.com`).
  The degraded-mode behavior *is* tested and does the honest thing.
- **TranStar live feed** access requires coordinating with Houston TranStar
  per their API docs (the exact blocker called out in the deck) — replay
  fixture covers the demo in the meantime, live adapter code is ready to
  point at real credentials when available.
- Human approval store is in-memory (single-process) — fine for a hackathon
  demo, needs a real datastore for anything beyond that.
