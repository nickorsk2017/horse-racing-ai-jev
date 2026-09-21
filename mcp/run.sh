#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -d .venv ]; then
  python3 -m venv .venv
fi
if ! .venv/bin/python -c "import jev_agent, pydantic_settings, typesafe_sdk" 2>/dev/null; then
  .venv/bin/pip install -q -e ".[dev]"
fi
if [ ! -f .env ]; then
  cp .env.example .env
fi
exec .venv/bin/python -m jev_agent.main
