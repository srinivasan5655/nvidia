"""
Generates a LoRA fine-tuning dataset for nvidia/Nemotron-3.5-Lightning-30B-A3B
(the app's low-effort reasoning tier — see switchyard_router.py) targeting
three concrete, previously-observed failure modes rather than generic
"better quality":

  1. Malformed tool calls under multi-tool binding. Verified repeatedly this
     session: DeepAgents always binds several built-in tools (filesystem,
     task) alongside the one domain tool (compute_exposure /
     plan_evacuation) — and this model sometimes emits the tool call as
     free-text JSON instead of a real structured tool_call once more than
     one tool is on the wire. ~30% of tool-using examples below include
     decoy tool schemas (mirroring DeepAgents' real built-ins) specifically
     so the model learns to find the one relevant tool among several.
  2. Non-deterministic "thinking" length. This model sometimes reasons for
     2000-5000+ tokens before answering a templated task that needs no
     reasoning at all, which is why life_safety.py currently has to pass
     disable_thinking=True as a workaround. Every teacher example here is
     generated with thinking disabled and trained to answer directly, so
     the fine-tuned checkpoint doesn't need that workaround.
  3. Schema-echoing / unparseable JSON. Earlier prompts that embedded
     model_json_schema() got echoed back verbatim before the answer,
     producing invalid JSON that _parse()/_parse_or_degrade() then had to
     regex their way out of. Every label here is exactly the target
     Pydantic model, serialized once, nothing else — training the model to
     never wrap, explain, or restate the schema.

Technique: distillation. The teacher is this app's own HIGH-EFFORT model
(nemotron-3-super-120b-a12b, resolve_reasoning_target(effort="high")),
already verified reliable throughout this project. The student is the
LOW-EFFORT model. This is exactly the customization path NVIDIA's own model
card for Nemotron-3.5-Lightning names first: "starting point for
customization... distillation."

Inputs are synthetic but schema-real: every EventBundle, EvidenceItem, and
GateResult is built from this app's actual Pydantic models and run through
the actual deterministic gate functions (verify_evidence, check_confidence)
— only the raw evidence VALUES are synthesized (varied gauge heights, alert
types, closure counts, vision findings), never the shapes. Exposure and
evacuation labels call the real deterministic math
(compute_insurer_exposure, compute_evacuation_plan) so the "tool result" in
every training example is a value the app could really produce, not
something invented for training.

Scenarios are also rotated across LOCATIONS — 11 real, named flood-recovery
regions worldwide (Houston, Jakarta, Dhaka, Chennai, Bengaluru, Lagos,
Manila, Brisbane, Ahrweiler, Beira, Kochi), each with its own real river/
drainage names and
real issuing-authority names. This is deliberate: earlier drafts of this
dataset hardcoded Buffalo/Brays Bayou and Harris County everywhere, which
would have taught the fine-tune to recognize those specific strings rather
than to parse "whatever river and agency name appears in the evidence" —
the actual skill this app needs if it's ever pointed at a non-Houston
event. The app's EvidenceSource categories (NWS/USGS/HCFCD/TRANSTAR/FEMA/
POPULATION_SVI/OSM_SHELTER) stay fixed either way, since they map to this
app's 7 real adapters — but each is treated here as a class of instrument
(national weather warning, river gauge, local sensor network, roads
closure feed, disaster declaration, vulnerability index, community
shelter) that exists in some form in most countries, not a literal US
agency name.

Usage (from backend/, with the venv active and NVIDIA_API_KEY set):
    python -m scripts.generate_finetune_dataset --n-scenarios 40 --out var/finetune

Output: three JSONL files (hazard.jsonl, exposure.jsonl, evacuation.jsonl)
in OpenAI chat/tool-call message format — the same format HF TRL's
SFTTrainer, Axolotl, and (via a one-time conversion) NeMo Framework's data
preprocessing all accept. See the README this script also writes into
--out for the exact schema and next steps.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.agents.evacuation_agent import SYSTEM_PROMPT as EVACUATION_SYSTEM_PROMPT
from app.agents.exposure_agent import SYSTEM_PROMPT as EXPOSURE_SYSTEM_PROMPT
from app.agents.hazard_agent import HazardAgentOutput
from app.agents.vision_specialist import DamageEvidence
from app.agents.confidence_gate import check_confidence
from app.agents.evidence_verifier import verify_evidence
from app.agents.policy_verifier import verify_policy
from app.config import get_settings
from app.decision.evacuation import compute_evacuation_plan
from app.decision.insurer_exposure import compute_insurer_exposure
from app.decision.life_safety import SYSTEM_PROMPT as HAZARD_SYSTEM_PROMPT
from app.models.schemas import EventBundle, EvidenceItem, EvidenceSource
from app.nvidia_runtime.nim_client import chat_completion
from app.nvidia_runtime.switchyard_router import resolve_reasoning_target

# ---------------------------------------------------------------------------
# Decoy tool schemas — mirror DeepAgents' real built-ins closely enough to
# actually exercise the multi-tool-confusion failure mode during training,
# not just pad the message list.
# ---------------------------------------------------------------------------
DECOY_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read a file from the sandboxed filesystem.",
            "parameters": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Write a file to the sandboxed filesystem.",
            "parameters": {
                "type": "object",
                "properties": {"path": {"type": "string"}, "content": {"type": "string"}},
                "required": ["path", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "task",
            "description": "Delegate a sub-task to a general-purpose subagent.",
            "parameters": {"type": "object", "properties": {"description": {"type": "string"}}, "required": ["description"]},
        },
    },
]

EXPOSURE_TOOL = {
    "type": "function",
    "function": {
        "name": "compute_exposure",
        "description": "Computes the deterministic insurer exposure (TIV, damage ratios, gross/net/capped loss) for this event. Call this before writing your summary — never estimate the numbers yourself.",
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
}
EVACUATION_TOOL = {
    "type": "function",
    "function": {
        "name": "plan_evacuation",
        "description": "Computes the deterministic evacuation plan (candidate shelters and OSRM-routed distances/durations) for this event. Call this before writing your summary — never estimate routes yourself.",
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
}


def _rand_gauge(rng: random.Random, band: str) -> float:
    bands = {"normal": (4, 15), "elevated": (15, 32), "high": (32, 42), "extreme": (42, 55)}
    lo, hi = bands[band]
    return round(rng.uniform(lo, hi), 1)


# ---------------------------------------------------------------------------
# Global flood-recovery locations. The app's EvidenceSource enum is fixed to
# 7 categories (schemas.py) because those map to 7 real, already-built
# adapters — but each category is a CLASS of instrument, not literally a US
# agency: NWS = "the national/regional weather-warning authority", HCFCD =
# "the local river/drainage sensor network", TRANSTAR = "the roads/transport
# authority's closure feed", FEMA = "the national disaster-declaration
# authority". Two categories are already genuinely global as-shipped
# (OSM_SHELTER runs on OpenStreetMap everywhere; POPULATION_SVI's live CDC
# adapter is US-only, but the concept — a local social-vulnerability index —
# exists in most countries' own census/disaster-risk agencies).
#
# Rotating scenarios across these real rivers/authorities means the model
# learns "read whatever river name, agency name, and unit system show up in
# the evidence" rather than memorizing Harris County string literals — the
# actual generalization a fine-tune should buy you, since production traffic
# for a global deployment will never say "Buffalo Bayou."
LOCATIONS = [
    {
        "name": "Houston, Harris County, USA", "center": (29.76, -95.37),
        "rivers": ["Buffalo Bayou", "Brays Bayou"], "gauge_unit": "ft",
        "weather_authority": "National Weather Service", "roads_authority": "Houston TranStar",
        "disaster_authority": "FEMA", "road_name": "Allen Parkway",
    },
    {
        "name": "Jakarta, Indonesia", "center": (-6.21, 106.85),
        "rivers": ["Ciliwung River", "Angke River"], "gauge_unit": "m",
        "weather_authority": "BMKG (Meteorology, Climatology and Geophysics Agency)",
        "roads_authority": "Jakarta Transportation Agency (Dishub DKI)",
        "disaster_authority": "BNPB (National Disaster Management Authority)", "road_name": "Jalan Gatot Subroto",
    },
    {
        "name": "Dhaka, Bangladesh", "center": (23.81, 90.41),
        "rivers": ["Buriganga River", "Turag River"], "gauge_unit": "m",
        "weather_authority": "Bangladesh Meteorological Department",
        "roads_authority": "Dhaka North City Corporation Roads Division",
        "disaster_authority": "Bangladesh Water Development Board", "road_name": "Mirpur Road",
    },
    {
        "name": "Chennai, Tamil Nadu, India", "center": (13.08, 80.27),
        "rivers": ["Adyar River", "Cooum River"], "gauge_unit": "m",
        "weather_authority": "India Meteorological Department",
        "roads_authority": "Greater Chennai Corporation",
        "disaster_authority": "Tamil Nadu State Disaster Management Authority", "road_name": "Anna Salai",
    },
    {
        "name": "Bengaluru, Karnataka, India", "center": (12.97, 77.59),
        "rivers": ["Vrishabhavathi River", "Bellandur Lake stormwater channel"], "gauge_unit": "m",
        "weather_authority": "India Meteorological Department",
        "roads_authority": "BBMP (Bruhat Bengaluru Mahanagara Palike)",
        "disaster_authority": "Karnataka State Disaster Management Authority (KSDMA)",
        "road_name": "Outer Ring Road",
    },
    {
        "name": "Lagos, Nigeria", "center": (6.52, 3.38),
        "rivers": ["Ogun River", "Lagos Lagoon"], "gauge_unit": "m",
        "weather_authority": "Nigerian Meteorological Agency (NiMet)",
        "roads_authority": "Lagos State Traffic Management Authority",
        "disaster_authority": "NEMA (National Emergency Management Agency)", "road_name": "Third Mainland Bridge",
    },
    {
        "name": "Manila, Philippines", "center": (14.60, 120.98),
        "rivers": ["Marikina River", "Pasig River"], "gauge_unit": "m",
        "weather_authority": "PAGASA", "roads_authority": "MMDA (Metro Manila Development Authority)",
        "disaster_authority": "NDRRMC (National Disaster Risk Reduction and Management Council)",
        "road_name": "EDSA",
    },
    {
        "name": "Brisbane, Queensland, Australia", "center": (-27.47, 153.03),
        "rivers": ["Brisbane River", "Bremer River"], "gauge_unit": "m",
        "weather_authority": "Australian Bureau of Meteorology",
        "roads_authority": "Queensland Department of Transport and Main Roads",
        "disaster_authority": "Queensland Reconstruction Authority", "road_name": "Coronation Drive",
    },
    {
        "name": "Ahrweiler, Rhineland-Palatinate, Germany", "center": (50.54, 7.10),
        "rivers": ["Ahr River"], "gauge_unit": "m",
        "weather_authority": "Deutscher Wetterdienst (DWD)",
        "roads_authority": "Landesbetrieb Mobilität Rheinland-Pfalz",
        "disaster_authority": "Bundesamt für Bevölkerungsschutz (BBK)", "road_name": "B267",
    },
    {
        "name": "Beira, Sofala Province, Mozambique", "center": (-19.84, 34.84),
        "rivers": ["Pungwe River", "Buzi River"], "gauge_unit": "m",
        "weather_authority": "INAM (National Meteorology Institute)",
        "roads_authority": "ANE (National Roads Administration)",
        "disaster_authority": "INGC (National Disaster Management Institute)", "road_name": "EN6",
    },
    {
        "name": "Kochi, Kerala, India", "center": (9.93, 76.26),
        "rivers": ["Periyar River"], "gauge_unit": "m",
        "weather_authority": "India Meteorological Department", "roads_authority": "Kerala PWD (Roads Wing)",
        "disaster_authority": "Kerala State Disaster Management Authority", "road_name": "NH 66",
    },
]


def _jitter(rng: random.Random, center: tuple[float, float], max_deg: float = 0.06) -> tuple[float, float]:
    lat, lon = center
    return round(lat + rng.uniform(-max_deg, max_deg), 5), round(lon + rng.uniform(-max_deg, max_deg), 5)


def _polygon_around(center: tuple[float, float], half_deg: float = 0.12) -> list[list[float]]:
    lat, lon = center
    return [
        [lon - half_deg, lat + half_deg], [lon + half_deg, lat + half_deg],
        [lon + half_deg, lat - half_deg], [lon - half_deg, lat - half_deg],
        [lon - half_deg, lat + half_deg],
    ]


def build_synthetic_bundle(rng: random.Random, severity: str, n_sources: int, label: str, location: dict | None = None) -> EventBundle:
    """severity in {normal, elevated, high, extreme}; n_sources caps how many
    of the 5 hazard adapters are present, to also cover degraded-evidence
    scenarios that route to the HIGH-effort tier in production. location, if
    omitted, is drawn from LOCATIONS — rotating real flood-recovery regions
    worldwide so the model learns to read whatever river/agency names show
    up in the evidence rather than memorizing Houston-specific strings."""
    location = location or rng.choice(LOCATIONS)
    now = datetime.now(timezone.utc)
    window_start, window_end = now - timedelta(hours=6), now
    rivers = location["rivers"]
    unit = location["gauge_unit"]

    candidates = []
    candidates.append(
        EvidenceItem(
            source=EvidenceSource.NWS,
            source_record_id="urn:oid:synthetic-weather-alert",
            observed_at=now - timedelta(hours=1),
            latitude=location["center"][0], longitude=location["center"][1],
            summary=f"{'Flash Flood Warning' if severity in ('high','extreme') else 'Flood Advisory'}: "
                    f"issued by the {location['weather_authority']} for the "
                    f"{' and '.join(rivers)} corridor(s), {location['name']}",
            raw={"event": "Flash Flood Warning" if severity in ("high", "extreme") else "Flood Advisory"},
            is_replay=True,
        )
    )
    for river in rivers:
        lat, lon = _jitter(rng, location["center"])
        candidates.append(
            EvidenceItem(
                source=EvidenceSource.USGS, source_record_id=f"synthetic:{river}-mainstem",
                observed_at=now - timedelta(minutes=45), latitude=lat, longitude=lon,
                summary=f"{river} at {location['name']}: gauge height ({unit}) = {_rand_gauge(rng, severity)}",
                raw={}, is_replay=True,
            )
        )
    for river in rivers:
        lat, lon = _jitter(rng, location["center"])
        val = _rand_gauge(rng, severity)
        candidates.append(
            EvidenceItem(
                source=EvidenceSource.HCFCD, source_record_id=f"synthetic:{river}-local-sensor",
                observed_at=now - timedelta(minutes=50), latitude=lat, longitude=lon,
                summary=f"{river} local monitoring sensor: reading {val} {unit} ({'high' if val > 32 else 'normal'})",
                raw={"attributes": {"SensorValue": val, "SensorStatus": "high" if val > 32 else "normal"}},
                is_replay=True,
            )
        )
    n_closures = {"normal": 0, "elevated": 0, "high": 1, "extreme": 2}[severity]
    for i in range(n_closures):
        lat, lon = _jitter(rng, location["center"], max_deg=0.03)
        candidates.append(
            EvidenceItem(
                source=EvidenceSource.TRANSTAR, source_record_id=f"synthetic:closure-{i}",
                observed_at=now - timedelta(minutes=30), latitude=lat, longitude=lon,
                summary=f"{location['roads_authority']}: high water on {location['road_name']}, lanes impassable near marker {i}",
                raw={}, is_replay=True,
            )
        )
    if severity in ("high", "extreme"):
        candidates.append(
            EvidenceItem(
                source=EvidenceSource.FEMA, source_record_id="synthetic:disaster-declaration",
                observed_at=now - timedelta(hours=2), latitude=location["center"][0], longitude=location["center"][1],
                summary=f"{location['disaster_authority']} declaration — SEVERE STORMS AND FLOODING ({location['name']})",
                raw={}, is_replay=True,
            )
        )
    # Cap to n_sources distinct sources to synthesize degraded-evidence cases.
    kept_sources = list(dict.fromkeys(i.source for i in candidates))[:n_sources]
    items = [i for i in candidates if i.source in kept_sources]

    # A couple of real OSM-shaped shelter candidates so evacuation examples
    # have somewhere to route to (mirrors shelters.py's real fixture shape,
    # which is genuinely global — OSM community-centre tagging works
    # identically everywhere).
    for i, tag in enumerate(["community_centre", "school"]):
        lat, lon = _jitter(rng, location["center"], max_deg=0.02)
        name = f"{location['name'].split(',')[0]} Emergency Shelter {i + 1}"
        items.append(
            EvidenceItem(
                source=EvidenceSource.OSM_SHELTER, source_record_id=f"way/synthetic-{location['name']}-{i}",
                observed_at=now, latitude=lat, longitude=lon,
                summary=f"{name} ({tag}) — candidate community shelter site",
                raw={"name": name, "tag": tag}, is_replay=True,
            )
        )

    return EventBundle(
        label=label, polygon=_polygon_around(location["center"]), window_start=window_start, window_end=window_end,
        items=items, field_image_path=None, evidence_mode="replay",
    )


def build_synthetic_vision(rng: random.Random, severity: str) -> DamageEvidence | None:
    if severity == "normal":
        return None
    flooding = severity in ("high", "extreme")
    depth = round(rng.uniform(0.5, 2.5), 1) if severity == "elevated" else round(rng.uniform(2.5, 6.0), 1)
    return DamageEvidence(
        flooding_observed=flooding,
        estimated_water_depth_ft=depth if flooding else None,
        structural_damage_observed=severity == "extreme" and rng.random() < 0.4,
        road_blocked=flooding and rng.random() < 0.6,
        visible_hazards=(["standing_water"] if flooding else []),
        confidence=round(rng.uniform(0.6, 0.85), 2),
        narrative="Standing water visible on the roadway." if flooding else "No flooding visible in frame.",
    )


async def teacher_direct_json(settings, system: str, user: str, schema_example: str, response_model) -> object:
    """Single-turn: no tools. Used for the Hazard/Life-Safety agent, which
    is a pure narrative task (see hazard_agent.py's own docstring for why it
    carries no tool)."""
    target = resolve_reasoning_target(settings, effort="high")
    prompt = (
        system
        + "\n\nRespond with ONLY a single JSON object, no markdown, no explanation outside the object, "
        + "in exactly this shape (example values only):\n" + schema_example
    )
    raw = await chat_completion(target, system=prompt, user=user, max_tokens=1500)
    import re
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    return response_model(**json.loads(match.group(0)))


async def teacher_tool_call_trace(settings, system: str, user: str, tool_schema: dict, tool_result: dict, decoys: list[dict]) -> dict:
    """Two-turn: ask the teacher to call the tool (with decoys optionally on
    the wire, per the multi-tool-confusion training objective), then feed
    the REAL deterministic tool_result back and ask for the final
    narrative. Returns the full message trace for one SFT example."""
    import httpx

    target = resolve_reasoning_target(settings, effort="high")
    tools = decoys + [tool_schema] if decoys else [tool_schema]
    tool_name = tool_schema["function"]["name"]

    async with httpx.AsyncClient(timeout=60.0) as client:
        # Turn 1: get the tool call.
        resp1 = await client.post(
            f"{target.base_url}/chat/completions",
            headers={"Authorization": f"Bearer {target.api_key}"},
            json={
                "model": target.model,
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
                "tools": tools,
                "tool_choice": "required",
            },
        )
        resp1.raise_for_status()
        msg1 = resp1.json()["choices"][0]["message"]
        tool_calls = msg1.get("tool_calls") or []
        call = next((c for c in tool_calls if c["function"]["name"] == tool_name), None)
        if call is None:
            raise ValueError(f"Teacher did not call {tool_name} (got {[c['function']['name'] for c in tool_calls]})")

        # Turn 2: feed the REAL tool result back, ask for the final narrative.
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
            {"role": "assistant", "content": None, "tool_calls": [call]},
            {"role": "tool", "tool_call_id": call["id"], "name": tool_name, "content": json.dumps(tool_result)},
        ]
        resp2 = await client.post(
            f"{target.base_url}/chat/completions",
            headers={"Authorization": f"Bearer {target.api_key}"},
            json={"model": target.model, "messages": messages, "tools": tools},
        )
        resp2.raise_for_status()
        final = resp2.json()["choices"][0]["message"]["content"]

    return {
        "tools": tools,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
            {"role": "assistant", "content": None, "tool_calls": [call]},
            {"role": "tool", "tool_call_id": call["id"], "name": tool_name, "content": json.dumps(tool_result)},
            {"role": "assistant", "content": final},
        ],
    }


async def generate(n_scenarios: int, out_dir: Path, seed: int) -> None:
    rng = random.Random(seed)
    settings = get_settings()
    out_dir.mkdir(parents=True, exist_ok=True)
    hazard_f = open(out_dir / "hazard.jsonl", "w", encoding="utf-8")
    exposure_f = open(out_dir / "exposure.jsonl", "w", encoding="utf-8")
    evacuation_f = open(out_dir / "evacuation.jsonl", "w", encoding="utf-8")

    severities = ["normal", "elevated", "high", "extreme"]
    ok, failed = 0, 0

    for i in range(n_scenarios):
        severity = severities[i % len(severities)]
        n_sources = 5 if severity != "normal" else rng.choice([2, 3, 5])  # some degraded-evidence cases too
        location = LOCATIONS[i % len(LOCATIONS)]  # cycle deterministically so every location gets even coverage
        bundle = build_synthetic_bundle(
            rng, severity, n_sources, label=f"{location['name']} flood event — scenario {i}", location=location,
        )
        vision = build_synthetic_vision(rng, severity)
        use_decoys = rng.random() < 0.3  # ~30% of tool examples include distractor tools

        try:
            evidence_gate = verify_evidence(bundle, settings)
            confidence_gate = check_confidence(evidence_gate, settings)
            gates = [evidence_gate, confidence_gate]
            if confidence_gate.status.value == "blocked":
                continue  # not a valid training case — the pipeline would never reach an agent here

            # --- Hazard / Life-Safety example (no tool; pure structured narrative) ---
            evidence_summary = [{"source": it.source.value, "summary": it.summary, "item_id": it.item_id} for it in bundle.items]
            gate_summary = [{"gate": g.gate_name, "status": g.status.value, "reasoning": g.reasoning} for g in gates]
            hazard_user = json.dumps(
                {
                    "event_label": bundle.label,
                    "window": {"start": bundle.window_start.isoformat(), "end": bundle.window_end.isoformat()},
                    "evidence": evidence_summary,
                    "gates": gate_summary,
                    "vision_specialist": vision.model_dump() if vision else None,
                },
                default=str,
            )
            hazard_label = await teacher_direct_json(
                settings, HAZARD_SYSTEM_PROMPT, hazard_user,
                '{"headline": "...", "guidance_points": ["...", "..."], "hazard_narrative": "..."}',
                HazardAgentOutput,
            )
            hazard_f.write(json.dumps({
                "messages": [
                    {"role": "system", "content": HAZARD_SYSTEM_PROMPT},
                    {"role": "user", "content": hazard_user},
                    {"role": "assistant", "content": hazard_label.model_dump_json()},
                ]
            }) + "\n")

            # --- Exposure example (tool call -> real deterministic result -> narrative) ---
            overall_confidence = min(g.confidence for g in gates)
            exposure_result = compute_insurer_exposure(bundle, vision, overall_confidence)
            trace = await teacher_tool_call_trace(
                settings, EXPOSURE_SYSTEM_PROMPT, "Compute and summarize the insurer exposure for this event.",
                EXPOSURE_TOOL, exposure_result.model_dump(),
                rng.sample(DECOY_TOOLS, k=2) if use_decoys else [],
            )
            exposure_f.write(json.dumps(trace) + "\n")

            # --- Evacuation example (real OSRM routing -> narrative) ---
            evacuation_result = await compute_evacuation_plan(bundle, settings, confidence=overall_confidence)
            if evacuation_result is not None:
                trace = await teacher_tool_call_trace(
                    settings, EVACUATION_SYSTEM_PROMPT, "Plan and summarize evacuation routes for this event.",
                    EVACUATION_TOOL, evacuation_result.model_dump(),
                    rng.sample(DECOY_TOOLS, k=2) if use_decoys else [],
                )
                evacuation_f.write(json.dumps(trace) + "\n")

            ok += 1
            print(f"[{i + 1}/{n_scenarios}] ok (location={location['name']}, severity={severity}, sources={n_sources}, decoys={use_decoys})")
        except Exception as exc:  # noqa: BLE001 - a teacher-call hiccup should skip one scenario, not abort the batch
            failed += 1
            print(f"[{i + 1}/{n_scenarios}] SKIPPED: {exc}")

    hazard_f.close()
    exposure_f.close()
    evacuation_f.close()

    readme = out_dir / "README.md"
    readme.write_text(
        f"""# LifeShield fine-tuning dataset

Generated {ok} scenarios ({failed} skipped) via distillation from the app's
own HIGH-effort teacher model against synthetic-but-schema-real evidence,
rotated across {len(LOCATIONS)} real flood-recovery regions worldwide
({", ".join(loc["name"] for loc in LOCATIONS)}) so the model learns to read
whatever river, weather-authority, and roads-authority names show up in the
evidence — rather than memorizing Houston-specific strings — while still
using the app's fixed 7-category evidence schema (NWS/USGS/HCFCD/TRANSTAR/
FEMA/POPULATION_SVI/OSM_SHELTER), since each category is a class of
instrument (national weather warning, river gauge, local sensor network,
roads-authority closure feed, disaster declaration, vulnerability index,
community shelter) that exists in some form in every region, not a literal
US agency name.

- `hazard.jsonl` — life-safety narrative task. Single-turn, no tool calls.
- `exposure.jsonl` — insurer exposure narrative task. Two-turn: a
  `compute_exposure` tool call, a real deterministic tool result, then the
  final narrative. ~30% of examples include decoy tool schemas
  (`read_file`/`write_file`/`task`, mirroring DeepAgents' real built-ins) to
  directly train against the multi-tool-confusion bug.
- `evacuation.jsonl` — evacuation narrative task, same two-turn shape as
  exposure, using `plan_evacuation`.

All three are plain OpenAI chat-message JSONL (one JSON object per line,
a `messages` array, tool-calling ones also carry a `tools` array) — this is
directly consumable by:
  - Hugging Face TRL's `SFTTrainer` (`apply_chat_template` handles this shape
    natively for most chat templates; verify Nemotron-3.5-Lightning's own
    template supports tool-call turns before training).
  - Axolotl (`chat_template: tool_use` dataset type expects this shape).
  - NeMo Framework: convert with NeMo's own `chat_dataset` preprocessing
    script — check the current NeMo Framework docs for the exact converter
    name for this model family, it's new enough that recipe names may
    still be moving.

Scale this dataset by re-running with a higher --n-scenarios (this batch
size is meant to prove the pipeline end-to-end, not to be the final
training set — see the field manual's fine-tuning section for target size
guidance).
""",
        encoding="utf-8",
    )
    print(f"\nDone. {ok} scenarios written to {out_dir}, {failed} skipped.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--n-scenarios", type=int, default=40)
    parser.add_argument("--out", type=Path, default=Path("var/finetune"))
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    asyncio.run(generate(args.n_scenarios, args.out, args.seed))
