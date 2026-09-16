import uvicorn

if __name__ == "__main__":
    # reload=True is deliberately OFF. Verified root cause of a real,
    # session-breaking bug on this machine: uvicorn's --reload spawns its
    # watcher/worker subprocess, and on this Windows box that subprocess
    # sometimes resolves to the Microsoft Store Python alias
    # (WindowsApps\PythonSoftwareFoundation.Python.3.12_.../python.exe)
    # instead of this venv's interpreter — a broken worker that can bind a
    # duplicate listener on :8000 (Windows allows this via SO_REUSEADDR)
    # and either hangs or serves inconsistent responses, while surviving
    # Stop-Process/taskkill by PID because the PID Windows' connection
    # table reports for the listening socket doesn't reliably match the
    # PID the owning process is later found under. Symptom on the frontend:
    # every screen showing empty/dummy data because requests are being
    # served (or silently dropped) by the broken worker, not the real one.
    # Restart manually (Ctrl+C, rerun) after an edit instead of relying on
    # autoreload — a small cost against randomly-broken screens.
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=False)
