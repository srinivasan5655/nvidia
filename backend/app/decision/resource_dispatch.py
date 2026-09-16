"""
Resource Dispatch Priority — ranks the SAME candidate shelters the
Evacuation Plan already routes to, but answers a different question: not
"where should someone evacuate to" (nearest first) but "which shelter
should a duty officer staff/resupply FIRST" (biggest plausible impact per
unit of response effort).

Honest scope note: OSM shelter data in this footprint doesn't carry a real
capacity figure (see evidence/shelters.py's own docstring on shelter-roster
completeness), and this app has no per-shelter catchment-population model —
building one properly needs real Voronoi/network-distance population
allocation, out of scope here. Instead this uses an ILLUSTRATIVE capacity
baseline by facility type (a named, documented assumption, never presented
as measured) combined with the real area-weighted SVI percentile already
computed for this event and the real distance from the OSRM-routed
Evacuation Plan. Every number here is deterministic; nothing is
model-generated.
"""
from __future__ import annotations

from app.models.schemas import (
    EvacuationPlan,
    EventBundle,
    EvidenceSource,
    ResourceDispatchPlan,
    ShelterDispatchPriority,
)

# Illustrative baseline capacity by OSM tag, pending real per-site intake
# data — documented here, never silently assumed to be measured.
_CAPACITY_BY_TAG = {
    "community_centre": 300,
    "shelter": 150,
}
_DEFAULT_CAPACITY = 150


def _capacity_for(tag: str | None) -> int:
    return _CAPACITY_BY_TAG.get((tag or "").lower(), _DEFAULT_CAPACITY)


def _svi_percentile(bundle: EventBundle) -> float:
    for item in bundle.items:
        if item.source == EvidenceSource.POPULATION_SVI:
            raw = item.raw if isinstance(item.raw, dict) else {}
            val = raw.get("area_weighted_svi_percentile") or raw.get("svi_percentile")
            if isinstance(val, (int, float)):
                return float(val)
    return 0.5  # no SVI evidence available for this run -> neutral weight, not zero


def compute_resource_dispatch_plan(
    bundle: EventBundle, evacuation_plan: EvacuationPlan | None
) -> ResourceDispatchPlan | None:
    """None whenever the Evacuation Plan itself is None — nothing to
    prioritize among zero candidate shelters."""
    if not evacuation_plan or not evacuation_plan.routes:
        return None
    svi = _svi_percentile(bundle)
    shelter_by_id = {i.item_id: i for i in bundle.items if i.source == EvidenceSource.OSM_SHELTER}

    scored: list[ShelterDispatchPriority] = []
    for route in evacuation_plan.routes:
        shelter_item = shelter_by_id.get(route.shelter_item_id)
        tag = shelter_item.raw.get("tag") if shelter_item else None
        capacity = _capacity_for(tag)
        distance = max(route.distance_km, 0.1)
        priority_score = round((capacity * (1 + svi)) / distance, 1)
        scored.append(
            ShelterDispatchPriority(
                shelter_item_id=route.shelter_item_id,
                shelter_name=route.shelter_name,
                distance_km=route.distance_km,
                capacity_illustrative=capacity,
                priority_score=priority_score,
                rank=0,
            )
        )
    scored.sort(key=lambda s: s.priority_score, reverse=True)
    for i, s in enumerate(scored):
        s.rank = i + 1

    methodology = (
        "priority_score = (illustrative_capacity_by_facility_type * (1 + area-weighted SVI percentile)) / "
        "distance_km, over the same OSRM-routed shelters as the Evacuation Plan. Capacity is an illustrative "
        "baseline by facility type (community_centre=300, shelter=150), not a measured per-site figure — "
        "see this module's docstring."
    )
    return ResourceDispatchPlan(event_id=bundle.event_id, shelters=scored, methodology=methodology)
