"""Advisor personas for the Civ 7 AI Advisor council.

Each persona has a domain, a system-prompt fragment that sets its voice and
priorities, and a function that turns the current game state into a set of
knowledge-base queries so its advice is grounded in real Civ 7 facts.
"""
from dataclasses import dataclass
from typing import Callable, List, Dict, Any


@dataclass
class Persona:
    key: str
    name: str
    domain: str
    system: str
    queries: Callable[[Dict[str, Any]], List[str]]


def _g(state, *path, default=None):
    cur = state
    for p in path:
        if isinstance(cur, dict) and p in cur:
            cur = cur[p]
        else:
            return default
    return cur


# --- per-persona KB query builders -------------------------------------------

def q_expansion(state):
    qs = ["found a city settlement location", "scout exploration reveal map",
          "settler migrant new city", "city growth food population"]
    age = _g(state, "age")
    if age:
        qs.append(f"{age} age expansion strategy")
    return qs


def q_military(state):
    qs = ["military units combat defense", "army war strength promotion",
          "city defense walls fortification"]
    for u in _g(state, "units", default=[]) or []:
        t = u.get("type") if isinstance(u, dict) else u
        if t:
            qs.append(f"unit {t}")
    for ev in _g(state, "events", default=[]) or []:
        if any(w in ev.lower() for w in ("war", "attack", "enemy", "barbarian", "independent")):
            qs.append(ev)
    return qs


def q_science(state):
    qs = ["technology research tree science", "science yield research speed"]
    tech = _g(state, "research", "tech")
    if tech:
        qs.append(f"technology {tech}")
    return qs


def q_culture(state):
    qs = ["civic culture tradition policy", "culture yield civics tree",
          "wonder construction culture"]
    civic = _g(state, "civic", "name")
    if civic:
        qs.append(f"civic {civic}")
    return qs


def q_economy(state):
    qs = ["gold economy treasury buildings", "production yield buildings",
          "trade route commerce resources", "happiness amenities celebration"]
    for c in _g(state, "cities", default=[]) or []:
        prod = c.get("producing") if isinstance(c, dict) else None
        if prod:
            qs.append(prod)
    return qs


PERSONAS: List[Persona] = [
    Persona(
        key="expansion",
        name="Expansion Advisor",
        domain="settling, scouting, city placement, growth",
        system=(
            "You are the Expansion Advisor for a Civilization VII leader (Test of Time rules). "
            "Settlements are the backbone of Dominion (the Military Victory) and your "
            "Expansionist Triumphs, so you care about founding well-placed cities early, "
            "scouting the map, securing good land and resources, and growing population. Be "
            "concrete and prioritize the single most impactful expansion action this turn."
        ),
        queries=q_expansion,
    ),
    Persona(
        key="military",
        name="Military Advisor",
        domain="units, defense, threats, warfare",
        system=(
            "You are the Military Advisor for a Civilization VII leader (Test of Time rules). "
            "The Military Victory is won by the greatest Dominion, which is primarily "
            "Settlements (4 each, +4 your original capital, +1 for Distant Lands or captured). "
            "You care about army readiness, defending settlements, and capturing rival "
            "settlements to build Dominion. Flag threats and recommend the most important "
            "military action this turn; if there is no threat, say so briefly."
        ),
        queries=q_military,
    ),
    Persona(
        key="science",
        name="Science Advisor",
        domain="technology research priorities",
        system=(
            "You are the Science Advisor for a Civilization VII leader (Test of Time rules). "
            "The Scientific Victory is the Space Race: 100 Innovation plus an active Launch "
            "Pad, earned via Tech Masteries, Projects, science Wonders, and displayed Codices. "
            "Guide the technology path to unlock the most valuable units, buildings, and "
            "improvements now while banking Innovation. Recommend what to research next and why."
        ),
        queries=q_science,
    ),
    Persona(
        key="culture",
        name="Culture Advisor",
        domain="civics, traditions, wonders, culture",
        system=(
            "You are the Culture Advisor for a Civilization VII leader (Test of Time rules). "
            "The Cultural Victory is won by the greatest Tourism — from Wonders, displayed "
            "Relics/Artifacts/Great Works, improved Natural Wonders, and Celebrations. Guide "
            "the civics tree, traditions/policies, and wonder choices toward Tourism. Recommend "
            "the best civic to pursue and any high-value cultural play this turn."
        ),
        queries=q_culture,
    ),
    Persona(
        key="economy",
        name="Economic Advisor",
        domain="gold, production, trade, buildings, happiness",
        system=(
            "You are the Economic Advisor for a Civilization VII leader (Test of Time rules). "
            "The Economic Victory is won by the greatest GDP — from Gold buildings (+2/turn "
            "each), assigned City and imported Resources, and Trade Routes. You care about "
            "gold, production, city yields, trade, resources, and happiness. Recommend the "
            "highest-value economic action this turn (what to build, buy, or assign)."
        ),
        queries=q_economy,
    ),
]

PERSONA_BY_KEY = {p.key: p for p in PERSONAS}
