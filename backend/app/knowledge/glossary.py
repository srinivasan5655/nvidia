"""
Static grounding corpus for the Assistant chat — short, factual docs about
every evidence source, gate, and NVIDIA component this app actually uses,
PLUS (added 2026-09-14, per direct request) a second block of general
operational/domain reference docs — one for each persona this app serves
(government/command, insurance, field response, executive) — so the
Assistant is useful for more than "how does this screen work" questions.

Deliberately hand-written and versioned in code (not scraped/generated) so
every claim in it is something we can stand behind; the Assistant is told to
answer ONLY from this corpus plus the live event snapshot, never from the
model's own background knowledge, so a wrong or missing doc here shows up as
"I don't have that" rather than a plausible-sounding guess.

Scope note on the domain-reference block: these are general, publicly
documented facts (NFIP program structure, NWS/NOAA public safety messaging,
FEMA's declaration process, widely-reported historical disaster-cost
estimates) — genuinely useful context for a duty officer, underwriter, or
field responder, but NOT a substitute for this jurisdiction's actual SOPs,
this policyholder's actual policy documents, or this event's live guidance
above. Each doc says so where it matters, and the Assistant's own system
prompt (decision/assistant.py) already forbids stating a live-event fact
that isn't in the live snapshot — this corpus only ever supplies background,
never a substitute for that snapshot.
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

    # -----------------------------------------------------------------
    # Domain reference — Government / Command persona
    # -----------------------------------------------------------------
    {
        "id": "ref_evacuate_vs_shelter",
        "title": "Evacuate vs. shelter-in-place — general criteria",
        "text": (
            "General public-safety guidance (NWS/FEMA messaging), not this event's own recommendation: "
            "evacuation is favored when water is rising and still time to move safely, routes out remain "
            "passable, and the structure itself is at risk (low-lying, upstream of a breached or "
            "overtopped barrier). Shelter-in-place is favored when floodwater already surrounds likely "
            "evacuation routes (moving through moving water is one of the leading causes of flood death), "
            "the structure is sound and on higher ground/upper floors, or official transport hasn't yet "
            "reached the area. This event's own Life-Safety guidance above already applies these factors "
            "to the current evidence — use that for this event, this general framing only for the reasoning behind it."
        ),
    },
    {
        "id": "ref_ics_nims",
        "title": "ICS / NIMS — incident command basics",
        "text": (
            "The Incident Command System (ICS), part of the US National Incident Management System "
            "(NIMS), is the standard structure US emergency agencies use to coordinate a multi-agency "
            "response: one Incident Commander with clear authority, and four functional sections — "
            "Operations (the actual response work), Planning (situational awareness, this kind of "
            "evidence-to-decision picture), Logistics (resources, supplies), and Finance/Administration. "
            "LifeShield's Command Center view is designed to sit inside the Planning function: it doesn't "
            "replace an Incident Commander's authority to declare, order, or approve action."
        ),
    },
    {
        "id": "ref_mandatory_evacuation_authority",
        "title": "Who can order a mandatory evacuation",
        "text": (
            "In the US, the authority to order a mandatory evacuation is almost always local or state "
            "(a county judge, mayor, or governor under a declared emergency), not federal — FEMA "
            "declarations unlock federal aid and resources but don't themselves order evacuations. In "
            "India, similar authority sits with the District Collector/Magistrate under the Disaster "
            "Management Act, 2005, coordinated with the NDMA/SDMA. LifeShield never issues an evacuation "
            "order itself — the Approve/Reject step in this app records a duty officer's decision to "
            "share a warning, which is a communications action, not a legal evacuation order."
        ),
    },

    # -----------------------------------------------------------------
    # Domain reference — Insurance persona
    # -----------------------------------------------------------------
    {
        "id": "ref_nfip_basics",
        "title": "NFIP (National Flood Insurance Program) — basics",
        "text": (
            "In the US, most residential flood coverage is written through the NFIP (administered by "
            "FEMA) rather than a standard homeowners policy, which typically EXCLUDES flood damage "
            "entirely. NFIP policies cap building coverage at $250,000 and contents at $100,000 for "
            "residential properties — losses above that (or any private-market flood policy, which this "
            "app's synthetic portfolio models generically) rely on private/excess flood coverage. This is "
            "why 'total insured value' and 'coverage limit' are tracked as separate fields per policy in "
            "this app's Insurer Exposure output: the capped, not the raw, loss is what an insurer actually pays."
        ),
    },
    {
        "id": "ref_claims_process",
        "title": "Flood claim filing — general process and timeline",
        "text": (
            "General flood-claim process (varies by insurer/jurisdiction): (1) notify the insurer/agent "
            "as soon as safely possible, (2) document damage with photos/video BEFORE cleanup where "
            "possible, (3) an adjuster inspects and estimates the loss, (4) a Proof of Loss is filed "
            "(NFIP requires this within 60 days of the loss by default), (5) payment follows claim "
            "approval. This app's Insurer Exposure output is a pre-loss PORTFOLIO exposure estimate for "
            "triage/reserving before individual claims exist — it is not itself a claim, an adjuster's "
            "estimate, or a payment determination."
        ),
    },
    {
        "id": "ref_flood_exclusions",
        "title": "Common flood-policy exclusions and depth thresholds",
        "text": (
            "Common exclusions/limits across flood policies generally: basements/below-grade areas are "
            "usually covered only for specific systems (utilities, foundations), not finished living "
            "space or contents; a 'first floor' elevation certificate materially affects both premium and "
            "payout; gradual seepage or backup (vs. a defined flood event) is typically excluded. This "
            "app's damage-ratio methodology (insurer_exposure doc above) uses a depth-based ratio "
            "specifically because depth-vs-elevation is the dominant real-world driver of loss severity, "
            "not a simplification invented for the demo."
        ),
    },

    # -----------------------------------------------------------------
    # Domain reference — Field Response persona
    # -----------------------------------------------------------------
    {
        "id": "ref_turn_around_dont_drown",
        "title": "\"Turn Around Don't Drown\" — moving-water safety",
        "text": (
            "NWS's public safety campaign: just 6 inches of fast-moving water can knock an adult down, "
            "and 12 inches can float/carry away most passenger vehicles (a car's weight and shape make it "
            "float far more easily than people expect). Most flood deaths in vehicles happen when a "
            "driver tries to cross water of unknown depth. This is the underlying reason LifeShield's "
            "Evacuation Plan flags — rather than silently reroutes around — any route within 350m of a "
            "reported closure: depth and passability at a closure point usually can't be confirmed "
            "remotely, so a human must make that call, not the routing algorithm."
        ),
    },
    {
        "id": "ref_swiftwater_hazard_class",
        "title": "Swift-water rescue — general hazard awareness",
        "text": (
            "General awareness only, not a training substitute: floodwater carries hazards beyond depth "
            "— strong currents even in shallow water, submerged debris/vehicles, contamination (sewage, "
            "chemicals), and electrical hazards from downed lines or submerged outlets. Swift-water "
            "rescue is a specialized skill (throw bags, PFDs, trained swift-water teams) — an untrained "
            "responder attempting a water rescue is a well-documented secondary casualty risk. Field "
            "personnel should treat any of this app's 'road blocked' or 'high water' evidence items as "
            "reasons to request a trained water-rescue asset, not as a route to navigate personally."
        ),
    },

    # -----------------------------------------------------------------
    # Domain reference — Executive persona (scale/benchmark context)
    # -----------------------------------------------------------------
    {
        "id": "ref_historical_benchmarks",
        "title": "Historical flood-event cost benchmarks (widely reported estimates)",
        "text": (
            "Widely-reported public estimates, useful only for putting a live event's scale in context — "
            "never a substitute for this event's own computed numbers above. Hurricane Harvey (Houston, "
            "2017): commonly cited total US economic damage estimate is roughly $125 billion (NOAA), one "
            "of the costliest US tropical cyclones on record. Chennai floods (Dec 2015): estimated "
            "economic losses commonly reported in the $2-3 billion (USD) range. Bengaluru floods (Sept "
            "2022): widely reported as causing hundreds of millions of dollars in damage and significant "
            "disruption to the city's tech corridor. An executive reading this app's Executive Briefing "
            "should treat any of these only as rough scale anchors, not as a benchmark this event is "
            "predicted to reach."
        ),
    },
    {
        "id": "ref_business_continuity",
        "title": "Business continuity — why insured tech/industrial exposure matters",
        "text": (
            "Beyond direct property loss, flood events near major employment/tech corridors (e.g. "
            "Bengaluru's tech parks, Houston's energy/petrochemical corridor, Chennai's IT/manufacturing "
            "zones) carry secondary business-interruption exposure: operations relocate or pause, supply "
            "chains reroute, and insured business-interruption coverage (separate from property coverage) "
            "can rival or exceed direct property loss in aggregate. This app's Insurer Exposure output "
            "models only direct property exposure (TIV, damage ratio, coverage-capped loss) — business "
            "interruption is a real, larger category this app does not currently estimate."
        ),
    },
]
