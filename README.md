# Lou's AI Advisor (Civ 7 mod)

A UI mod for Sid Meier's Civilization VII. It adds a button to the sub-system
dock (the top-left row that holds Religion, Great Works, Advisors, …) which opens
an **AI Advisor** panel showing live game information. This is the foundation for
a future AI-driven advisor feature.

## What it does

- Adds an **AI Advisor** button to the sub-system dock via the game's official
  `ModdingRegistry` mod slot (`panel-sub-system-dock-mod-slot`), with a fallback
  injector for UI reloads.
- Clicking it opens a framed panel (`ai-advisor-panel`) with:
  - **Empire Overview** — turn, age, leader, civilization, settlement count
  - **Yields Per Turn** — gold, science, culture, happiness, production, food
- All data is read defensively from the local player; missing values degrade
  gracefully instead of erroring.

## Layout

```
lou-ai-advisor.modinfo          # mod manifest (game-scope UIScripts + text)
ui/ai-advisor-button.js         # dock button component + registration
ui/ai-advisor-panel.js          # panel component (Panel subclass)
ui/ai-advisor-panel.html.js     # panel markup (fxs-frame)
text/en_us/en_US_Text.xml       # localized strings
tools/xui.py                    # X11 screenshot/input helper used for testing
```

## Status

✅ **Verified working in Civ 7 (build 1.4.0).** The AI Advisor button appears in
the sub-system dock and opens the panel with live game data (turn, age, leader,
civ, settlements, per-turn yields). See `screenshots/ai-advisor-panel-open.jpg`.

## Install / test

The mod folder is symlinked into the game's Mods directory:

```
~/My Games/Sid Meier's Civilization VII/Mods/lou-ai-advisor -> this repo
```

Launch the game (`steam steam://rungameid/1295660`) and **start a New Game** with
the mod enabled — the AI Advisor button appears at the end of the sub-system dock
(it reuses the advisors speech-bubble icon). Click it to open the panel.

Important gotchas (learned the hard way, see project memory):
- The mod must be active in the game's mod set — **Continue/Load of a save made
  before the mod existed will not activate it**; start a New Game.
- Early-game, Civ 7's tutorial hides most dock buttons until ~turn 4; turning
  Tutorials off (Options → Game) reveals the full dock immediately.
- On this machine the game must target the display-attached GPU
  (`AppOptions.txt` `[Video] DeviceID 8708`, the RTX 3090) or it crashes at
  startup with a DXGI swapchain error.

See the project memory `civ7-mod-testing-setup` for the full launch / input /
screenshot workflow (uinput injection + Steam F12 capture).

## Notes

- The button reuses the base-game `advisors` icon and dock button classes so it
  matches native styling with no custom CSS.
- Built by inspecting real base-game UI files (`panel-sub-system-dock`,
  `player-yields-report-screen`) — no invented APIs.
