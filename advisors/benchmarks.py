#!/usr/bin/env python3
"""Progress benchmarks for the Civ 7 AI Advisor (post Test of Time / 1.4.0).

Turns the researched benchmarks in ../kb/benchmarks.md into structured data plus
an `assess()` helper the council can call to answer "where am I, and do I need to
push harder?" at any point in the game.

Two kinds of check, by design (see kb/benchmarks.md §1):
  1. STATIC pacing benchmarks   — used in Antiquity, before you can see the
     strongest rivals (you usually meet the other continent only in Exploration).
  2. RELATIVE rival comparison  — from Exploration on, the dominance victories are
     literally "be N× the second-place player," so once rival scores are known we
     weight that comparison far more heavily than the static numbers.

All figures are anchored on post-1.4.0 competitive data (CivFanatics 7OTM
threads, Jun 2026) and the official Victories guide. Pre-1.4.0 numbers are NOT
used: Test of Time cut "yield bloat," so older guides overstate yields.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

# --- victory thresholds (Dominance: Military/Cultural/Economic) --------------
# Win by reaching this multiple of the 2nd-place player's score and holding it
# for 5 turns. Phase keys map to (age, fraction-of-age) buckets.
# Source: official "Test of Time — Victories" guide.
VICTORY_MULTIPLE = [
    # (age, age_frac_at_or_below, required_multiple_over_2nd_place)
    ("Exploration", 0.50, 6.0),
    ("Exploration", 1.00, 4.0),
    ("Modern", 0.25, 3.0),
    ("Modern", 0.50, 2.0),
    ("Modern", 0.80, 1.5),
    ("Modern", 1.00, 1.25),
]

# Scientific victory is absolute, not relative.
SCIENCE_INNOVATION_TARGET = 100  # then launch a rocket (5-turn countdown)

# Base settlement cap per Age, before civics/techs/leader/memento bonuses.
SETTLEMENT_CAP_BASE = {"Antiquity": 3, "Exploration": 8, "Modern": 16}


@dataclass
class AgeBenchmark:
    """'What a strong game looks like by the END of this Age' (post-1.4.0)."""
    age: str
    complete_by_turn_fast: int      # aggressive/rush completion turn
    complete_by_turn_onpace: int    # solid builder completion turn
    cities_strong: int              # full cities (not towns)
    settlements_strong: int         # total settlements (cities + towns)
    wonders_strong: int             # wonders built/controlled
    tourism_leader: Optional[int]   # tourism of a strong/leading empire
    tourism_field: Optional[int]    # tourism of the trailing field (rough)
    future_civics_strong: int       # overflow civics = finished tree with time
    notes: str = ""


AGE_BENCHMARKS: Dict[str, AgeBenchmark] = {
    "Antiquity": AgeBenchmark(
        age="Antiquity",
        complete_by_turn_fast=120, complete_by_turn_onpace=140,
        cities_strong=4, settlements_strong=9, wonders_strong=5,
        tourism_leader=85, tourism_field=45, future_civics_strong=2,
        notes="Rival scores usually not visible yet — lean on these static marks.",
    ),
    "Exploration": AgeBenchmark(
        age="Exploration",
        # turns *added* in this age for a strong game (not absolute total)
        complete_by_turn_fast=50, complete_by_turn_onpace=75,
        cities_strong=6, settlements_strong=19, wonders_strong=11,
        tourism_leader=400, tourism_field=60, future_civics_strong=2,
        notes="You meet Distant Lands players here — switch to the relative check.",
    ),
    "Modern": AgeBenchmark(
        age="Modern",
        complete_by_turn_fast=60, complete_by_turn_onpace=120,
        cities_strong=8, settlements_strong=20, wonders_strong=12,
        tourism_leader=None, tourism_field=None, future_civics_strong=2,
        notes="Post-1.4.0 endgame data thin; use the victory-multiple schedule.",
    ),
}


def required_multiple(age: Optional[str], age_frac: Optional[float]) -> Optional[float]:
    """Required lead over 2nd place for a Dominance victory at this point.

    age_frac is 0..1 progress through the Age (e.g. Game.AgeProgressManager).
    Returns None in Antiquity (no dominance victory is decided that early).
    """
    if not age or age_frac is None:
        return None
    for a, frac_cap, mult in VICTORY_MULTIPLE:
        if a == age and age_frac <= frac_cap:
            return mult
    # past the last bucket of a known age -> use that age's final multiple
    finals = [m for (a, _f, m) in VICTORY_MULTIPLE if a == age]
    return finals[-1] if finals else None


def _verdict_from_ratio(ratio: float, needed: float) -> str:
    """Compare your-score / second-place-score against the needed multiple."""
    if ratio >= needed:
        return "Leading (win pace — hold 5 turns)"
    if ratio >= needed * 0.75:
        return "Competitive (close to win pace)"
    if ratio >= needed * 0.4:
        return "Behind (need to pull ahead)"
    return "Far behind"


def assess(state: Dict[str, Any], rivals: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Assess current standing vs benchmarks.

    state  : the advisor state dict (see advisors/advisor.py). Reads `age`,
             `turn`, `age_frac` (0..1, optional), `cities` (list), `wonders`
             (int, optional), `tourism` (int, optional), `yields` (dict).
    rivals : optional live victory standings, e.g.
             {"cultural": {"me": 410, "second": 70}, "military": {...}, ...}.
             When present (typically Exploration+), the relative check is the
             primary verdict and is weighted over the static benchmarks.

    Returns {"age", "mode", "pace", "static": {...}, "relative": {...}, "summary"}.
    `mode` is "relative" when rival scores are available, else "static".
    """
    age = state.get("age")
    turn = state.get("turn")
    age_frac = state.get("age_frac")
    bm = AGE_BENCHMARKS.get(age or "")
    out: Dict[str, Any] = {"age": age, "turn": turn, "mode": "static"}

    # --- static pacing check (always computed) -------------------------------
    static: Dict[str, str] = {}
    if bm:
        cities = state.get("cities") or []
        n_cities = len([c for c in cities if isinstance(c, dict)]) or len(cities)
        static["cities"] = (
            f"{n_cities} (strong ~{bm.cities_strong})"
            + ("" if n_cities >= bm.cities_strong else " — behind")
        )
        if state.get("wonders") is not None:
            w = state["wonders"]
            static["wonders"] = (
                f"{w} (strong ~{bm.wonders_strong})"
                + ("" if w >= bm.wonders_strong else " — behind")
            )
        if state.get("tourism") is not None and bm.tourism_leader:
            t = state["tourism"]
            static["tourism"] = (
                f"{t} (leading game ~{bm.tourism_leader})"
                + ("" if t >= bm.tourism_leader * 0.8 else " — behind")
            )
        # pace: only meaningful for the current age's absolute completion
        if age == "Antiquity" and isinstance(turn, int):
            if turn <= bm.complete_by_turn_fast:
                static["pace"] = f"T{turn}: ahead of pace (fast ≤T{bm.complete_by_turn_fast})"
            elif turn <= bm.complete_by_turn_onpace:
                static["pace"] = f"T{turn}: on pace (≤T{bm.complete_by_turn_onpace})"
            else:
                static["pace"] = f"T{turn}: behind pace (>T{bm.complete_by_turn_onpace})"
    out["static"] = static
    out["pace"] = static.get("pace")

    # --- relative rival check (primary once rivals are known) ----------------
    relative: Dict[str, str] = {}
    needed = required_multiple(age, age_frac)
    if rivals:
        for vic, scores in rivals.items():
            me = scores.get("me")
            second = scores.get("second")
            if me is None or not second:  # guard div-by-zero / missing
                continue
            ratio = me / second if second else float("inf")
            if vic == "scientific":
                pct = 100 * me / SCIENCE_INNOVATION_TARGET
                relative[vic] = (
                    f"{me}/{SCIENCE_INNOVATION_TARGET} Innovation ({pct:.0f}%)"
                )
            elif needed:
                relative[vic] = (
                    f"{me} vs 2nd {second} = {ratio:.1f}× (need {needed:g}×): "
                    + _verdict_from_ratio(ratio, needed)
                )
            else:
                relative[vic] = f"{me} vs 2nd {second} = {ratio:.1f}× (no threshold yet)"
        if relative:
            out["mode"] = "relative"
    out["relative"] = relative
    out["needed_multiple"] = needed

    # --- one-line summary ----------------------------------------------------
    if out["mode"] == "relative":
        out["summary"] = (
            "Rival scores known — judge by the victory multiple "
            f"(need {needed:g}× the 2nd-place player). " + "; ".join(
                f"{k}: {v}" for k, v in relative.items()
            )
        )
    else:
        bits = [v for v in static.values()]
        out["summary"] = (
            f"{age}: " + ("; ".join(bits) if bits else "no benchmark data")
            + (f" — {bm.notes}" if bm else "")
        )
    return out


if __name__ == "__main__":
    # demo: a mid-Exploration culture game with rival scores visible
    demo_state = {
        "age": "Exploration", "turn": 165, "age_frac": 0.6,
        "cities": [{}, {}, {}, {}, {}, {}], "wonders": 9, "tourism": 300,
        "yields": {"science": 40, "culture": 55, "gold": 30},
    }
    demo_rivals = {
        "cultural": {"me": 300, "second": 70},
        "military": {"me": 120, "second": 140},
        "scientific": {"me": 45, "second": 30},
    }
    import json
    print("STATIC-ONLY (Antiquity-style):")
    print(json.dumps(assess({**demo_state, "age": "Antiquity", "turn": 130,
                              "age_frac": 0.9}), indent=2))
    print("\nRELATIVE (Exploration with rivals):")
    print(json.dumps(assess(demo_state, demo_rivals), indent=2))
