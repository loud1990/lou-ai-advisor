#!/usr/bin/env python3
"""Persistent uinput daemon — holds virtual devices open so they stay mapped
(fixes the per-call flakiness from recreating devices).

Reads commands from /tmp/civ_cmd (one per line), executes, appends result to
/tmp/civ_cmd.log. Commands:
  rclick <x> <y>     relative-positioned left click (menu/shell context)
  aclick <x> <y>     absolute-positioned left click (in-game context)
  key <KEY>          e.g. KEY_ESC KEY_ENTER
  quit
"""
import os
import time
from evdev import UInput, AbsInfo, ecodes as e

SCRW, SCRH = 3840, 2160
CMD = "/tmp/civ_cmd"
LOG = "/tmp/civ_cmd.log"

rel = UInput({e.EV_REL: [e.REL_X, e.REL_Y, e.REL_WHEEL],
              e.EV_KEY: [e.BTN_LEFT, e.BTN_RIGHT]}, name="civd-rel")
ab = UInput({e.EV_KEY: [e.BTN_LEFT, e.BTN_RIGHT],
            e.EV_ABS: [(e.ABS_X, AbsInfo(0, 0, SCRW, 0, 0, 0)),
                       (e.ABS_Y, AbsInfo(0, 0, SCRH, 0, 0, 0))]}, name="civd-abs")
kbd = UInput({e.EV_KEY: [getattr(e, k) for k in
              ["KEY_ESC", "KEY_ENTER", "KEY_SPACE", "KEY_TAB", "KEY_UP", "KEY_DOWN",
               "KEY_LEFT", "KEY_RIGHT", "KEY_BACKSPACE", "KEY_LEFTSHIFT"]]}, name="civd-kbd")
time.sleep(1.0)  # let compositor map devices once


def log(m):
    with open(LOG, "a") as f:
        f.write(m + "\n")


def rmove(x, y):
    rel.write(e.EV_REL, e.REL_X, -8000); rel.write(e.EV_REL, e.REL_Y, -6000); rel.syn(); time.sleep(0.12)
    for _ in range(x): rel.write(e.EV_REL, e.REL_X, 1)
    rel.syn(); time.sleep(0.06)
    for _ in range(y): rel.write(e.EV_REL, e.REL_Y, 1)
    rel.syn(); time.sleep(0.2)


def rclick(x, y):
    rmove(x, y); time.sleep(0.25)
    rel.write(e.EV_KEY, e.BTN_LEFT, 1); rel.syn(); time.sleep(0.1)
    rel.write(e.EV_KEY, e.BTN_LEFT, 0); rel.syn(); time.sleep(0.2)


def aclick(x, y):
    for off in (6, 0):
        ab.write(e.EV_ABS, e.ABS_X, max(0, x - off)); ab.write(e.EV_ABS, e.ABS_Y, max(0, y - off)); ab.syn(); time.sleep(0.12)
    time.sleep(0.2)
    ab.write(e.EV_KEY, e.BTN_LEFT, 1); ab.syn(); time.sleep(0.1)
    ab.write(e.EV_KEY, e.BTN_LEFT, 0); ab.syn(); time.sleep(0.2)


def key(name):
    c = getattr(e, name)
    kbd.write(e.EV_KEY, c, 1); kbd.syn(); time.sleep(0.05)
    kbd.write(e.EV_KEY, c, 0); kbd.syn(); time.sleep(0.1)


open(CMD, "w").close()
log("daemon ready")
last = ""
while True:
    try:
        with open(CMD) as f:
            data = f.read().strip()
        if data and data != last:
            last = data
            parts = data.split()
            cmd = parts[0]
            if cmd == "quit":
                log("quit"); break
            elif cmd == "rclick":
                rclick(int(parts[1]), int(parts[2])); log(f"done {data}")
            elif cmd == "aclick":
                aclick(int(parts[1]), int(parts[2])); log(f"done {data}")
            elif cmd == "key":
                key(parts[1]); log(f"done {data}")
    except Exception as ex:
        log(f"err {ex}")
    time.sleep(0.3)
