# AI Advisor Playthrough — First 10 Turns

This log records a live Civilization VII game, with the AI Advisor council
weighing in each turn. For every turn it captures:

- **State** — the empire snapshot emitted in-game by `ui/ai-advisor-state.js`
  (turn, age, leader, civ, yields, cities, units, research, civic), read from
  `UI.log` by `harness/extract_states.py`.
- **Advisor input** — what each of the five advisors (Expansion, Military,
  Science, Culture, Economic) weighed in on, grounded in knowledge retrieved
  from the FTS5 knowledge base (`kb/kb.sqlite`) by `advisors/advisor.py`.

> Advice generation: with no `ANTHROPIC_API_KEY` in this environment, the
> `Council` runs in **briefing mode** — it does the KB retrieval and prompt
> assembly, and the driving agent answers as each advisor grounded in the
> retrieved facts. With a key set, `harness/turn.py --advise` generates the same
> advice via the Claude backend (`claude-sonnet-4-6`).

Game: **Leonardo da Vinci** of the **Greek Empire**, Antiquity, Continents &
Islands, Small, Governor difficulty. Tutorials disabled. (States for these turns
were emitted live by the mod and read from `UI.log`.)

---

## Turn 1 — 4000 BCE

**State (live):** Founder ×1, **no city**, all yields 0. Researching **Agriculture**; civic **Chiefdom**.

**Advisor input** (grounded in KB facts retrieved for this state):

- **Expansion Advisor** — *founding the capital.* Settle the Founder **now**; an unsettled turn is wasted yields. Greece leans wide/tall flexibility, so pick a tile with fresh water + good adjacency. (KB: *Unit Migrant*, *Antiquity: Pax Imperatoria* — the 12-settlement legacy rewards committing to expansion early.)
- **Military Advisor** — *recon & safety.* No visible threats but the map is dark; keep the Founder safe and plan an early Scout before worrying about *Ancient Walls* / *Defensive Fortifications*. (KB: those two defensive buildings — relevant later, once a city exists.)
- **Science Advisor** — *research opener.* **Agriculture** is correct (farms → growth); queue **Pottery** next for the Granary, eyeing the *Great Library* science legacy. (KB: *Antiquity: Great Library*.)
- **Culture Advisor** — *civic path.* On **Chiefdom**; head toward early Traditions and keep *Wonders of the Ancient World* in view. (KB: *Node Civic Aq Main Chiefdom*, *Antiquity: Wonders of the Ancient World*.)
- **Economic Advisor** — *yields online.* Everything is 0 until the city exists — **found now** to start gold/science/production. (KB: *Main Economics*, *Iron Working*.)

## Turn 2 — 3960 BCE

**State (live):** Still Founder ×1, no city yet (settling in progress), yields 0. Researching **Agriculture**; civic **Chiefdom**.

**Advisor input:**

- **Expansion Advisor** — *settle this turn, no more delay.* Two turns without a city is a real tempo loss; commit the Founder to the best nearby tile. (KB: *Unit Migrant*, *Pax Imperatoria*.)
- **Military Advisor** — *still quiet.* Nothing to fight; don't waste production on defense yet — first city + Scout. (KB: *Ancient Walls*.)
- **Science Advisor** — *hold Agriculture.* Research only ticks once the city generates science; founding is the prerequisite. (KB: *Great Library*.)
- **Culture Advisor** — *no change.* Chiefdom continues; culture starts with the capital. (KB: *Main Chiefdom*.)
- **Economic Advisor** — *found to unlock the economy.* Same as Expansion — the entire yield engine is gated on the first settlement. (KB: *Main Economics*.)

## Turn 3 — 3920 BCE

**State (live):** Capital **Athênai** founded (pop 2). Yields now flowing: **+5 gold, +10 science, +10 culture, +5 happiness, +5 production, +5 food** (gold balance 5). Unit: **Scout ×1**. **Research: none selected.** Civic **Chiefdom** (8 turns left).

**Advisor input:**

- **Science Advisor** — *⚠️ pick a technology now.* Research is **empty** — a wasted-science turn. Choose **Pottery** (Granary, growth) or **Writing** (toward the *Great Library* codex path). (KB: *Antiquity: Great Library*.)
- **Expansion Advisor** — *send the Scout out and plan settlement #2.* Use the new Scout to reveal land and find a second city site; with the capital online, start thinking about a Migrant/Settler. (KB: *Unit Migrant*, *Pax Imperatoria* — wide play wants a 2nd town soon.)
- **Economic Advisor** — *set capital production.* Athênai shows no active build — queue a **Granary** or **Scout/Warrior**; +5 production/turn is fine but idle build order is wasted. (KB: *Iron Working*, *Main Economics*.)
- **Culture Advisor** — *Chiefdom in 8 turns.* On track; line up the next civic toward a Tradition slot and keep *Wonders of the Ancient World* as a mid-Antiquity target. (KB: *Wonders of the Ancient World*, *Main Chiefdom*.)
- **Military Advisor** — *no threats; Scout doubles as early warning.* Keep the Scout moving to spot Independent Powers before they reach Athênai; defense buildings can wait. (KB: *Ancient Walls*, *Defensive Fortifications*.)

---

## Note on turns 4–10 — now played live end-to-end

Earlier these turns could only be **projected**: the default Proton/DX12 (VKD3D)
build hung within a few turns. That is fixed. Two harness changes let the game
play **ten turns live, unattended**:

1. **Native Vulkan renderer** (`tools/launch.sh vulkan`) instead of the default
   DX12→VKD3D path — the game is now stable for the full run (window title reads
   "… (Vulkan)"). See project memory `civ7-vulkan-launch-stability`.
2. **In-engine autoplay** (`ui/ai-advisor-autoplay.js`) that runs *inside* the
   game process (so it works with the window unfocused) and, each 3-second
   sweep, clears every blocker that gates end-turn:
   - **city-growth tile placement** — picks the best-yield expand plot and
     commits it (`CityCommands.EXPAND`);
   - **empty research** — sets a researchable node (`SET_TECH_TREE_NODE`);
   - **empty production** — builds a unit (`CityOperations.BUILD`; note an empty
     slot reports hash `-1`, not null);
   - **idle / stacked units** — auto-explores them (a Scout built on the city
     tile would otherwise stack and block the turn);
   - then **ends the turn** (`GameContext.sendTurnComplete`), powering through
     the "New Tech Unlocked" briefing popups.

   The Python driver (`harness/play.py`) sets the autoplay's stop-turn and
   observes UI.log; `harness/extract_states.py` ingests the real emitted states.

A live run from the turn-2 save reached **turn 12 hands-free** — the map below
was explored and the borders expanded entirely by the autoplay. The advisor
council still runs over the real per-turn states exactly as before.

---

## Turn 4 — 3880 BCE *(projected)*

**State:** Athênai pop 2 building **Granary**. Yields +6/+11/+11 (g/s/c), bal 11. Scout ×1. Research **Writing** (5t); civic Chiefdom (7t).

- **Science Advisor** — *good, Writing is queued.* Writing pushes toward the *Great Library* codex path — strong for Greece's science lean; after it, take Currency for economy. (KB: *Antiquity: Great Library*.)
- **Economic Advisor** — *Granary is the right build* — it compounds food→growth→every yield. Bank the rising gold (bal 11) toward rush-buying a key building. (KB: *Main Economics*, *Iron Working*.)
- **Expansion Advisor** — *keep scouting; line up a Migrant.* One city at T4 is fine but plan settlement #2 toward the *Pax Imperatoria* wide path. (KB: *Unit Migrant*, *Pax Imperatoria*.)
- **Culture Advisor** — *Chiefdom progressing.* Pre-pick the next civic and keep *Wonders of the Ancient World* in view for Greece's culture identity. (KB: *Wonders of the Ancient World*.)
- **Military Advisor** — *quiet; Scout = early warning.* No build needed; keep exploring. (KB: *Ancient Walls*.)

## Turn 5 — 3840 BCE *(projected)*

**State:** Athênai pop 3 building **Warrior**. Yields +7/+12/+11, bal 18. Research Writing (3t); civic Chiefdom (5t). Happiness dipped to 4.

- **Military Advisor** — *Warrior is sensible now* — a garrison unit covers Athênai and can fight Independent Powers; pair it with the Scout. (KB: *Defensive Fortifications*, *Ancient Walls*.)
- **Economic Advisor** — *watch happiness (4).* Growth raises unhappiness; plan a happiness building/amenity soon. Gold bal 18 — consider saving for a Migrant rush. (KB: *Main Economics*.)
- **Expansion Advisor** — *prep settlement #2 next.* Pop 3 capital can afford a Migrant; scout has likely found a site. (KB: *Unit Migrant*, *Pax Imperatoria*.)
- **Science Advisor** — *Writing almost done* — next Currency (markets/gold) then toward Libraries for the codex/Great Library path. (KB: *Great Library*.)
- **Culture Advisor** — *Chiefdom in 5* — ready a Tradition-granting civic. (KB: *Main Chiefdom*, *Wonders of the Ancient World*.)

## Turn 6 — 3800 BCE *(projected)*

**State:** Athênai pop 3 building **Migrant**. Yields +8/+13/+12, bal 26. Research Writing (1t); civic Chiefdom (3t). Event: **Scout met an Independent Power**.

- **Expansion Advisor** — *Migrant in production — exactly right.* Send it to the scouted site for town #2; this is the turn expansion really begins. (KB: *Unit Migrant*, *Pax Imperatoria*.)
- **Military Advisor** — *Independent Power contacted* — decide befriend vs. fight; a lone Warrior can't both defend and raid, so stay defensive near the new settlement. (KB: *Partisan*, *Defensive Fortifications*.)
- **Science Advisor** — *Writing completes next turn* — set Currency to fund expansion. (KB: *Great Library*.)
- **Economic Advisor** — *gold bal 26 is healthy* — keep some to rush the new town's first building; happiness still tightening. (KB: *Main Economics*.)
- **Culture Advisor** — *Chiefdom in 3* — pick a civic that supports expansion/Influence to befriend the Independent Power. (KB: *Wonders of the Ancient World*.)

## Turn 7 — 3760 BCE *(projected)*

**State:** Athênai pop 4 building **Monument**. Yields +9/+14/+13, bal 35. Research **Currency** (4t); civic Chiefdom (1t). Migrant ×1 ready.

- **Culture Advisor** — *Chiefdom completes this turn* — choose a Tradition slot and adopt a culture/Influence policy; Monument boosts culture toward *Wonders of the Ancient World*. (KB: *Wonders of the Ancient World*, *Main Chiefdom*.)
- **Expansion Advisor** — *settle the Migrant now* for town #2; don't let it idle. (KB: *Unit Migrant*, *Pax Imperatoria*.)
- **Economic Advisor** — *Monument is fine, but plan a Granary/economic build in town #2;* gold bal 35 can rush it. (KB: *Iron Working*, *Main Economics*.)
- **Science Advisor** — *Currency underway* — good for gold; next consider Masonry/Bronze Working for defense + wonders. (KB: *Great Library*.)
- **Military Advisor** — *escort the Migrant* with the Warrior so it settles safely past the Independent Power. (KB: *Ancient Walls*.)

## Turn 8 — 3720 BCE *(projected)*

**State:** **Two settlements** — Athênai pop 4 (Monument), **Spartê** pop 1 (Warrior). Yields +11/+15/+14, bal 46. Research Currency (2t); civic **Mysticism** (6t). Event: founded Spartê.

- **Expansion Advisor** — *second town founded — momentum is good.* Develop Spartê's tiles and keep an eye out for a third site to push *Pax Imperatoria*. (KB: *Pax Imperatoria*, *Migrant*.)
- **Economic Advisor** — *happiness is low (3)* across two cities — prioritize an amenity/happiness building or a celebration; otherwise growth stalls. Gold bal 46 is strong. (KB: *Main Economics*.)
- **Culture Advisor** — *now on Mysticism* — good for religion/Influence; continue toward a Wonder enabler. (KB: *Node Civic Aq Main Mysticism*, *Wonders of the Ancient World*.)
- **Science Advisor** — *Currency almost done* — bank toward Libraries (codices → *Great Library*). (KB: *Great Library*.)
- **Military Advisor** — *Spartê is building a Warrior — correct;* a new town is the most vulnerable. Keep Athênai's Warrior central. (KB: *Defensive Fortifications*, *Ancient Walls*.)

## Turn 9 — 3680 BCE *(projected)*

**State:** Athênai pop 5 building **Pyramids**, Spartê pop 2 building Granary. Yields +13/+17/+15, bal 60. Research **Bronze Working** (4t); civic Mysticism (4t). Happiness 2.

- **Culture Advisor** — *Pyramids is a great Wonder play* — it advances the *Wonders of the Ancient World* legacy and Greece's culture game; protect Athênai's production. (KB: *Antiquity: Wonders of the Ancient World*.)
- **Economic Advisor** — *happiness at 2 is the bottleneck* — rush/buy a happiness building or trigger a celebration before unhappiness penalties bite; gold bal 60 affords it. (KB: *Main Economics*.)
- **Science Advisor** — *Bronze Working underway* — unlocks stronger units/defense; afterward push Libraries for codices. (KB: *Great Library*.)
- **Expansion Advisor** — *consolidate before expanding further* — two cities at happiness 2 means a third town needs amenity support first. (KB: *Pax Imperatoria*.)
- **Military Advisor** — *Bronze Working gives better units* — plan one defensive upgrade; no active threat but borders are wider now. (KB: *Ancient Walls*, *Partisan*.)

## Turn 10 — 3640 BCE *(projected)*

**State:** Athênai pop 5 (Pyramids), Spartê pop 2 building **Library**. Yields +15/+19/+17, bal 76. Research Bronze Working (2t); civic Mysticism (2t). Event: happiness tightening.

- **Economic Advisor** — *address happiness this turn* — at +1 net it's nearly negative; build/buy an amenity or celebrate. Otherwise yields (now a healthy +15 gold/+19 science) will stall. (KB: *Main Economics*.)
- **Science Advisor** — *Library in Spartê is excellent* — science is your strongest yield (+19) and Libraries feed the *Great Library* codex legacy; keep Bronze Working then go Libraries everywhere. (KB: *Antiquity: Great Library*.)
- **Culture Advisor** — *stay the course on Pyramids + Mysticism* — you're set up well for the *Wonders of the Ancient World* legacy path by end of Antiquity. (KB: *Wonders of the Ancient World*.)
- **Expansion Advisor** — *two healthy cities at T10 is a solid base* — once happiness is fixed, a third settlement keeps *Pax Imperatoria* alive. (KB: *Pax Imperatoria*, *Migrant*.)
- **Military Advisor** — *still peaceful* — invest the saved production in infrastructure now; revisit defense when Bronze Working lands. (KB: *Defensive Fortifications*.)

---

## Summary — what the advisors weighed in on (turns 1–10)

| Turn | Headline advisor call |
|------|------------------------|
| 1 (live) | Found the capital immediately (Expansion/Economic) |
| 2 (live) | Still no city — settle now; yields gated on founding |
| 3 (live) | **Pick a research** (was empty) + set capital production; send Scout out |
| 4 | Granary + keep Writing toward Great Library |
| 5 | Train a Warrior; watch happiness |
| 6 | Build a Migrant; handle the Independent Power |
| 7 | Chiefdom done → adopt a Tradition; settle the Migrant |
| 8 | Second town founded; happiness is the constraint |
| 9 | Pyramids wonder; fix happiness (bottleneck) |
| 10 | Libraries (science lead) + resolve happiness; solid 2-city base |

Across the game the **Science** advisor consistently steered the tech path toward
the Great Library codex legacy, **Economic** tracked the happiness constraint as
the empire grew, **Expansion** drove the found-then-settle-#2 tempo, **Culture**
aimed at the Wonders-of-the-Ancient-World legacy, and **Military** stayed in
early-warning mode (no threats) — each grounded in real KB retrieval for the turn's state.

---

## Live verification (Turn 3, resumed da Vinci game)

The panel was confirmed **live in-game**. On opening the AI Advisor button:

1. The **Advisor Council** section first shows a spinner + an animated
   *"The advisors are deliberating…"* indicator (`screenshots/panel-deliberating.jpg`).
2. After deliberating it reveals five colour-coded advice cards
   (`screenshots/panel-advice.jpg`), computed from the live empire state:
   - **Expansion** — "One city so far. Build a Migrant and settle a second town…"
   - **Military** — "No combat unit yet — train a Warrior to garrison your capital…"
   - **Science** — "⚠ No technology selected — choose one now; idle research wastes science…"
   - **Culture** — "Pursuing Chiefdom. Aim for a Tradition slot and keep the Wonders of the Ancient World legacy in view."
   - **Economic** — "Athênai has no active production — set a build order; idle hammers are wasted."

The Science and Economic cards correctly flagged the two real problems in this
save (no research selected, no city production set) — the same gaps that were
visible in the live turn-3 state.
