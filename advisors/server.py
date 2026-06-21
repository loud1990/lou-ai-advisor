#!/usr/bin/env python3
"""Tiny local HTTP server exposing the conversational Strategist to the Civ 7 mod.

The in-game advisor panel reaches this with `fetch` (the Civ 7 V8 runtime allows
calls to 127.0.0.1 — proven by the sibling civ7aisidecar mod). We keep the heavy
parts (KB retrieval, the LLM client) out of the game's sandbox and here in normal
Python.

Stdlib only (http.server) — no FastAPI/uvicorn dependency. The only third-party
need is `anthropic`, and only when an ANTHROPIC_API_KEY is set; without it the
Strategist degrades to a help message rather than failing.

Run:  python -m advisors.server   (or: tools/serve-advisors.sh)

Routes:
  GET  /health                -> {status, brain}
  GET  /strategy?game_id=ID   -> the stored strategy JSON (or null)
  POST /chat  {game_id, message, history, state} -> {reply, strategy}
"""
from __future__ import annotations

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)

import strategist  # noqa: E402

HOST = os.environ.get("AI_ADVISOR_HOST", "127.0.0.1")
PORT = int(os.environ.get("AI_ADVISOR_PORT", "8421"))

# One shared Strategist (and thus one backend / client) for the process.
STRATEGIST = strategist.Strategist()


class Handler(BaseHTTPRequestHandler):
    server_version = "AIAdvisor/0.1"

    # --- helpers -------------------------------------------------------------
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if not length:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            return {}

    def log_message(self, fmt, *args):  # quieter, single-line logging
        sys.stderr.write("[ai-advisor] " + (fmt % args) + "\n")

    # --- routes --------------------------------------------------------------
    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/health":
            self._json({"status": "ok",
                        "brain": "llm" if STRATEGIST.backend else "offline",
                        "port": PORT})
        elif url.path == "/strategy":
            gid = (parse_qs(url.query).get("game_id") or [""])[0]
            self._json({"strategy": strategist.load_strategy(gid)})
        else:
            self._json({"error": "not_found"}, status=404)

    def do_POST(self):
        url = urlparse(self.path)
        if url.path != "/chat":
            self._json({"error": "not_found"}, status=404)
            return
        req = self._read_body()
        game_id = str(req.get("game_id") or "game")
        message = req.get("message") or ""
        state = req.get("state") or {}
        history = req.get("history") or []
        try:
            result = STRATEGIST.chat(game_id, message, state, history)
            self._json(result)
        except Exception as e:  # never crash the loop on one bad turn
            self.log_message("chat error: %s", e)
            self._json({"error": "chat_failed", "detail": str(e)}, status=500)


def main():
    brain = "llm" if STRATEGIST.backend else "offline (set AI_ADVISOR_LLM_BASE_URL)"
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"AI Advisor strategist server on http://{HOST}:{PORT}  [brain: {brain}]")
    print("  GET /health   GET /strategy?game_id=ID   POST /chat")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nshutting down")
        httpd.shutdown()


if __name__ == "__main__":
    main()
