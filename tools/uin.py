#!/usr/bin/env python3
"""uinput input injection (games with raw input accept this).

Uses an ABSOLUTE pointing device so positions are exact and immune to pointer
acceleration. Separate virtual keyboard with a curated valid keymap.

Usage:
  uin.py click <x> <y> [left|right]
  uin.py move  <x> <y>
  uin.py dclick <x> <y>
  uin.py key   <KEY>            # e.g. KEY_ESC KEY_ENTER KEY_DOWN KEY_SPACE
  uin.py type  <text>
"""
import sys
import time
from evdev import UInput, AbsInfo, ecodes as e

SCRW, SCRH = 3840, 2160

abs_caps = {
    e.EV_KEY: [e.BTN_LEFT, e.BTN_RIGHT, e.BTN_MIDDLE],
    e.EV_ABS: [
        (e.ABS_X, AbsInfo(value=0, min=0, max=SCRW, fuzz=0, flat=0, resolution=0)),
        (e.ABS_Y, AbsInfo(value=0, min=0, max=SCRH, fuzz=0, flat=0, resolution=0)),
    ],
}

KEYS = ["KEY_ESC", "KEY_ENTER", "KEY_SPACE", "KEY_TAB", "KEY_UP", "KEY_DOWN",
        "KEY_LEFT", "KEY_RIGHT", "KEY_LEFTSHIFT", "KEY_BACKSPACE",
        "KEY_F1", "KEY_F12"]
KEYS += ["KEY_" + c for c in "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"]
KEYS += ["KEY_DOT", "KEY_COMMA", "KEY_MINUS", "KEY_SLASH", "KEY_SEMICOLON"]
kbd_caps = {e.EV_KEY: [getattr(e, k) for k in KEYS]}

CHARMAP = {" ": "KEY_SPACE", ".": "KEY_DOT", ",": "KEY_COMMA", "-": "KEY_MINUS",
           "_": "KEY_MINUS", "/": "KEY_SLASH"}


def mk_abs():
    return UInput(abs_caps, name="civ-virt-abs")


def mk_kbd():
    return UInput(kbd_caps, name="civ-virt-kbd")


def position(ui, x, y):
    # write the absolute position several times with settle gaps so a freshly
    # created uinput device is mapped by the compositor before we rely on it
    for off in (6, 3, 0):
        ui.write(e.EV_ABS, e.ABS_X, max(0, x - off))
        ui.write(e.EV_ABS, e.ABS_Y, max(0, y - off))
        ui.syn(); time.sleep(0.12)
    time.sleep(0.15)


def click(x, y, button="left"):
    btn = e.BTN_RIGHT if button == "right" else e.BTN_LEFT
    with mk_abs() as ui:
        time.sleep(0.7)
        position(ui, x, y)
        ui.write(e.EV_KEY, btn, 1); ui.syn(); time.sleep(0.09)
        ui.write(e.EV_KEY, btn, 0); ui.syn(); time.sleep(0.2)


def dclick(x, y):
    with mk_abs() as ui:
        time.sleep(0.3)
        position(ui, x, y)
        for _ in range(2):
            ui.write(e.EV_KEY, e.BTN_LEFT, 1); ui.syn(); time.sleep(0.05)
            ui.write(e.EV_KEY, e.BTN_LEFT, 0); ui.syn(); time.sleep(0.07)


def move(x, y):
    with mk_abs() as ui:
        time.sleep(0.3)
        position(ui, x, y)


def key(name):
    code = getattr(e, name)
    with mk_kbd() as ui:
        time.sleep(0.3)
        ui.write(e.EV_KEY, code, 1); ui.syn(); time.sleep(0.05)
        ui.write(e.EV_KEY, code, 0); ui.syn(); time.sleep(0.1)


def type_text(text):
    with mk_kbd() as ui:
        time.sleep(0.3)
        for ch in text:
            shift = ch.isupper()
            name = "KEY_" + ch.upper() if ch.isalnum() else CHARMAP.get(ch)
            if not name:
                continue
            code = getattr(e, name)
            if shift:
                ui.write(e.EV_KEY, e.KEY_LEFTSHIFT, 1); ui.syn()
            ui.write(e.EV_KEY, code, 1); ui.syn(); time.sleep(0.03)
            ui.write(e.EV_KEY, code, 0); ui.syn(); time.sleep(0.03)
            if shift:
                ui.write(e.EV_KEY, e.KEY_LEFTSHIFT, 0); ui.syn()
            time.sleep(0.02)


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "click":
        click(int(sys.argv[2]), int(sys.argv[3]), sys.argv[4] if len(sys.argv) > 4 else "left")
    elif cmd == "dclick":
        dclick(int(sys.argv[2]), int(sys.argv[3]))
    elif cmd == "move":
        move(int(sys.argv[2]), int(sys.argv[3]))
    elif cmd == "key":
        key(sys.argv[2])
    elif cmd == "type":
        type_text(sys.argv[2])
    else:
        print("unknown", cmd)
