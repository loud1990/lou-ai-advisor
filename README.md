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
  - **Victory** — the four **Test of Time** Victory Conditions to target, each
    decided in the Modern Age by having the greatest of a single measure:
    **Dominion** (Military), **Tourism** (Cultural), **GDP** (Economic), and
    **Innovation** (Scientific). For each: how it is won, your live standing vs
    your strongest rival, and a verdict (Leading / Competitive / Behind). Below
    that, **Triumphs This Age** lists the Triumphs (Legacies) you're advancing,
    with requirement and progress. Read live from `player.Victories`,
    `player.Legacies`, and `Game.VictoryManager`.
  - **Council** — each advisor's recommendation, annotated with your live
    standing in the Victory it drives (Military/Cultural/Economic/Scientific).
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
ui/ai-advisor-state.js          # emits per-turn empire state to UI.log
ui/ai-advisor-autoplay.js       # in-engine autoplay (growth/research/production/units/end-turn)
text/en_us/en_US_Text.xml       # localized strings
tools/launch.sh                 # launch the NATIVE Vulkan renderer via Steam (stable)
tools/resume.sh                 # drive menus into the loaded save (XTEST, verify+retry)
harness/play.py                 # set the autoplay stop-turn and observe the run
tools/xui.py                    # X11 screenshot/input helper used for testing
```

## Status

✅ **Verified working in Civ 7 (build 1.4.0).** The AI Advisor button appears in
the sub-system dock and opens the panel with live game data (turn, age, leader,
civ, settlements, per-turn yields). See `screenshots/ai-advisor-panel-open.jpg`.

✅ **Victory tab verified live (turn 13, Antiquity).** The panel's default tab
lists the four Test of Time Victory Conditions — Military (Dominion), Cultural
(Tourism), Economic (GDP), Scientific (Innovation) — each with how it is won,
your live standing vs your strongest rival, and a verdict. In a live run the
Military card read **8 Dominion (2 Settlements ×4), Leading**, confirming
`player.Victories.getPointsForVictoryType()` returns live scores from Antiquity
onward. The Council advisors are annotated with their Victory standing. See the
project memory `civ7-test-of-time-victories`.

> **Test of Time (1.4.0):** this update replaced the old fixed **Legacy Paths**
> with **Triumphs** (per-Age challenges across six attributes) and reworked
> **Victories** into the four score-based conditions above. The mod was migrated
> off the deprecated `LegacyPaths` API onto `player.Victories` / `player.Legacies`.

✅ **Plays ten turns unattended.** Launched with the native Vulkan renderer
(`tools/launch.sh vulkan` — far more stable than the default DX12/VKD3D path),
the autoplay mod advances turns hands-free, auto-resolving the city-growth tile
placement, empty research/production, and idle/stacked units (auto-explore), then
ending each turn in-engine. A live run reached **turn 12 from a turn-2 save with
zero crashes**. See `playthrough/turns-1-10.md` and project memory
`civ7-vulkan-launch-stability` / `civ7-autoplay-harness`.

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
