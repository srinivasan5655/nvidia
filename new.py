"""
Sample client for the vLLM OpenAI-compatible server running on Curiosity v2,
reached through the JupyterHub proxy.

IMPORTANT — this proxy URL is session-specific:
  https://curiosity-hub-raplabhackathon.axisapps.io/user/<your-username>/proxy/<port>/
The <your-username> segment (currently gsh-szbbw) and the working-copy host/path
(dgx08, /storage/hackathon_teams/gsh-team11/nvidia/...) can change between
JupyterHub sessions — re-read the actual URL from the browser bar each time you
restart a session rather than hardcoding this one long-term.

This assumes vLLM was launched with `--port 8000 --host 0.0.0.0` inside the
session (see vllm-curiosity-v2-setup.md, step 3 — adjust the port there to 8000
to match what's actually running).
"""

import os
from openai import OpenAI

# Base URL = the JupyterHub proxy path + vLLM's OpenAI-compatible prefix.
# vLLM serves its OpenAI-style API under /v1, so that goes after the proxy path.
BASE_URL = "https://curiosity-hub-raplabhackathon.axisapps.io/user/gsh-szbbw/proxy/8000/v1"

# vLLM's OpenAI server accepts any non-empty string as the API key by default
# unless you launched it with --api-key set — if you did, put the real value
# in an env var instead of hardcoding it.
API_KEY = os.environ.get("VLLM_API_KEY", "not-needed")

client = OpenAI(base_url=BASE_URL, api_key=API_KEY)


def list_models() -> None:
    """Confirm the server is reachable and see the exact model id it's serving."""
    models = client.models.list()
    for m in models.data:
        print(m.id)


def chat(prompt: str, model_id: str) -> str:
    """Send a single chat completion request."""
    response = client.chat.completions.create(
        model=model_id,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        max_tokens=256,
    )
    return response.choices[0].message.content


def chat_stream(prompt: str, model_id: str) -> None:
    """Same request, streamed token-by-token."""
    stream = client.chat.completions.create(
        model=model_id,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        max_tokens=256,
        stream=True,
    )
    for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            print(delta, end="", flush=True)
    print()


if __name__ == "__main__":
    print("Checking server + model id...")
    list_models()

    # Replace with the exact id printed above — vLLM requires an exact match,
    # it won't fuzzy-match a Nemotron variant name.
    MODEL_ID = "<paste-the-model-id-from-list_models()-output>"

    print("\nNon-streaming response:")
    print(chat("ping", MODEL_ID))

    print("\nStreaming response:")
    chat_stream("Give me one sentence about flood evidence verification.", MODEL_ID)