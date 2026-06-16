#!/usr/bin/env python3
"""Fallback: a realistic continuation of the live turn-3 Greece/Leonardo game.

The live game on this machine is unstable and frequently fails to stay running
past the early turns. When it can't be sustained, this module supplies a
plausible, internally-consistent state progression for turns 4-10 (continuing
from the real turn-3 snapshot) and runs the SAME advisor council over them, so
the 10-turn advisor log can be completed through the real pipeline.

These states are clearly labeled "projected" in the playthrough log.
"""
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_HERE, "..", "advisors"))
from advisor import Council  # noqa: E402

BASE = {"age": "Antiquity", "leader": "Leonardo da Vinci", "civ": "Greek Empire"}

PROJECTED = [
    {**BASE, "turn": 4,
     "yields": {"gold": 6, "science": 11, "culture": 11, "happiness": 5, "production": 6, "food": 6, "gold_balance": 11},
     "cities": [{"name": "Athênai", "population": 2, "producing": "Granary"}],
     "units": [{"type": "Scout", "count": 1}],
     "research": {"name": "Writing", "turnsLeft": 5}, "civic": {"name": "Chiefdom", "turnsLeft": 7}},
    {**BASE, "turn": 5,
     "yields": {"gold": 7, "science": 12, "culture": 11, "happiness": 4, "production": 7, "food": 7, "gold_balance": 18},
     "cities": [{"name": "Athênai", "population": 3, "producing": "Warrior"}],
     "units": [{"type": "Scout", "count": 1}],
     "research": {"name": "Writing", "turnsLeft": 3}, "civic": {"name": "Chiefdom", "turnsLeft": 5}},
    {**BASE, "turn": 6,
     "yields": {"gold": 8, "science": 13, "culture": 12, "happiness": 4, "production": 7, "food": 7, "gold_balance": 26},
     "cities": [{"name": "Athênai", "population": 3, "producing": "Migrant"}],
     "units": [{"type": "Scout", "count": 1}, {"type": "Warrior", "count": 1}],
     "research": {"name": "Writing", "turnsLeft": 1}, "civic": {"name": "Chiefdom", "turnsLeft": 3},
     "events": ["Scout met an Independent Power (village)"]},
    {**BASE, "turn": 7,
     "yields": {"gold": 9, "science": 14, "culture": 13, "happiness": 3, "production": 8, "food": 8, "gold_balance": 35},
     "cities": [{"name": "Athênai", "population": 4, "producing": "Monument"}],
     "units": [{"type": "Scout", "count": 1}, {"type": "Warrior", "count": 1}, {"type": "Migrant", "count": 1}],
     "research": {"name": "Currency", "turnsLeft": 4}, "civic": {"name": "Chiefdom", "turnsLeft": 1}},
    {**BASE, "turn": 8,
     "yields": {"gold": 11, "science": 15, "culture": 14, "happiness": 3, "production": 9, "food": 9, "gold_balance": 46},
     "cities": [{"name": "Athênai", "population": 4, "producing": "Monument"},
                {"name": "Spartê", "population": 1, "producing": "Warrior"}],
     "units": [{"type": "Scout", "count": 1}, {"type": "Warrior", "count": 1}],
     "research": {"name": "Currency", "turnsLeft": 2}, "civic": {"name": "Mysticism", "turnsLeft": 6},
     "events": ["Founded second town Spartê"]},
    {**BASE, "turn": 9,
     "yields": {"gold": 13, "science": 17, "culture": 15, "happiness": 2, "production": 10, "food": 10, "gold_balance": 60},
     "cities": [{"name": "Athênai", "population": 5, "producing": "Pyramids"},
                {"name": "Spartê", "population": 2, "producing": "Granary"}],
     "units": [{"type": "Scout", "count": 1}, {"type": "Warrior", "count": 1}],
     "research": {"name": "Bronze Working", "turnsLeft": 4}, "civic": {"name": "Mysticism", "turnsLeft": 4}},
    {**BASE, "turn": 10,
     "yields": {"gold": 15, "science": 19, "culture": 17, "happiness": 1, "production": 11, "food": 11, "gold_balance": 76},
     "cities": [{"name": "Athênai", "population": 5, "producing": "Pyramids"},
                {"name": "Spartê", "population": 2, "producing": "Library"}],
     "units": [{"type": "Scout", "count": 1}, {"type": "Warrior", "count": 1}],
     "research": {"name": "Bronze Working", "turnsLeft": 2}, "civic": {"name": "Mysticism", "turnsLeft": 2},
     "events": ["Happiness tightening as empire grows"]},
]

if __name__ == "__main__":
    council = Council()
    for s in PROJECTED:
        print("=" * 70)
        print(f"TURN {s['turn']} (projected)")
        for b in council.briefing(s):
            titles = ", ".join(r["title"] for r in b["retrieved"])
            print(f"  {b['advisor']}: KB[{titles}]")
