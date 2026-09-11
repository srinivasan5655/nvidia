"""Flood/damage vision specialist executed *inside* an OpenShell sandbox.

This module is deliberately stdlib-only (no Pillow, no network calls) so it
can run unmodified inside a minimal, network-isolated OpenShell sandbox: the
supervisor (``app.agents.openshell_supervisor``) uploads this file plus the
field image into a freshly created sandbox over the gRPC exec channel and
runs it as ``python3 -m specialists.flood_vision --image <path>``.

It inspects the raw JPEG bytes for a crude, fully-explainable brightness /
variance signal instead of calling a trained model. That keeps the OpenShell
integration honest end-to-end (real sandbox, real uploaded image, real
subprocess, real stdout parsed back into ``DamageEvidence``) without
depending on sandbox network egress to reach a NIM endpoint. Swap the body
of ``analyze()`` for a real NIM/vision-model call once the sandbox's network
policy is opened up to the inference route.
"""
from __future__ import annotations

import argparse
import json


def _byte_stats(data: bytes) -> tuple[float, float]:
    """Mean and standard deviation of the raw byte stream (brightness/texture proxy)."""
    if not data:
        return 0.0, 0.0
    n = len(data)
    mean = sum(data) / n
    variance = sum((b - mean) ** 2 for b in data) / n
    return mean, variance**0.5


def analyze(image_path: str) -> dict:
    with open(image_path, "rb") as fh:
        data = fh.read()

    mean, stdev = _byte_stats(data)
    size_kb = len(data) / 1024

    # Deterministic, explainable heuristic (NOT a trained model): darker,
    # higher-variance frames score as more likely to show standing water /
    # structural damage. Intentionally conservative; this exists to prove
    # the sandboxed execution path end-to-end, not to be production-grade
    # damage detection.
    flooding_observed = mean < 110
    structural_damage_observed = stdev > 55
    road_blocked = flooding_observed and stdev < 40
    confidence = round(max(0.2, min(0.85, (abs(mean - 128) + stdev) / 200)), 3)

    hazards = []
    if flooding_observed:
        hazards.append("standing_water")
    if structural_damage_observed:
        hazards.append("possible_structural_damage")
    if road_blocked:
        hazards.append("road_blocked")

    narrative = (
        f"OpenShell-sandboxed heuristic scan of {size_kb:.1f}KB field image "
        f"(byte-mean={mean:.1f}, stdev={stdev:.1f}): "
        + ("flooding signal detected" if flooding_observed else "no strong flooding signal")
    )

    return {
        "flooding_observed": flooding_observed,
        "estimated_water_depth_ft": None,
        "structural_damage_observed": structural_damage_observed,
        "road_blocked": road_blocked,
        "visible_hazards": hazards,
        "confidence": confidence,
        "narrative": narrative,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True)
    args = parser.parse_args()

    try:
        result = analyze(args.image)
    except Exception as exc:  # noqa: BLE001 - never crash silently, emit a degraded record
        result = {
            "flooding_observed": False,
            "estimated_water_depth_ft": None,
            "structural_damage_observed": False,
            "road_blocked": False,
            "visible_hazards": [],
            "confidence": 0.0,
            "narrative": f"[sandboxed specialist error] {exc}",
        }

    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
