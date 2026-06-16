#!/usr/bin/env python3
"""Tiny X11 automation helper for testing the Civ 7 mod.

Usage:
  xui.py shot <out.png>            # screenshot whole root
  xui.py windows                   # list visible windows (name + geometry)
  xui.py move <x> <y>
  xui.py click <x> <y> [button]
  xui.py key <keysym>              # e.g. Return, Escape, space
  xui.py type <text>
"""
import sys
import time
import subprocess
from Xlib import X, display, XK
from Xlib.ext import xtest

d = display.Display()
root = d.screen().root


def sync():
    d.sync()
    time.sleep(0.05)


def move(x, y):
    xtest.fake_input(d, X.MotionNotify, x=int(x), y=int(y))
    sync()


def click(x, y, button=1):
    move(x, y)
    time.sleep(0.1)
    xtest.fake_input(d, X.ButtonPress, button)
    sync()
    time.sleep(0.08)
    xtest.fake_input(d, X.ButtonRelease, button)
    sync()


def key(keysym_name):
    ks = XK.string_to_keysym(keysym_name)
    code = d.keysym_to_keycode(ks)
    xtest.fake_input(d, X.KeyPress, code)
    sync()
    xtest.fake_input(d, X.KeyRelease, code)
    sync()


def type_text(text):
    for ch in text:
        ks = XK.string_to_keysym(ch) if ch != " " else XK.string_to_keysym("space")
        code = d.keysym_to_keycode(ks)
        xtest.fake_input(d, X.KeyPress, code)
        sync()
        xtest.fake_input(d, X.KeyRelease, code)
        sync()


def shot(path):
    subprocess.run(["import", "-window", "root", path], check=True)


def windows():
    out = []

    def walk(win, depth=0):
        try:
            attrs = win.get_attributes()
            if attrs.map_state == X.IsViewable:
                geom = win.get_geometry()
                name = win.get_wm_name()
                if geom.width > 50 and geom.height > 50:
                    out.append(f"{name!r} {geom.width}x{geom.height}+{geom.x}+{geom.y}")
            for c in win.query_tree().children:
                walk(c, depth + 1)
        except Exception:
            pass

    walk(root)
    return out


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "shot":
        shot(sys.argv[2])
    elif cmd == "windows":
        print("\n".join(windows()))
    elif cmd == "move":
        move(sys.argv[2], sys.argv[3])
    elif cmd == "click":
        click(int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]) if len(sys.argv) > 4 else 1)
    elif cmd == "key":
        key(sys.argv[2])
    elif cmd == "type":
        type_text(sys.argv[2])
    else:
        print("unknown", cmd)
