#!/usr/bin/env python3
"""Playthrough harness: read the latest emitted game state and build the
advisor council briefing for the current turn.

Reads the most recent `AI_ADVISOR_STATE:` line from the game's UI.log (emitted
by ui/ai-advisor-state.js), parses the JSON, and prints the per-advisor
retrieved KB context + prompts so advice can be generated (by the Claude backend
if ANTHROPIC_API_KEY is set, otherwise printed for the driving agent to answer).

Usage:
  python turn.py                 # latest state -> briefing
  python turn.py --state x.json  # use a state file instead of the log
  python turn.py --advise        # also generate advice (needs ANTHROPIC_API_KEY)
"""
import argparse
import json
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_HERE, "..", "advisors"))
from advisor import Council  # noqa: E402

UILOG = (
    "/home/lou/.steam/debian-installation/steamapps/compatdata/1295660/pfx/"
    "drive_c/users/steamuser/AppData/Local/Firaxis Games/"
    "Sid Meier's Civilization VII/Logs/UI.log"
)
TAG = "AI_ADVISOR_STATE:"


def latest_state(path=UILOG):
    last = None
    with open(path, "r", errors="ignore") as f:
        for line in f:
            i = line.find(TAG)
            if i != -1:
                last = line[i + len(TAG):].strip()
    if not last:
        return None
    try:
        return json.loads(last)
    except json.JSONDecodeError as e:
        print(f"bad state json: {e}", file=sys.stderr)
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--state", default=None, help="read state from a JSON file")
    ap.add_argument("--advise", action="store_true", help="generate advice via backend")
    args = ap.parse_args()

    if args.state:
        with open(args.state) as f:
            state = json.load(f)
    else:
        state = latest_state()
    if not state:
        print("No game state found (is the mod emitting AI_ADVISOR_STATE to UI.log?)")
        sys.exit(2)

    print("=" * 70)
    print(f"TURN {state.get('turn')} — {state.get('leader')} of {state.get('civ')} "
          f"({state.get('age')})")
    print("=" * 70)
    print("STATE:", json.dumps(state, ensure_ascii=False))
    print()

    council = Council()
    if args.advise and council.backend:
        for advisor, advice in council.advise(state).items():
            print(f"\n## {advisor}\n{advice}")
        return

    for b in council.briefing(state):
        print(f"\n## {b['advisor']} — {b['domain']}")
        print("   KB grounding:")
        for r in b["retrieved"]:
            print(f"     • [{r['section']}] {r['title']}: {r['snippet'][:140]}")


if __name__ == "__main__":
    main()
