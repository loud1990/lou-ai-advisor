#!/usr/bin/env python3
"""Advisor council engine: retrieve from the KB + generate grounded advice.

The council runs each advisor persona against the current game state:
  1. build KB queries from the persona + state,
  2. retrieve grounding documents from the FTS5 knowledge base,
  3. assemble a persona prompt (system + state + retrieved facts),
  4. generate advice via a pluggable LLM backend.

Backends:
  - ClaudeBackend  : uses the Anthropic SDK (needs ANTHROPIC_API_KEY).
  - briefing mode  : if no backend, `Council.briefing(state)` returns the fully
                     assembled prompts + retrieved context so an operator/agent
                     can answer as each advisor (used for the scripted playthrough).
"""
import importlib.util
import json
import os
import sys
import textwrap
import urllib.request
from typing import Any, Dict, List, Optional

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)
from personas import PERSONAS, Persona  # noqa: E402
import benchmarks  # noqa: E402  (progress benchmarks vs pace + rivals)

# import the KB query function from ../kb/ingest.py
_KB_INGEST = os.path.join(_HERE, "..", "kb", "ingest.py")
_spec = importlib.util.spec_from_file_location("kb_ingest", _KB_INGEST)
kb = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(kb)


# --- retrieval ---------------------------------------------------------------

_AGES = ["Antiquity", "Exploration", "Modern"]


def _wrong_age(doc: Dict, age: Optional[str]) -> bool:
    """True if the doc is clearly about a different age than the current one."""
    if not age:
        return False
    blob = f"{doc.get('section','')} {doc.get('title','')}"
    for other in _AGES:
        if other != age and (f"{other}:" in blob or f"Age: {other}" in blob):
            return True
    return False


def retrieve_for(persona: Persona, state: Dict[str, Any], k: int = 4) -> List[Dict]:
    """Run the persona's queries against the KB; return deduped top docs,
    filtering out content from other ages for relevance."""
    age = state.get("age")
    seen = {}
    for q in persona.queries(state):
        for r in kb.query(q, k=4):
            if _wrong_age(r, age):
                continue
            key = r["title"]
            if key not in seen or r["score"] < seen[key]["score"]:
                seen[key] = r
    return sorted(seen.values(), key=lambda r: r["score"])[:k]


def _snippet(body: str, n: int = 320) -> str:
    s = " ".join(body.split())
    return s[:n] + ("..." if len(s) > n else "")


# --- prompt assembly ---------------------------------------------------------

def format_state(state: Dict[str, Any]) -> str:
    return json.dumps(state, indent=2, ensure_ascii=False)


def build_prompts(persona: Persona, state: Dict[str, Any], retrieved: List[Dict]):
    facts = "\n".join(
        f"- [{r['section']}] {r['title']}: {_snippet(r['body'])}" for r in retrieved
    ) or "- (no specific KB facts retrieved)"
    assessment = benchmarks.assess(state, state.get("rivals"))
    user = textwrap.dedent(f"""\
        Current game state (turn {state.get('turn', '?')}):
        {format_state(state)}

        Where you stand vs benchmarks ({assessment['mode']} check, post-1.4.0):
        {assessment['summary']}

        Relevant Civilization VII knowledge:
        {facts}

        As the {persona.name} ({persona.domain}), give the leader your single most
        important recommendation for THIS turn. Be specific and concise (1-3 sentences).
        Ground your advice in the game state, the benchmark standing, and the
        knowledge above. If the benchmark check is "relative" (rival scores known),
        weight catching/holding the victory multiple over the static targets.""")
    return persona.system, user


# --- backends ----------------------------------------------------------------

class ClaudeBackend:
    def __init__(self, model: str = "claude-sonnet-4-6", max_tokens: int = 300):
        import anthropic  # lazy
        self.client = anthropic.Anthropic()
        self.model = model
        self.max_tokens = max_tokens

    def generate(self, system: str, user: str) -> str:
        msg = self.client.messages.create(
            model=self.model,
            max_tokens=self.max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        return "".join(b.text for b in msg.content if getattr(b, "type", "") == "text").strip()


# OpenAI-compatible defaults (a local llama.cpp/vLLM/Ollama/LM Studio endpoint).
# Override any of these via the AI_ADVISOR_LLM_* environment variables.
DEFAULT_LLM_BASE_URL = "http://192.168.0.114:8040/v1"
DEFAULT_LLM_API_KEY = "dummy"
DEFAULT_LLM_MODEL = "qwen3.6-27b-iq4_ks"


class OpenAIBackend:
    """Chat-completions backend for any OpenAI-compatible server (llama.cpp, vLLM,
    Ollama, LM Studio, ...).

    Dependency-free: talks HTTP with urllib so the mod's Python stays stdlib-only.
    Reasoning models that split their thinking into a separate `reasoning_content`
    field are handled — we read `content` (the answer), so the token budget needs
    to be generous enough for the model to finish thinking AND answer.
    """

    def __init__(self, base_url=None, api_key=None, model=None,
                 max_tokens: int = 3500, temperature: float = 0.4, timeout: int = 180):
        self.base_url = (base_url or os.environ.get("AI_ADVISOR_LLM_BASE_URL", DEFAULT_LLM_BASE_URL)).rstrip("/")
        self.api_key = api_key or os.environ.get("AI_ADVISOR_LLM_API_KEY", DEFAULT_LLM_API_KEY)
        self._model = model or os.environ.get("AI_ADVISOR_LLM_MODEL")  # None -> discover lazily
        self.max_tokens = int(os.environ.get("AI_ADVISOR_LLM_MAX_TOKENS", max_tokens))
        self.temperature = float(os.environ.get("AI_ADVISOR_LLM_TEMPERATURE", temperature))
        self.timeout = timeout

    @property
    def model(self) -> str:
        if not self._model:
            self._model = self._discover_model() or DEFAULT_LLM_MODEL
        return self._model

    def _discover_model(self) -> Optional[str]:
        try:
            req = urllib.request.Request(
                f"{self.base_url}/models",
                headers={"Authorization": f"Bearer {self.api_key}"},
            )
            with urllib.request.urlopen(req, timeout=10) as r:
                data = json.loads(r.read().decode("utf-8"))
            items = data.get("data") or []
            return items[0]["id"] if items else None
        except Exception:
            return None

    def generate(self, system: str, user: str) -> str:
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "max_tokens": self.max_tokens,
            "temperature": self.temperature,
        }
        req = urllib.request.Request(
            f"{self.base_url}/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json",
                     "Authorization": f"Bearer {self.api_key}"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            data = json.loads(r.read().decode("utf-8"))
        msg = (data.get("choices") or [{}])[0].get("message") or {}
        content = (msg.get("content") or "").strip()
        if not content:  # reasoning model that spent its whole budget thinking
            content = (msg.get("reasoning_content") or "").strip()
        return content


def default_backend():
    """Pick an LLM backend. Prefers an OpenAI-compatible endpoint (configurable;
    defaults to the local LAN server). Set AI_ADVISOR_BACKEND=claude (with an
    ANTHROPIC_API_KEY) to use Anthropic instead."""
    if os.environ.get("AI_ADVISOR_BACKEND", "").lower() == "claude" and os.environ.get("ANTHROPIC_API_KEY"):
        try:
            return ClaudeBackend()
        except Exception as e:
            print(f"ClaudeBackend unavailable: {e}", file=sys.stderr)
    try:
        return OpenAIBackend()  # construction never hits the network
    except Exception as e:
        print(f"OpenAIBackend unavailable: {e}", file=sys.stderr)
    if os.environ.get("ANTHROPIC_API_KEY"):
        try:
            return ClaudeBackend()
        except Exception as e:
            print(f"ClaudeBackend unavailable: {e}", file=sys.stderr)
    return None


# --- council -----------------------------------------------------------------

class Council:
    def __init__(self, backend=None):
        self.backend = backend if backend is not None else default_backend()

    def briefing(self, state: Dict[str, Any]) -> List[Dict]:
        """Assemble per-advisor prompts + retrieved context (no generation)."""
        out = []
        for p in PERSONAS:
            retrieved = retrieve_for(p, state)
            system, user = build_prompts(p, state, retrieved)
            out.append({
                "advisor": p.name,
                "key": p.key,
                "domain": p.domain,
                "system": system,
                "retrieved": [
                    {"section": r["section"], "title": r["title"],
                     "snippet": _snippet(r["body"])}
                    for r in retrieved
                ],
                "user_prompt": user,
            })
        return out

    def advise(self, state: Dict[str, Any]) -> Dict[str, str]:
        """Generate advice from every advisor via the LLM backend."""
        if self.backend is None:
            raise RuntimeError(
                "No LLM backend (set ANTHROPIC_API_KEY for ClaudeBackend). "
                "Use Council.briefing(state) for agent-driven advice instead."
            )
        result = {}
        for b in self.briefing(state):
            result[b["advisor"]] = self.backend.generate(b["system"], b["user_prompt"])
        return result


if __name__ == "__main__":
    # demo with a sample state
    sample = {
        "turn": 1, "age": "Antiquity", "leader": "Simón Bolívar",
        "civ": "Egyptian Empire",
        "yields": {"gold": 5, "science": 10, "culture": 10, "happiness": 5,
                   "production": 5, "food": 5},
        "cities": [{"name": "Waset", "population": 1, "producing": "Scout", "turns_left": 6}],
        "research": {"tech": "Pottery", "turns_left": 7},
        "civic": {"name": None, "turns_left": None},
        "units": [{"type": "Scout", "count": 1}],
        "events": ["Founded capital Waset"],
    }
    council = Council()
    if council.backend:
        for advisor, advice in council.advise(sample).items():
            print(f"\n## {advisor}\n{advice}")
    else:
        print("No backend; printing briefing (retrieval + prompts):\n")
        for b in council.briefing(sample):
            print(f"\n## {b['advisor']} — {b['domain']}")
            for r in b["retrieved"]:
                print(f"   • [{r['section']}] {r['title']}")
