#!/usr/bin/env python3
"""Extract every per-turn game state the mod emitted to UI.log.

Returns one state per turn (the last emission for each turn number), ordered by
turn. Used after advancing several turns so the advisor council can be run over
the whole sequence.

Usage:
  python extract_states.py            # print one JSON state per line, per turn
  python extract_states.py --briefing # also print the council briefing per turn
"""
import argparse
import json
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_HERE, "..", "advisors"))

UILOG = (
    "/home/lou/.steam/debian-installation/steamapps/compatdata/1295660/pfx/"
    "drive_c/users/steamuser/AppData/Local/Firaxis Games/"
    "Sid Meier's Civilization VII/Logs/UI.log"
)
TAG = "AI_ADVISOR_STATE:"


def all_states(path=UILOG):
    by_turn = {}
    with open(path, "r", errors="ignore") as f:
        for line in f:
            i = line.find(TAG)
            if i == -1:
                continue
            try:
                s = json.loads(line[i + len(TAG):].strip())
            except json.JSONDecodeError:
                continue
            t = s.get("turn")
            if t is not None:
                by_turn[t] = s  # keep last emission for each turn
    return [by_turn[t] for t in sorted(by_turn)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--briefing", action="store_true")
    args = ap.parse_args()
    states = all_states()
    print(f"# {len(states)} turn states: turns {[s['turn'] for s in states]}", file=sys.stderr)
    if args.briefing:
        from advisor import Council
        council = Council()
        for s in states:
            print("=" * 70)
            print(f"TURN {s['turn']}: {json.dumps(s, ensure_ascii=False)}")
            for b in council.briefing(s):
                titles = ", ".join(r["title"] for r in b["retrieved"])
                print(f"  {b['advisor']}: KB[{titles}]")
    else:
        for s in states:
            print(json.dumps(s, ensure_ascii=False))


if __name__ == "__main__":
    main()
