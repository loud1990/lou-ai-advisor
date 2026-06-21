#!/usr/bin/env python3
"""Conversational strategist for the Civ 7 AI Advisor.

Where `advisor.Council` answers a single turn per-persona, the Strategist holds a
*conversation* that produces and maintains a durable per-game STRATEGY: the victory
goal, a tech path, a civic path, a city build order, an empire focus mix, and a
threat posture. The in-game panel chats with this over a tiny local HTTP server
(`advisors/server.py`); the returned strategy is cached client-side and drives the
mod's existing advice so "talking to the council changes the advice".

Reuses the existing brain: `advisor.ClaudeBackend` (Anthropic), the FTS5 knowledge
base (`kb.query`), and `benchmarks.assess` for pace/rival standing.

If no LLM backend is configured (no ANTHROPIC_API_KEY) the Strategist still answers
gracefully — it returns a help message and leaves the strategy unchanged — so the
server never hard-fails on a missing key.
"""
from __future__ import annotations

import json
import os
import re
import sys
import textwrap
from typing import Any, Dict, List, Optional

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)

import advisor  # reuse ClaudeBackend, kb, benchmarks, _snippet  # noqa: E402

STRATEGY_DIR = os.path.join(_HERE, "strategies")

# Focus keys mirror the advisor persona keys so the in-game advice / city-council
# scorer can read them directly.
FOCUS_KEYS = ["expansion", "military", "science", "culture", "economy"]
VICTORY_GOALS = ["Military", "Cultural", "Scientific", "Economic"]


# --- strategy document -------------------------------------------------------

def default_strategy(game_id: str, state: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "game_id": game_id,
        "leader": state.get("leader"),
        "civ": state.get("civ"),
        "updated_turn": state.get("turn"),
        "victory_goal": None,            # one of VICTORY_GOALS once chosen
        "rationale": "",
        "tech_path": [],                 # ordered tech node names
        "civic_path": [],                # ordered civic node names
        "build_order": {"priorities": [], "notes": ""},
        "focus": {k: 0.2 for k in FOCUS_KEYS},  # empire priority mix (sums ~1.0)
        "threat_posture": "peaceful",    # peaceful | defensive | aggressive
        "milestones": [],
        "notes": "",
    }


def _path(game_id: str, ext: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9_.-]", "_", str(game_id)) or "game"
    return os.path.join(STRATEGY_DIR, f"{safe}.{ext}")


def load_strategy(game_id: str) -> Optional[Dict[str, Any]]:
    p = _path(game_id, "json")
    if os.path.exists(p):
        try:
            with open(p, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return None
    return None


def save_strategy(strategy: Dict[str, Any]) -> None:
    os.makedirs(STRATEGY_DIR, exist_ok=True)
    gid = strategy.get("game_id", "game")
    with open(_path(gid, "json"), "w", encoding="utf-8") as f:
        json.dump(strategy, f, indent=2, ensure_ascii=False)
    with open(_path(gid, "md"), "w", encoding="utf-8") as f:
        f.write(render_markdown(strategy))


def render_markdown(s: Dict[str, Any]) -> str:
    def lst(items):
        items = items or []
        return "\n".join(f"- {i}" for i in items) or "- (none yet)"

    bo = s.get("build_order") or {}
    focus = s.get("focus") or {}
    focus_line = ", ".join(f"{k} {focus.get(k, 0):.0%}" for k in FOCUS_KEYS)
    # Assembled as a flat list of lines (no source indentation) so the injected
    # multi-line sections don't end up indented in the file.
    parts = [
        f"# Strategy — {s.get('civ') or '?'} ({s.get('leader') or '?'})",
        "",
        f"_Game {s.get('game_id')}, updated turn {s.get('updated_turn')}_",
        "",
        "## Victory goal",
        f"**{s.get('victory_goal') or 'undecided'}** — {s.get('rationale') or ''}",
        "",
        "## Tech path",
        lst(s.get("tech_path")),
        "",
        "## Civic path",
        lst(s.get("civic_path")),
        "",
        "## City build order",
        lst(bo.get("priorities")),
    ]
    if bo.get("notes"):
        parts += ["", bo["notes"]]
    parts += [
        "",
        "## Empire focus",
        focus_line,
        "",
        "## Threat posture",
        s.get("threat_posture") or "peaceful",
        "",
        "## Milestones",
        lst(s.get("milestones")),
        "",
        "## Notes",
        s.get("notes") or "",
        "",
    ]
    return "\n".join(parts)


def _merge(base: Dict[str, Any], update: Dict[str, Any]) -> Dict[str, Any]:
    """Shallow-merge the model's update onto the current strategy, so a partial
    update (e.g. only victory_goal + a tech) never wipes the rest."""
    out = dict(base)
    for k, v in (update or {}).items():
        if v is None:
            continue
        if k == "build_order" and isinstance(v, dict):
            bo = dict(out.get("build_order") or {})
            bo.update({kk: vv for kk, vv in v.items() if vv is not None})
            out[k] = bo
        elif k == "focus" and isinstance(v, dict):
            f = dict(out.get("focus") or {})
            f.update({kk: vv for kk, vv in v.items() if vv is not None})
            out[k] = f
        else:
            out[k] = v
    return out


# --- retrieval + prompt ------------------------------------------------------

def _kb_facts(message: str, state: Dict[str, Any], strategy: Dict[str, Any], k: int = 6) -> str:
    age = state.get("age")
    goal = strategy.get("victory_goal")
    queries: List[str] = [message or ""]
    if goal:
        queries.append(f"{goal} victory strategy")
    if age:
        queries.append(f"{age} age strategy")
    queries += ["technology research priorities", "civic culture tree", "city build order production"]
    seen: Dict[str, Dict] = {}
    for q in queries:
        for r in advisor.kb.query(q, k=4):
            if advisor._wrong_age(r, age):
                continue
            seen.setdefault(r["title"], r)
    docs = list(seen.values())[:k]
    return "\n".join(
        f"- [{d['section']}] {d['title']}: {advisor._snippet(d['body'])}" for d in docs
    ) or "- (no specific KB facts retrieved)"


SYSTEM = (
    "You are the Chief Strategist who chairs a Civilization VII leader's advisory "
    "council (Test of Time rules). You hold an ongoing conversation with the leader "
    "to choose a Victory to pursue and to maintain a concrete plan for reaching it: "
    "a technology path, a civics path, a rough city build order, an empire focus mix, "
    "and a posture toward war. You know the Civ 7 tech and civic trees and standard "
    "build orders from your own expertise; use the provided knowledge base and game "
    "state to stay grounded and current.\n\n"
    "Speak plainly and concisely, like a trusted advisor — 2-5 sentences. Then, ALWAYS "
    "end your message with the FULL updated strategy as a single fenced ```json block "
    "(no prose after it). Include every field, carrying forward unchanged values. "
    "Fields: victory_goal (one of Military, Cultural, Scientific, Economic, or null), "
    "rationale, tech_path (ordered tech names), civic_path (ordered civic names), "
    "build_order ({priorities:[...], notes:\"\"}), focus (fractions over "
    f"{FOCUS_KEYS} summing to ~1.0), threat_posture (peaceful|defensive|aggressive), "
    "milestones (short checkpoints), notes. If the leader has not chosen a victory yet, "
    "recommend one and explain why, but leave victory_goal null until they confirm."
)


def build_user_prompt(message: str, state: Dict[str, Any], strategy: Dict[str, Any],
                      history: List[Dict[str, str]]) -> str:
    assessment = advisor.benchmarks.assess(state, state.get("rivals"))
    convo = "\n".join(
        f"{m.get('role', 'user').upper()}: {m.get('content', '')}" for m in (history or [])[-8:]
    ) or "(no prior conversation)"
    return textwrap.dedent(f"""\
        Current strategy:
        {json.dumps(strategy, indent=2, ensure_ascii=False)}

        Current game state (turn {state.get('turn', '?')}):
        {json.dumps(state, indent=2, ensure_ascii=False)}

        Standing vs benchmarks ({assessment['mode']} check):
        {assessment['summary']}

        Relevant Civilization VII knowledge:
        {_kb_facts(message, state, strategy)}

        Conversation so far:
        {convo}

        The leader now says:
        {message}

        Reply to the leader, then output the full updated strategy JSON block.""")


_JSON_BLOCK = re.compile(r"```(?:json)?\s*(\{.*\})\s*```", re.DOTALL)


def parse_reply(text: str) -> (str, Optional[Dict[str, Any]]):
    """Split the model output into (prose reply, strategy update dict)."""
    matches = list(_JSON_BLOCK.finditer(text or ""))
    if not matches:
        return (text or "").strip(), None
    block = matches[-1]
    reply = (text[:block.start()]).strip()
    try:
        update = json.loads(block.group(1))
    except Exception:
        update = None
    return reply or "(strategy updated)", update


# --- strategist --------------------------------------------------------------

class Strategist:
    def __init__(self, backend=None):
        self.backend = backend if backend is not None else advisor.default_backend()

    def chat(self, game_id: str, message: str, state: Dict[str, Any],
             history: Optional[List[Dict[str, str]]] = None) -> Dict[str, Any]:
        state = state or {}
        strategy = load_strategy(game_id) or default_strategy(game_id, state)
        # keep identity/turn fresh from the live state
        for key in ("leader", "civ"):
            if state.get(key):
                strategy[key] = state[key]
        if state.get("turn") is not None:
            strategy["updated_turn"] = state["turn"]

        if self.backend is None:
            save_strategy(strategy)
            return {
                "reply": ("The council brain has no LLM configured. Point "
                          "AI_ADVISOR_LLM_BASE_URL at an OpenAI-compatible endpoint "
                          "(or set AI_ADVISOR_BACKEND=claude with an ANTHROPIC_API_KEY) "
                          "and restart advisors/server.py."),
                "strategy": strategy,
                "offline_brain": True,
            }

        system = SYSTEM
        user = build_user_prompt(message, state, strategy, history or [])
        raw = self.backend.generate(system, user)
        reply, update = parse_reply(raw)
        if update:
            strategy = _merge(strategy, update)
            strategy["game_id"] = game_id  # never let the model rewrite identity key
        save_strategy(strategy)
        return {"reply": reply, "strategy": strategy}


if __name__ == "__main__":
    s = Strategist()
    demo_state = {"turn": 1, "age": "Antiquity", "leader": "Hatshepsut",
                  "civ": "Egyptian Empire", "yields": {"science": 5, "culture": 5}}
    out = s.chat("demo", "I want to win a cultural victory. What's the plan?", demo_state, [])
    print(out["reply"])
    print("\n--- strategy ---")
    print(json.dumps(out["strategy"], indent=2))
