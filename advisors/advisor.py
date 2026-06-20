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


def default_backend() -> Optional[ClaudeBackend]:
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
