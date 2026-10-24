"""Global Edity model preference, shared by all projects and AI features."""

import json
import logging
import os
import re
import subprocess
import sys
import threading
import time
from pathlib import Path
from uuid import uuid4

logger = logging.getLogger(__name__)
_lock = threading.RLock()
_catalog_lock = threading.Lock()
_catalog: dict = {}


def _settings_path() -> Path:
    if os.name == "nt":
        base = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local")
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path(os.environ.get("XDG_CONFIG_HOME") or Path.home() / ".config")
    return base / "Edity" / "ai-settings.json"


def validate_model(value: str) -> str:
    value = value.strip()
    if value and not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}", value):
        raise ValueError("Enter a valid model ID (up to 128 characters)")
    return value


def validate_effort(value: str) -> str:
    value = value.strip()
    if value and not re.fullmatch(r"[a-z][a-z0-9_]{0,31}", value):
        raise ValueError("Enter a valid reasoning effort level")
    return value


def read_ai_settings() -> dict:
    with _lock:
        try:
            data = json.loads(_settings_path().read_text(encoding="utf-8"))
            model = validate_model(data.get("model", ""))
            last = data.get("last_used_model", "")
            return {"model": model, "reasoning_effort": validate_effort(data.get("reasoning_effort", "medium")),
                    "last_used_model": last if isinstance(last, str) else ""}
        except (OSError, ValueError, TypeError, AttributeError):
            # Preserve the effort used by Edity before the selector was added.
            return {"model": "", "reasoning_effort": "medium", "last_used_model": ""}


def _write(data: dict) -> None:
    target = _settings_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(f"{target.name}.{uuid4().hex}.tmp")
    try:
        temporary.write_text(json.dumps(data), encoding="utf-8")
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)


def save_ai_model(model: str, reasoning_effort: str | None = None) -> dict:
    model = validate_model(model)
    if reasoning_effort is not None:
        reasoning_effort = validate_effort(reasoning_effort)
    with _lock:
        data = read_ai_settings()
        if model != data["model"]:
            data["last_used_model"] = ""
        data["model"] = model
        if reasoning_effort is not None:
            data["reasoning_effort"] = reasoning_effort
        _write(data)
        return data


def record_used_model(configured: str, actual: str) -> None:
    with _lock:
        data = read_ai_settings()
        if data["model"] == configured and data["last_used_model"] != actual:
            data["last_used_model"] = actual
            try:
                _write(data)
            except OSError:
                logger.warning("Could not record the last used AI model")


def codex_model_catalog(executable: str | None, refresh: bool = False) -> dict:
    if not executable:
        return {"models": [], "catalog_error": "Install Codex CLI to load its model catalog."}
    with _catalog_lock:
        if not refresh and _catalog.get("executable") == executable and time.monotonic() < _catalog.get("expires", 0):
            return _catalog["result"]
        try:
            completed = subprocess.run([executable, "debug", "models"], capture_output=True,
                                       text=True, encoding="utf-8", errors="replace", timeout=30,
                                       creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
                                       check=True)
            raw = json.loads(completed.stdout)
            models = sorted((item for item in raw.get("models", [])
                             if item.get("visibility") == "list" and item.get("slug")),
                            key=lambda item: item.get("priority", 1000))
            result = {"models": [{"id": item["slug"], "name": item.get("display_name") or item["slug"],
                                  "default_effort": item.get("default_reasoning_level", ""),
                                  "effort_levels": [{"id": level["effort"], "description": level.get("description", "")}
                                                    for level in item.get("supported_reasoning_levels", [])
                                                    if level.get("effort")]}
                                 for item in models], "catalog_error": ""}
        except (OSError, subprocess.SubprocessError, ValueError, TypeError, AttributeError):
            result = {"models": [], "catalog_error": "Could not load the CLI catalog. You can enter a model ID manually."}
        _catalog.update(executable=executable, result=result, expires=time.monotonic() + (300 if result["models"] else 15))
        return result
