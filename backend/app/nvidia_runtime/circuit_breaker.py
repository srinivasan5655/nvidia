"""
A small, real circuit breaker for the DeepAgents call path.

Why this exists, concretely: every DeepAgents attempt in this app (hazard,
exposure, evacuation, vision) already has a fallback for when it fails —
but until now, every single pipeline run still PAID for that failure fresh
each time. Verified live, repeatedly, this session: the DeepAgents
multi-tool call reliably times out around 10s on this NVIDIA account (a
LangGraph tool-binding issue, not a transient blip — see
vision_specialist.py's module docstring), so a run with 4 agents wasted
~40s every time just discovering what was already known from the previous
run. A circuit breaker is the correct pattern for a PERSISTENT failure
like this — retrying a call that fails the same way every time only adds
latency; a breaker that opens after a few real failures and skips
straight to the proven fallback is what actually fixes it.

Deliberately NOT a generic library dependency: this is ~40 lines because
that's genuinely all the pattern needs here — one process, one circuit,
no distributed state.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field

logger = logging.getLogger("lifeshield.circuit_breaker")


@dataclass
class CircuitBreaker:
    """CLOSED (normal) -> OPEN (skip attempts) after `failure_threshold`
    consecutive failures -> HALF_OPEN (allow exactly one probe attempt)
    once `cooldown_seconds` has elapsed since it opened -> CLOSED again on
    a successful probe, or back to OPEN (cooldown restarts) on another
    failure."""

    name: str
    failure_threshold: int = 3
    cooldown_seconds: float = 300.0
    _consecutive_failures: int = field(default=0, init=False)
    _opened_at: float | None = field(default=None, init=False)
    _probe_in_flight: bool = field(default=False, init=False)

    def allow_attempt(self) -> bool:
        """True if the caller should actually attempt the guarded call this
        time. False means: skip straight to the fallback, don't spend the
        latency finding out again."""
        if self._opened_at is None:
            return True  # CLOSED

        elapsed = time.monotonic() - self._opened_at
        if elapsed < self.cooldown_seconds:
            return False  # OPEN, still cooling down

        if self._probe_in_flight:
            # Another call already claimed this window's probe attempt —
            # everyone else stays on the fast fallback path until it resolves.
            return False

        self._probe_in_flight = True  # HALF_OPEN: this caller gets the one probe
        return True

    def record_success(self) -> None:
        if self._opened_at is not None:
            logger.info("Circuit breaker '%s' closing — probe succeeded.", self.name)
        self._consecutive_failures = 0
        self._opened_at = None
        self._probe_in_flight = False

    def record_failure(self) -> None:
        self._probe_in_flight = False
        self._consecutive_failures += 1
        if self._opened_at is not None:
            # Failed probe: restart the cooldown window rather than hammering.
            self._opened_at = time.monotonic()
            logger.info("Circuit breaker '%s' probe failed — cooldown restarted.", self.name)
        elif self._consecutive_failures >= self.failure_threshold:
            self._opened_at = time.monotonic()
            logger.warning(
                "Circuit breaker '%s' opening after %d consecutive failures — "
                "skipping this call path for %.0fs and using the fallback directly.",
                self.name,
                self._consecutive_failures,
                self.cooldown_seconds,
            )

    @property
    def state(self) -> str:
        if self._opened_at is None:
            return "closed"
        if time.monotonic() - self._opened_at < self.cooldown_seconds:
            return "open"
        return "half_open"


# One shared breaker per DeepAgents call family — all four agents
# (hazard/life-safety, exposure, evacuation, vision) hit the same
# LangGraph tool-binding failure mode on this account, so one circuit
# reflects reality: if one just failed, the others are about to too.
deepagents_breaker = CircuitBreaker(name="deepagents", failure_threshold=3, cooldown_seconds=300.0)
