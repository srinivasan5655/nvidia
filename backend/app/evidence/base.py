"""
Shared adapter contract for the Evidence Layer.

Guardrail from the pptx: "Agents never consume raw websites or databases —
they receive validated tools and evidence records." Concretely: adapters are
the ONLY code that talks to the outside world (or fixture files). Everything
downstream (gates, specialists, decision agents) only ever sees `EvidenceItem`
objects that have already been through `validate()`.

Every adapter supports two modes, selected by Settings.evidence_mode:
  - live()   real HTTP call to the public source
  - replay() read a committed JSON fixture (used for today's demo + CI)

Both paths converge on the same `normalize()` method, so a swap from replay to
live never changes the evidence contract the agents rely on — exactly the
mitigation the deck promises for the TranStar access blocker.
"""
from __future__ import annotations

import abc
import json
import logging
from pathlib import Path
from typing import Any

import httpx

from app.config import FIXTURES_DIR, Settings
from app.models.schemas import EvidenceItem, EvidenceSource

logger = logging.getLogger("lifeshield.evidence")


class EvidenceAdapterError(RuntimeError):
    """Raised when a source is unreachable or returns something we can't trust."""


class EvidenceAdapter(abc.ABC):
    source: EvidenceSource
    fixture_filename: str

    def __init__(self, settings: Settings, http_client: httpx.AsyncClient | None = None):
        self.settings = settings
        self._client = http_client

    async def fetch(self, *, polygon: list[list[float]], window_start, window_end) -> list[EvidenceItem]:
        """Entry point used by the evidence builder. Chooses live vs replay."""
        if self.settings.evidence_mode == "replay":
            raw_records = self._load_fixture()
        else:
            try:
                raw_records = await self._fetch_live(polygon=polygon, window_start=window_start, window_end=window_end)
            except (httpx.HTTPError, EvidenceAdapterError) as exc:
                logger.warning("%s live fetch failed (%s); falling back to replay fixture", self.source.value, exc)
                raw_records = self._load_fixture()
        return [self._normalize(r, is_replay=self.settings.evidence_mode == "replay") for r in raw_records]

    def _load_fixture(self) -> list[dict[str, Any]]:
        path = FIXTURES_DIR / self.fixture_filename
        if not path.exists():
            raise EvidenceAdapterError(f"No replay fixture at {path}")
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data["records"]

    @abc.abstractmethod
    async def _fetch_live(self, *, polygon: list[list[float]], window_start, window_end) -> list[dict[str, Any]]:
        """Call the real public API and return source-shaped raw records."""

    @abc.abstractmethod
    def _normalize(self, raw: dict[str, Any], *, is_replay: bool) -> EvidenceItem:
        """Convert one raw source record into the shared EvidenceItem envelope."""
