#!/bin/bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This setup script is for macOS." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if ! command -v brew >/dev/null 2>&1; then
  echo "Install Homebrew first: https://brew.sh" >&2
  exit 1
fi

brew install ffmpeg python@3.11
if ! command -v node >/dev/null 2>&1; then brew install node; fi
PYTHON="$(brew --prefix python@3.11)/bin/python3.11"
ENV_ROOT="$HOME/Library/Application Support/Edity/venv"
mkdir -p "$(dirname "$ENV_ROOT")"
"$PYTHON" -m venv "$ENV_ROOT"
"$ENV_ROOT/bin/python" -m pip install --upgrade pip setuptools wheel
"$ENV_ROOT/bin/python" -m pip install -r "$ROOT/backend/requirements.txt"

cd "$ROOT"
npm ci
npm ci --prefix frontend
echo "Edity Python environment: $ENV_ROOT"
echo "Run npm run build:mac, then open the resulting Edity.app from dist/app."
if ! command -v codex >/dev/null 2>&1; then
  echo "For AI editing, install Codex CLI and run codex login in Terminal."
fi
