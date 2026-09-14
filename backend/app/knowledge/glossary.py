"""
Static grounding corpus for the Assistant chat — short, factual docs about
every evidence source, gate, and NVIDIA component this app actually uses.
Deliberately hand-written and versioned in code (not scraped/generated) so
every claim in it is something we can stand behind; the Assistant is told to
answer ONLY from this corpus plus the live event snapshot, never from the
model's own background knowledge, so a wrong or missing doc here shows up as
"I don't have that" rather than a plausible-sounding guess.
"""
from __future__ import annotations

GlossaryDoc = dict[str, str]  # {"id": ..., "title": ..., "text": ...}

GLOSSARY: list[GlossaryDoc] = [
    {
        "id": "nws",
        "title": "NWS (National Weather Service)",
        "text": (
            "NWS is the US federal agency issuing active weather alerts — flood warnings, flash flood "
            "warnings, flood advisories, and flood watches. LifeShield treats NWS as one of the five "
            "'hazard' evidence sources whose agreement determines event confidence. In Chennai/Bengaluru "
            "runs, NWS-equivalent alerts are labeled IMD (India Meteorological Department)."
        ),
    },
    {
        "id": "usgs",
        "title": "USGS (US Geological Survey) stream gauges",
        "text": (
            "USGS provides real-time stream/river gauge height readings (gage height in feet) at fixed "
            "monitoring stations. LifeShield uses the nearest gauge reading as one hazard evidence source "
            "and, when no vision water-depth estimate is available, as a fallback input to the insurer "
            "exposure damage-ratio calculation. In Chennai/Bengaluru runs this source is labeled CWC/KSNDMC."
        ),
    },
    {
        "id": "hcfcd",
        "title": "HCFCD (Harris County Flood Control District)",
        "text": (
            "HCFCD operates Houston-area rainfall and stream gauges via its Flood Warning System, "
            "reporting a SensorValue and a SensorStatus (e.g. 'high', 'normal'). It's one of the five "
            "hazard evidence sources. In Chennai/Bengaluru runs this source is labeled GCC Stormwater / "
            "BBMP Stormwater respectively."
        ),
    },
    {
        "id": "transtar",
        "title": "TranStar (road incidents)",
        "text": (
            "Houston TranStar reports live road incidents — high water, road closures, and their exact "
            "location. LifeShield uses TranStar incidents to (a) center the evacuation-plan origin point "
            "on the real risk location instead of an arbitrary polygon centroid, and (b) flag (not "
            "reroute around) any evacuation route that passes within 350m of a reported closure."
        ),
    },
    {
        "id": "fema",
        "title": "FEMA (disaster declarations)",
        "text": (
            "FEMA declarations (disaster number, declaration type, incident type, designated area) are "
            "one of the five hazard evidence sources, signaling an official federal/state emergency "
            "declaration for the affected area."
        ),
    },
    {
        "id": "population_svi",
        "title": "Population / SVI (Social Vulnerability Index)",
        "text": (
            "A CDC/ATSDR-sourced population and vulnerability baseline for the event footprint — total "
            "population, number of census tracts, an area-weighted SVI percentile (0=least, 1=most "
            "vulnerable), and the single most-vulnerable tract. This is contextual, not a live hazard "
            "signal, so it is NOT counted toward the 'how many independent sources agree' calculation in "
            "the Evidence Verifier gate."
        ),
    },
    {
        "id": "osm_shelter",
        "title": "OSM Shelter (candidate shelter sites)",
        "text": (
            "Real OpenStreetMap community-center and social-facility nodes inside the event footprint, "
            "used as candidate evacuation destinations. This is NOT an official designated-shelter "
            "registry — just real, named buildings that could plausibly serve as one. Also excluded from "
            "the hazard-source agreement count for the same reason as Population/SVI."
        ),
    },
    {
        "id": "gate_evidence_verifier",
        "title": "Gate 1 — Evidence Verifier",
        "text": (
            "The first of four gates every event passes through. Purely deterministic (no LLM): counts "
            "how many of the five hazard sources (NWS, USGS, HCFCD, TranStar, FEMA) are present and "
            "agreeing, checks freshness (is each item within the staleness window) and geographic "
            "agreement (is each item inside the event footprint), and computes a 0-1 confidence score "
            "as 0.4*source_score + 0.3*freshness_score + 0.3*agreement_score. Blocks the whole pipeline "
            "if fewer than the configured minimum number of sources agree (default 2)."
        ),
    },
    {
        "id": "gate_confidence_gate",
        "title": "Gate 2 — Confidence Gate",
        "text": (
            "A deterministic threshold check (default minimum 0.55) on the Evidence Verifier's confidence "
            "score. This is the cheap circuit breaker before any NIM model call happens — if confidence "
            "is too low, the pipeline returns 'blocked' immediately instead of spending an LLM call on "
            "low-quality evidence."
        ),
    },
    {
        "id": "gate_openshell_supervisor",
        "title": "Gate 3 — OpenShell Supervisor (AI-powered)",
        "text": (
            "The one AI-powered gate. Sends the event's field image to a NIM vision-language model "
            "(meta/llama-3.2-11b-vision-instruct) asking for structured damage evidence: is flooding "
            "observed, is there structural damage, is a road blocked, and an estimated water depth in "
            "feet. Runs inside OpenShell sandbox isolation when a live OpenShell cluster is configured, "
            "otherwise falls back to an in-process direct NIM call (shown in the UI as 'Not sandboxed')."
        ),
    },
    {
        "id": "gate_policy_verifier",
        "title": "Gate 4 — Policy Verifier",
        "text": (
            "A deterministic rule check against the evidence and the results of the first three gates — "
            "e.g. flags when an upstream gate degraded rather than fully passed. No LLM involved."
        ),
    },
    {
        "id": "life_safety",
        "title": "Life-Safety Guidance",
        "text": (
            "The main citizen-facing output: a headline and a short list of action points, synthesized "
            "by a NIM reasoning model (routed via NeMo Switchyard) strictly from the evidence already "
            "gathered and verified — the model is instructed to never invent a fact, number, or "
            "instruction not already present in the evidence. If the NIM call fails even after a "
            "fallback attempt, the headline is honestly prefixed '[LLM unavailable]' and the guidance "
            "degrades to a raw evidence summary instead of showing fabricated AI content."
        ),
    },
    {
        "id": "insurer_exposure",
        "title": "Insurer Exposure",
        "text": (
            "Deterministic Python math only — no LLM ever produces a dollar figure. Total insured value, "
            "gross loss, deductible, and coverage-limit-capped exposure are computed per policy for every "
            "synthetic policy inside the event footprint. An optional DeepAgents 'Exposure Agent' can add "
            "a plain-English underwriter narrative on top of the already-final numbers; if it fails, the "
            "numbers are unaffected, only the narrative is missing."
        ),
    },
    {
        "id": "evacuation_plan",
        "title": "Evacuation Plan",
        "text": (
            "Deterministic routing: the origin is the centroid of reported TranStar closures (or the "
            "event polygon centroid if none), candidate shelters come from OSM Shelter evidence, and "
            "routes are computed by a real OSRM routing-engine call over the actual road network — not "
            "estimated. No model ever picks a shelter or draws a route. A route that passes within 350m "
            "of a reported closure is flagged, never silently rerouted around, since there's no live data "
            "on which roads are actually impassable."
        ),
    },
    {
        "id": "counterfactual",
        "title": "Counterfactual Analysis",
        "text": (
            "A NIM-generated narrative answering 'what would have happened without this warning', "
            "reasoning over the evidence and outputs already computed for the run — same no-invented-facts "
            "constraint as the life-safety narrative."
        ),
    },
    {
        "id": "nvidia_nim",
        "title": "NVIDIA NIM",
        "text": (
            "The actual model-serving layer for every AI call in this app — reasoning (life-safety, "
            "counterfactual, SMS drafts, this Assistant), and vision (the OpenShell Supervisor gate). "
            "Called through an OpenAI-compatible Chat Completions API, either the hosted build.nvidia.com "
            "endpoint or a self-hosted NIM on a Linux/Kubernetes cluster."
        ),
    },
    {
        "id": "nemo_switchyard",
        "title": "NeMo Switchyard",
        "text": (
            "Decides which NIM model handles a given call: which environment (dev build.nvidia.com vs. "
            "self-hosted prod), and which effort tier (a smaller/faster model for tasks where evidence "
            "already agrees, a larger model for ambiguous/degraded/conflicting evidence). It's a routing "
            "decision, not itself a reasoning step."
        ),
    },
    {
        "id": "nemo_relay",
        "title": "NeMo Relay",
        "text": (
            "Wraps every gate, agent, and LLM call in a governed 'scope' recording real token usage, "
            "timing, and category, so every event run has a complete, auditable trace. Visible in the "
            "app's Observability tab as total tokens, per-model breakdown, and a chronological activity "
            "log. It records; it never decides or generates anything itself."
        ),
    },
    {
        "id": "openshell",
        "title": "OpenShell",
        "text": (
            "Provides sandbox isolation for the vision specialist's tool execution — running it in an "
            "isolated environment rather than in-process. Requires a live OpenShell cluster (Linux, "
            "container runtime); when none is configured, the vision call still runs, just without "
            "sandbox isolation, shown honestly in the UI as 'Not sandboxed' / 'In-process'."
        ),
    },
    {
        "id": "nemo_guardrails",
        "title": "NeMo Guardrails",
        "text": (
            "Used on the SMS Console path: every message — whether AI-drafted or hand-typed — is checked "
            "by an LLM-based input/output self-check before it's allowed to reach Twilio, blocking "
            "harassment/hate/sexual/violence-unrelated content while explicitly allowing urgent disaster "
            "language (which would otherwise look 'alarming' to a naive filter)."
        ),
    },
    {
        "id": "nemo_retriever",
        "title": "NeMo Retriever",
        "text": (
            "Powers this Assistant chat: embeds this glossary corpus and your question with a NeMo "
            "Retriever embedding model, ranks the corpus by similarity to your question, and gives only "
            "the most relevant passages (plus the current event's live data, if one is loaded) to the "
            "reasoning model as grounding context — so answers come from real documented facts, not the "
            "model's own unverified background knowledge."
        ),
    },
    {
        "id": "what_if",
        "title": "What If simulator",
        "text": (
            "A slider-driven, deterministic (not LLM) scenario model for Houston (Hurricane Harvey), "
            "Chennai (Cyclone Vardha), and Bengaluru (Sept 2022 floods) — every number shown (severity "
            "index, impact radius, estimated exposure) is computed from formulas in the sliders, never "
            "generated by a model, rendered on a real MapLibre map."
        ),
    },
    {
        "id": "simulate_contradiction",
        "title": "Simulate Contradiction (red-team demo)",
        "text": (
            "A deliberate demo path that silences 4 of 5 hazard evidence feeds and backdates the "
            "surviving one, then runs the exact same, unmodified Evidence Verifier / Confidence Gate "
            "logic against that mutated evidence — showing a genuine BLOCKED status and collapsed "
            "confidence, not a scripted UI state."
        ),
    },
]
