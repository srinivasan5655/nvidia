"""
OpenShell-sandboxed LangChain DeepAgents specialists.

This is the "OpenShell specialists" layer from the pptx: any agent that does
open-ended reasoning or tool use (as opposed to the deterministic gates in
app/agents/gates.py, which are plain Python) runs inside an OpenShell sandbox
so a misbehaving prompt/response can't touch the host filesystem, network, or
the FastAPI process's own memory. Architecture mirrors
github.com/langchain-ai/openshell-deepagent: OpenShell owns the isolated,
policy-governed Linux environment; DeepAgents owns planning/tool-calling on
top of it; the LLM itself is NVIDIA NIM (build.nvidia.com or self-hosted),
via the NVIDIA-maintained `langchain_nvidia_ai_endpoints.ChatNVIDIA`.

Verified against installed packages:
  - `openshell.SandboxClient(endpoint, bearer_token=...)` — connects to a
    running OpenShell cluster (NOT available from this dev sandbox; requires
    the team's actual OpenShell deployment, reached over WSL2 on Windows per
    the AXIS Curiosity docs — OpenShell has no native Windows CLI).
  - `openshell.Sandbox(workspace=..., cluster=..., delete_on_exit=...)` —
    describes/creates one sandbox session.
  - `deepagents.create_deep_agent(model=..., tools=..., system_prompt=...)` —
    returns a compiled LangGraph graph; `model` accepts a BaseChatModel, so we
    pass a `ChatNVIDIA` instance pointed at whichever target Switchyard
    resolved for this environment.

Degraded mode: when `settings.openshell_enabled` is False (default — no live
OpenShell cluster reachable from a dev laptop), specialists still run for
real against NIM, just without the sandbox execution envelope. This is a
correctness/security degradation, not a fake stub — the LLM call, the tool
calls, and the structured output are all real. The OpenShell supervisor gate
(app/agents/gates.py) records whether a run was sandboxed and treats
un-sandboxed specialist output as lower-trust evidence for the policy
verifier.
"""
from __future__ import annotations

import logging
from contextlib import contextmanager
from typing import Any, Iterator, Sequence

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_nvidia_ai_endpoints import ChatNVIDIA

from app.config import Settings
from app.nvidia_runtime.switchyard_router import resolve_reasoning_target, resolve_vision_target

logger = logging.getLogger("lifeshield.openshell")

try:
    import openshell
except ImportError:  # pragma: no cover
    openshell = None  # type: ignore


def _nim_chat_model(settings: Settings, *, vision: bool = False) -> BaseChatModel:
    target = resolve_vision_target(settings) if vision else resolve_reasoning_target(settings)
    return ChatNVIDIA(model=target.model, api_key=target.api_key or "not-required", base_url=target.base_url)


@contextmanager
def sandbox_session(settings: Settings, *, name: str) -> Iterator[dict[str, Any]]:
    """Open (or no-op through) one OpenShell sandbox for a specialist run.

    Yields a dict describing what actually happened, e.g.
    {"sandboxed": True, "sandbox_id": "..."} or {"sandboxed": False, "reason": "..."}
    so the OpenShell supervisor gate can score trust accordingly."""
    if not (settings.openshell_enabled and openshell and settings.openshell_endpoint):
        yield {"sandboxed": False, "reason": "OpenShell not configured for this environment"}
        return

    client = openshell.SandboxClient(
        settings.openshell_endpoint,
        bearer_token=settings.openshell_bearer_token,
        cluster_name=settings.openshell_cluster,
    )
    session = None
    try:
        # create_session() creates the sandbox AND returns a ready-to-use
        # SandboxSession (exec/exec_python bound to that sandbox).
        session = client.create_session(workspace=settings.openshell_workspace, name=f"lifeshield-{name}")
        logger.info("OpenShell sandbox session active for specialist '%s'", name)
        yield {"sandboxed": True, "sandbox_id": getattr(session, "sandbox_id", str(session)), "session": session}
    except Exception as exc:  # pragma: no cover - depends on live cluster
        logger.warning("OpenShell sandbox unavailable (%s); specialist '%s' running un-sandboxed.", exc, name)
        yield {"sandboxed": False, "reason": str(exc)}
    finally:
        if session is not None:
            try:
                client.delete(getattr(session, "sandbox_id", session))
            except Exception:  # pragma: no cover
                pass
        client.close()


def build_specialist(
    settings: Settings,
    *,
    name: str,
    system_prompt: str,
    tools: Sequence[Any] = (),
    vision: bool = False,
):
    """Construct one OpenShell-flavored DeepAgents specialist bound to NIM."""
    model = _nim_chat_model(settings, vision=vision)
    return build_deep_agent(model=model, system_prompt=system_prompt, tools=list(tools), name=name)


def build_deep_agent(*, model: BaseChatModel, system_prompt: str, tools: list[Any], name: str):
    import deepagents

    return deepagents.create_deep_agent(
        model=model,
        tools=tools,
        system_prompt=system_prompt,
        name=name,
    )
