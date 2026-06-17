#!/usr/bin/env python3
"""Drive Civ 7 through a run of turns.

The heavy lifting lives in the mod (ui/ai-advisor-autoplay.js), which runs
inside the game process and therefore works with the window unfocused or
minimised:

  * the city-growth tile-placement micro is auto-resolved (best-yield plot),
  * empty research / production slots are auto-filled (they also block
    end-turn), and
  * turns are ended in-engine via GameContext.sendTurnComplete().

Turn pacing is the one thing the mod can't decide on its own (a sandboxed UI
script can't read the harness's intent), so this driver sets the mod's
`AUTOPLAY_STOP_TURN` constant before launch, then simply *observes* UI.log as
the empire plays itself, reporting each turn and the micros it auto-handled.

If the in-engine advance ever stalls (e.g. an advisor warning the mod won't
bypass), the driver falls back to nudging Enter through the uinput daemon — the
only step that needs the window focused.

Usage:
  python play.py                 # play to 10 turns past the current save turn
  python play.py --to-turn 13    # play until the game reaches turn 13
  python play.py --no-recover    # don't relaunch on crash
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time

_HERE = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.dirname(_HERE)
LAUNCH = os.path.join(PROJ, "tools", "launch.sh")
AUTOPLAY_JS = os.path.join(PROJ, "ui", "ai-advisor-autoplay.js")
CMD = "/tmp/civ_cmd"
INPUTD = os.path.join(PROJ, "tools", "inputd.py")
VENV_PY = "/home/lou/.venvs/hf/bin/python3"

UILOG = (
    "/home/lou/.steam/debian-installation/steamapps/compatdata/1295660/pfx/"
    "drive_c/users/steamuser/AppData/Local/Firaxis Games/"
    "Sid Meier's Civilization VII/Logs/UI.log"
)
TAGS = {
    "state": "AI_ADVISOR_STATE:",
    "growth": "AI_ADVISOR_GROWTH:",
    "tech": "AI_ADVISOR_TECH:",
    "prod": "AI_ADVISOR_PROD:",
    "turn": "AI_ADVISOR_TURN:",
}

POLL = 4
STALL_TIMEOUT = 75   # no turn progress this long => nudge / recover


def set_stop_turn(n):
    """Rewrite the mod's AUTOPLAY_STOP_TURN so the next launch auto-plays to n."""
    with open(AUTOPLAY_JS) as f:
        src = f.read()
    new = re.sub(r"const AUTOPLAY_STOP_TURN = \d+;",
                 f"const AUTOPLAY_STOP_TURN = {n};", src)
    if new != src:
        with open(AUTOPLAY_JS, "w") as f:
            f.write(new)
        print(f"[play] set mod AUTOPLAY_STOP_TURN = {n}")


def scan(path=UILOG):
    """Return dict: latest turn, and counts of each auto-handled micro."""
    out = {"turn": None, "growth": 0, "tech": 0, "prod": 0, "turn_ends": 0}
    try:
        with open(path, "r", errors="ignore") as f:
            for line in f:
                if TAGS["state"] in line:
                    try:
                        s = json.loads(line.split(TAGS["state"], 1)[1].strip())
                        t = s.get("turn")
                        if isinstance(t, int):
                            out["turn"] = t if out["turn"] is None else max(out["turn"], t)
                    except (json.JSONDecodeError, IndexError):
                        pass
                elif TAGS["growth"] in line:
                    out["growth"] += 1
                elif TAGS["tech"] in line:
                    out["tech"] += 1
                elif TAGS["prod"] in line:
                    out["prod"] += 1
                elif TAGS["turn"] in line:
                    out["turn_ends"] += 1
    except FileNotFoundError:
        pass
    return out


_nonce = 0


def nudge_key(keyname):
    """Fallback only: send a key via the uinput daemon (needs window focus)."""
    global _nonce
    _nonce += 1
    try:
        with open(CMD, "w") as f:
            f.write(f"key {keyname} #{_nonce}\n")
    except OSError:
        pass


def nudge_enter():
    nudge_key("KEY_ENTER")


def game_running():
    return subprocess.run([LAUNCH, "running"]).returncode == 0


def in_game_fresh():
    """True if UI.log was written very recently (we're live in a game)."""
    try:
        return (time.time() - os.path.getmtime(UILOG)) < 25
    except OSError:
        return False


def play(to_turn, recover=True):
    if not game_running():
        print("[play] game is not running. Launch + load a save first "
              "(tools/launch.sh vulkan, then Continue), then re-run.")
        return 1

    start = scan()
    if start["turn"] is None:
        print("[play] no in-game state yet — load a save (Continue) first.")
        return 1
    print(f"[play] current turn {start['turn']}, target turn {to_turn}")
    if start["turn"] >= to_turn:
        print("[play] already at/after target.")
        return 0

    last_turn = start["turn"]
    last_progress = time.time()
    while True:
        time.sleep(POLL)
        if recover and not game_running():
            print("[play] game process gone.")
            return 2  # recovery/relaunch is a manual Continue step (see README)
        s = scan()
        if s["turn"] is not None and s["turn"] > last_turn:
            last_turn = s["turn"]
            last_progress = time.time()
            print(f"[play] turn {last_turn}  "
                  f"(growth {s['growth']}, tech {s['tech']}, prod {s['prod']}, "
                  f"in-engine ends {s['turn_ends']})")
            if last_turn >= to_turn:
                print(f"[play] DONE: reached turn {last_turn}. "
                      f"Auto-handled: {s['growth']} growth placements, "
                      f"{s['tech']} research picks, {s['prod']} production picks, "
                      f"{s['turn_ends']} in-engine turn-ends.")
                return 0
        elif time.time() - last_progress > STALL_TIMEOUT:
            if in_game_fresh():
                # The in-engine auto-end handles ordinary turns; the usual reason
                # it stalls is a celebration popup (TECH/CIVIC UNLOCKED, narrative
                # event) that gates the action button. Escape clears those; Enter
                # then ends the turn. NB: this is the one fallback that needs the
                # game window focused (OS input injection), so it only helps when
                # the game is foreground.
                print(f"[play] no turn progress in {STALL_TIMEOUT}s but game is "
                      f"live — Esc+Enter fallback (needs window focus).")
                nudge_key("KEY_ESC")
                time.sleep(0.8)
                nudge_key("KEY_ESC")
                time.sleep(0.8)
                nudge_enter()
                last_progress = time.time()
            else:
                print("[play] game appears hung (UI.log stale).")
                if recover:
                    return 2
                return 3


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--to-turn", type=int, default=None,
                    help="play until the game reaches this turn number")
    ap.add_argument("--turns", type=int, default=10,
                    help="if --to-turn omitted, play this many turns past current")
    ap.add_argument("--set-stop-only", action="store_true",
                    help="just write AUTOPLAY_STOP_TURN into the mod and exit")
    ap.add_argument("--no-recover", action="store_true")
    args = ap.parse_args()

    cur = scan()["turn"]
    target = args.to_turn if args.to_turn is not None else ((cur or 0) + args.turns)

    if args.set_stop_only:
        set_stop_turn(target)
        return 0

    set_stop_turn(target)
    sys.exit(play(target, recover=not args.no_recover))


if __name__ == "__main__":
    main()
