"""
Portfolio PML (Probable Maximum Loss) rollup — sums the SAME already-final
InsurerExposureOutput numbers across every run currently held (see
decision/approval.py), grouped by city and by decision status. Pure
aggregation: zero new computation of any per-policy number, and no risk of
double-counting since each event's own exposure total is only summed once
regardless of how many times this endpoint is called.
"""
from __future__ import annotations

from collections import defaultdict

from app.decision import approval
from app.models.schemas import PortfolioPmlResult


def compute_portfolio_pml() -> PortfolioPmlResult:
    runs = approval.list_runs()
    total_exposure = 0.0
    total_tiv = 0.0
    by_city: dict[str, float] = defaultdict(float)
    by_status: dict[str, float] = defaultdict(float)
    counted = 0
    for run in runs:
        if not run.insurer_exposure:
            continue
        counted += 1
        total_exposure += run.insurer_exposure.total_estimated_exposure
        total_tiv += run.insurer_exposure.total_tiv_in_footprint
        by_city[run.event.city_label] += run.insurer_exposure.total_estimated_exposure
        by_status[run.overall_status] += run.insurer_exposure.total_estimated_exposure
    return PortfolioPmlResult(
        total_events=counted,
        aggregate_estimated_exposure=round(total_exposure, 2),
        aggregate_tiv=round(total_tiv, 2),
        by_city={k: round(v, 2) for k, v in by_city.items()},
        by_status={k: round(v, 2) for k, v in by_status.items()},
    )
