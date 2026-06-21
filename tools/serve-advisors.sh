#!/usr/bin/env bash
# Start the AI Advisor strategist server that the in-game Chat panel talks to.
#
# The brain uses an OpenAI-compatible chat endpoint by default (any llama.cpp /
# vLLM / Ollama / LM Studio server). Defaults point at a local LAN server; override
# with the AI_ADVISOR_LLM_* variables. To use Anthropic instead, set
# AI_ADVISOR_BACKEND=claude and export ANTHROPIC_API_KEY.
#
#   AI_ADVISOR_LLM_BASE_URL   default http://192.168.0.114:8040/v1
#   AI_ADVISOR_LLM_API_KEY    default dummy
#   AI_ADVISOR_LLM_MODEL      default: auto-discovered from /v1/models
#   AI_ADVISOR_PORT           default 8421
#
# Usage:  tools/serve-advisors.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"

echo "LLM endpoint: ${AI_ADVISOR_LLM_BASE_URL:-http://192.168.0.114:8040/v1}" >&2
exec python3 -m advisors.server
