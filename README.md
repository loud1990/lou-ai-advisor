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
  - **Dedications** — at the dawn of each Age the advisors ask you to **dedicate
    the Age to 3 Triumphs** (Major Legacies). Pick 3 from a grouped, selectable
    list of the Age's available Triumphs; the choice is remembered per Age. Once
    chosen, the tab becomes a live **tracking board**: each dedication shows a
    progress bar, an **on-track verdict** (your completion vs the Age clock —
    On track / Slightly behind / Behind / Complete) and concrete, advisor-voiced
    **guidance on what to build or do** to get there. "Change Selection" re-opens
    the picker. Read live from `player.Legacies` (`isValidLegacy`, `isTriggered`,
    `getProgress`) and the Age clock (`Game.AgeProgressManager`). Completing a
    Triumph banks its Legacy Points and unlocks its Dedication for the next Age.
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
  - **Cities** — every City gets its own advisor on the council. A city advisor
    is created when a settlement first becomes a **City** (founded as your capital,
    a **Town upgraded to a City**, or a **City taken by conquest** — a settlement
    captured *as a Town* gets none until it upgrades). The city advisors coordinate
    with each other and with the five domain advisors: the empire's chosen
    Dedications + Victory standing become a per-attribute priority, which is spread
    across the cities by each city's strengths (`assignFoci`) so they collectively
    cover the goals. Each city advisor then scores that city's *actually buildable*
    items (read with the same engine queries the base production chooser uses) and
    recommends what to build next, with an advisor-voiced reason. The tab lists
    every city advisor, its focus, and its top pick; selecting a city in-game opens
    a side **overlay** beside the production chooser with the full recommendation
    and a one-click **Build this** button (`applyBuild`, mirroring the base game's
    `Construct`). Read live from `player.Cities`, `city.Yields`, `Players.Advisory`
    and `player.Victories`/`player.Legacies`.
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
ui/ai-advisor-dedications.js    # per-Age "pick 3 Triumphs" store + tracking/guidance (shared)
ui/ai-advisor-city-council.js   # per-city advisors: registry/lifecycle, empire priorities, focus assignment, build recommendation (shared)
ui/ai-advisor-city-panel.js     # per-city overlay shown on the city screen (Build this)
ui/ai-advisor-city-panel.html.js# city overlay markup (fxs-frame)
ui/ai-advisor-state.js          # emits per-turn empire + dedication state to UI.log
ui/ai-advisor-autoplay.js       # in-engine autoplay (growth/research/production/units/end-turn)
text/en_us/en_US_Text.xml       # localized strings
tools/launch.sh                 # launch the NATIVE Vulkan renderer via Steam (stable)
tools/resume.sh                 # drive menus into the loaded save (XTEST, verify+retry)
harness/play.py                 # set the autoplay stop-turn and observe the run
tools/xui.py                    # X11 screenshot/input helper used for testing
kb/benchmarks.md                # researched post-1.4.0 progress benchmarks (sourced)
advisors/benchmarks.py          # structured benchmarks + assess(): pace + rival check
```

## Progress benchmarks (post Test of Time / 1.4.0)

`kb/benchmarks.md` is a researched, sourced reference for "where should I be by
now?" at points across each Age, current as of **Update 1.4.0 "Test of Time"**
(19 May 2026) — the rebalance that reworked Victories/Triumphs and cut yield
bloat, so all pre-May-2026 guides overstate yields and are not used.

`advisors/benchmarks.py` turns it into structured data + an `assess(state, rivals)`
helper the council calls. It runs two checks by design:

- **Static pacing** (Antiquity, before you meet the other continent): completion
  turn, cities/settlements, wonders, tourism, and "future civics" overflow vs
  post-1.4.0 competitive snapshots (CivFanatics 7OTM June 2026 completion games).
- **Relative-to-rival** (Exploration onward): the three Dominance victories are
  won by reaching a **shrinking multiple of the 2nd-place player's score**
  (6×→4×→3×→2×→1.5×→1.25×) and holding it 5 turns; Science needs 100 Innovation +
  a rocket. Once rival scores are visible, this is weighted over the static marks.

`assess()` output is injected into every advisor's prompt (`advisors/advisor.py`),
and the prose is indexed into the KB for retrieval via `python3 kb/ingest.py curate`.

## Status

✅ **Verified working in Civ 7 (build 1.4.0).** The AI Advisor button appears in
the sub-system dock and opens the panel with live game data (turn, age, leader,
civ, settlements, per-turn yields). See `screenshots/ai-advisor-panel-open.jpg`.

✅ **Dedications verified live (turn 18, Antiquity).** Opening the panel defaults
to the new **Dedications** tab, which asked "the dawn of Antiquity — choose 3
Triumphs to dedicate this Age," listing the real Major Triumphs grouped by
attribute (e.g. *Wonders of the Ancient World* "Build 7 Wonders", *Code of
Hammurabi*, *Pulling the Strings* "Become Suzerain of 4 City-States") with live
progress. Selecting 3 and confirming switched to the tracking board: *Wonders of
the Ancient World* read **Behind · 0/7** with a Culture Advisor push to raise
Wonders, *Code of Hammurabi* read **On track · 1/9** — each with a progress bar
and a concrete action list. The state emitter logged
`AI_ADVISOR_DEDICATIONS: {"chosen":[…],"needsPrompt":…,"ageFrac":0.09,"items":[…]}`.
See `screenshots/dedications-picker.jpg`, `dedications-3-selected.jpg`,
`dedications-tracking.jpg` and project memory `civ7-dedications-feature`.

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
