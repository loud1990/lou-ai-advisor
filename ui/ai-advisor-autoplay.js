/**
 * AI Advisor autoplay helpers.
 *
 * The harness drives the game by ending turns. Two things can silently block a
 * turn from ending and stall the whole playthrough:
 *
 *   1. City growth — when a settlement grows it enters
 *      INTERFACEMODE_ACQUIRE_TILE and waits for the player to click a plot to
 *      expand onto (the "place population" micro). Until a plot is chosen the
 *      end-turn is gated, so an unattended harness hangs forever.
 *
 * This script auto-resolves that micro: on each local turn (and on a short
 * safety sweep) it finds every city that is ready to place population and picks
 * the best available expand plot by yield, committing it with the same
 * CityCommands.EXPAND request the base-game acquire-tile interface mode uses
 * (see base-standard ui/interface-modes/interface-mode-acquire-tile.js and
 * ui/place-population/model-place-population.js). Each placement is logged as
 *   AI_ADVISOR_GROWTH: {...json...}
 * so the Python harness can record what the empire chose.
 *
 * It also fills empty research/production slots (which also hard-block end-turn)
 * and — when AUTOPLAY_STOP_TURN is set — ends turns *in-engine* via
 * GameContext.sendTurnComplete(). Because every one of these actions runs inside
 * the game process, the harness works with the game window unfocused or
 * minimised: nothing here depends on injected mouse/keyboard input.
 *
 * All game APIs used here are the same ones the base UI uses; nothing invented.
 */
const TAG = "AI_ADVISOR_GROWTH:";

// Auto-end turns up to (but not including) this turn number, then hand control
// back. <= 0 disables auto-advance entirely (the mod then only handles the
// blocking micros and leaves ending the turn to the player/driver). The harness
// rewrites this line before launch to pace an automated run.
const AUTOPLAY_STOP_TURN = 0;

// Set whenever we send any slot-filling request, so auto-end-turn waits for the
// async command to settle before ending (otherwise we'd end on a stale state).
let lastActionAt = 0;

// Food/production are weighted slightly higher: early-game growth tiles want to
// compound population and hammers. Everything else counts at face value.
const YIELD_WEIGHTS = {
	YIELD_FOOD: 1.2,
	YIELD_PRODUCTION: 1.15,
};

function safe(fn, dflt) {
	try { return fn(); } catch (e) { return dflt; }
}

// EXPAND is async: isReadyToPlacePopulation does not clear synchronously. Track
// the last time we sent a placement per city so the 4s safety sweep cannot fire
// a duplicate request into the same race window.
const lastSent = new Map();
const SETTLE_MS = 2500;

function log(obj) {
	try { console.error(`${TAG} ${JSON.stringify(obj)}`); } catch (e) { /* ignore */ }
}

function weightFor(yieldHash) {
	for (const [name, w] of Object.entries(YIELD_WEIGHTS)) {
		if (safe(() => Database.makeHash(name), null) === yieldHash) return w;
	}
	return 1.0;
}

// Total weighted yield of a plot for the local player. getYields returns an
// array of [yieldHash, amount] pairs (see model-yields-report.js).
function scorePlot(plotIndex, playerId) {
	const pairs = safe(() => GameplayMap.getYields(plotIndex, playerId), null);
	if (!Array.isArray(pairs)) return 0;
	let total = 0;
	for (const pair of pairs) {
		const amt = Array.isArray(pair) ? (pair[1] ?? 0) : 0;
		total += amt * weightFor(pair[0]);
	}
	// A tiny nudge toward fresh-water / resource tiles when yields tie.
	const loc = safe(() => GameplayMap.getLocationFromIndex(plotIndex), null);
	if (loc) {
		if (safe(() => GameplayMap.isFreshWater(loc.x, loc.y), false)) total += 0.5;
		const res = safe(() => GameplayMap.getResourceType(loc.x, loc.y), -1);
		if (res != null && res != -1) total += 1.0;
	}
	return total;
}

// Returns the best expand plot {plotIndex, x, y, score} for a city, or null.
function bestExpandPlot(cityId, playerId) {
	const result = safe(
		() => Game.CityCommands.canStart(cityId, CityCommandTypes.EXPAND, {}, false),
		null
	);
	const plots = result && result.Plots;
	if (!plots || plots.length === 0) return null;
	let best = null;
	for (const plotIndex of plots) {
		const score = scorePlot(plotIndex, playerId);
		if (!best || score > best.score) {
			const loc = safe(() => GameplayMap.getLocationFromIndex(plotIndex), null);
			if (loc) best = { plotIndex, x: loc.x, y: loc.y, score };
		}
	}
	return best;
}

// Resolve every pending city-growth placement for the local player. A single
// city can have several population to place at once, so we loop until it is no
// longer ready (capped to avoid any infinite loop on an unexpected state).
function resolveGrowth() {
	const playerId = safe(() => GameContext.localPlayerID, -1);
	const player = safe(() => Players.get(playerId), null);
	if (!player) return;
	const isLocalTurn = safe(() => player.isTurnActive, true);
	if (!isLocalTurn) return;

	const cityIds = safe(() => player.Cities?.getCityIds(), null) || [];
	for (const cityId of cityIds) {
		for (let guard = 0; guard < 12; guard++) {
			const city = safe(() => Cities.get(cityId), null);
			if (!city) break;
			if (!safe(() => city.Growth?.isReadyToPlacePopulation, false)) break;

			const key = safe(() => ComponentID.toLogString(cityId), String(cityId));
			const prev = lastSent.get(key);
			if (prev && Date.now() - prev < SETTLE_MS) break; // request in flight

			const pick = bestExpandPlot(cityId, playerId);
			if (!pick) {
				log({ turn: safe(() => Game.turn, null), city: safe(() => Locale.compose(city.name), null), placed: false, reason: "no valid expand plots" });
				break;
			}
			const ok = safe(() => {
				Game.CityCommands.sendRequest(cityId, CityCommandTypes.EXPAND, { X: pick.x, Y: pick.y });
				return true;
			}, false);
			if (ok) { lastSent.set(key, Date.now()); lastActionAt = Date.now(); }
			log({
				turn: safe(() => Game.turn, null),
				city: safe(() => Locale.compose(city.name), null),
				placed: ok,
				plot: { x: pick.x, y: pick.y },
				score: Math.round(pick.score * 100) / 100,
			});
			if (!ok) break;
			// EXPAND is async; give the command a moment to flip the flag before
			// re-checking, otherwise we'd re-pick the same (now-stale) plot.
			break;
		}
	}
}

// ---------------------------------------------------------------------------
// Anti-stall defaults: an EMPTY research slot or an EMPTY city production slot
// hard-blocks end-turn (the game pops the tech/production chooser). The harness
// can't end the turn until they're filled. These helpers only ever fill an
// empty slot — they never override a choice already made — so they unblock the
// turn loop without hijacking strategy. Uses the same operations the base-game
// choosers use (SET_TECH_TREE_NODE; CityOperations.BUILD).
// ---------------------------------------------------------------------------

const TECH_TAG = "AI_ADVISOR_TECH:";
const PROD_TAG = "AI_ADVISOR_PROD:";

function hasActiveResearch(player) {
	return safe(() => {
		const sys = player.Techs;
		if (!sys) return true; // can't tell -> don't act
		const tree = Game.ProgressionTrees.getTree(player.id, sys.getTreeType());
		return !!(tree && tree.activeNodeIndex >= 0);
	}, true);
}

function autoResearch(playerId, player) {
	if (hasActiveResearch(player)) return;
	const sys = safe(() => player.Techs, null);
	const tree = safe(() => Game.ProgressionTrees.getTree(player.id, sys.getTreeType()), null);
	if (!tree || !tree.nodes) return;
	// Probe each node: the first that canStart is a valid, available research.
	for (const node of tree.nodes) {
		const nodeType = node && node.nodeType;
		if (nodeType == null) continue;
		const args = { ProgressionTreeNodeType: nodeType };
		const ok = safe(() => Game.PlayerOperations.canStart(playerId, PlayerOperationTypes.SET_TECH_TREE_NODE, args, false), null);
		if (ok && ok.Success) {
			const sent = safe(() => {
				Game.PlayerOperations.sendRequest(playerId, PlayerOperationTypes.SET_TECH_TREE_NODE, args);
				return true;
			}, false);
			if (sent) lastActionAt = Date.now();
			const name = safe(() => Locale.compose(GameInfo.ProgressionTreeNodes.lookup(nodeType).Name), String(nodeType));
			try { console.error(`${TECH_TAG} ${JSON.stringify({ turn: safe(() => Game.turn, null), research: name, set: sent })}`); } catch (e) {}
			return;
		}
	}
}

// Build a prioritised list of unit-build args to try. We probe GameInfo.Units
// directly with CityOperations.canStart (the same robust canStart-probe pattern
// autoResearch uses) rather than relying on CityOperations.canStartQuery +
// CityQueryType — that enum is not reliably exposed as a global in this raw
// UIScript scope, so the query silently fails and production never fills.
const PREFERRED_UNITS = /SCOUT|WARRIOR|SLINGER|BUILDER|SETTLER|MIGRANT/i;

function buildableUnitArgs(cityId) {
	// GameInfo.Units supports .forEach/.find/.filter (array-like) but is not
	// necessarily for..of-iterable, so use forEach.
	const units = safe(() => GameInfo.Units, null);
	if (!units || typeof units.forEach !== "function") return null;
	let chosen = null, fallback = null;
	units.forEach((def) => {
		if (chosen) return;
		const typeName = def && def.UnitType;
		if (!typeName) return;
		const typeInfo = safe(() => GameInfo.Types.lookup(typeName), null);
		if (!typeInfo) return;
		const args = { UnitType: typeInfo.Hash };
		const can = safe(() => Game.CityOperations.canStart(cityId, CityOperationTypes.BUILD, args, false), null);
		if (!can || !can.Success) return;
		const entry = { args, name: safe(() => Locale.compose(def.Name), typeName) };
		if (PREFERRED_UNITS.test(typeName)) chosen = entry;
		else if (!fallback) fallback = entry;
	});
	return chosen || fallback;
}

function autoProduction(playerId, player) {
	const cityIds = safe(() => player.Cities?.getCityIds(), null) || [];
	for (const cityId of cityIds) {
		const city = safe(() => Cities.get(cityId), null);
		if (!city) continue;
		// An empty production slot reports currentProductionTypeHash === -1 (or
		// null), NOT a falsy 0 — a real queued item is a large positive hash.
		const busy = safe(() => city.BuildQueue?.currentProductionTypeHash, -1);
		if (busy != null && busy !== -1) continue; // already building — leave it

		const pick = safe(() => buildableUnitArgs(cityId), null);
		if (!pick) continue;
		const sent = safe(() => {
			Game.CityOperations.sendRequest(cityId, CityOperationTypes.BUILD, pick.args);
			return true;
		}, false);
		if (sent) lastActionAt = Date.now();
		try { console.error(`${PROD_TAG} ${JSON.stringify({ turn: safe(() => Game.turn, null), city: safe(() => Locale.compose(city.name), null), build: pick.name, set: sent })}`); } catch (e) {}
	}
}

function autoFillEmptySlots() {
	const playerId = safe(() => GameContext.localPlayerID, -1);
	const player = safe(() => Players.get(playerId), null);
	if (!player) return;
	if (!safe(() => player.isTurnActive, true)) return;
	safe(() => autoResearch(playerId, player), null);
	safe(() => autoProduction(playerId, player), null);
}

// ---------------------------------------------------------------------------
// In-engine turn advancement. Ends the local player's turn via the same call
// the action panel uses (GameContext.sendTurnComplete), after clearing the only
// soft blocker an unattended empire produces: idle units (e.g. the Scout), which
// we mark SKIP_TURN. Because this never touches the OS input layer it advances
// turns whether or not the game window is focused. Paced by AUTOPLAY_STOP_TURN.
// ---------------------------------------------------------------------------

const TURN_TAG = "AI_ADVISOR_TURN:";

// Clear every idle unit so it stops blocking end-turn. Auto-explore is tried
// FIRST: a freshly-built Scout sits stacked on the city tile, and two units
// can't share a tile, so simply skipping leaves an unmovable stack that blocks
// the turn forever. Auto-explore walks the unit off the tile and gives it a
// useful standing order. Skip/Fortify/Sleep are fallbacks for units that can't
// explore. Operation TYPE is a STRING (the UnitOperationTypes enum is not a
// reliable global here; string type names work, per the base acquire-tile code).
const IDLE_UNIT_OPS = [
	"UNITOPERATION_AUTOMATE_EXPLORE",
	"UNITOPERATION_SKIP_TURN",
	"UNITOPERATION_FORTIFY",
	"UNITOPERATION_SLEEP",
];
function skipIdleUnits(player) {
	const units = safe(() => player.Units?.getUnits(), null) || [];
	let skipped = 0;
	for (const u of units) {
		for (const op of IDLE_UNIT_OPS) {
			const can = safe(() => Game.UnitOperations.canStart(u.id, op, {}, false), null);
			if (can && can.Success) {
				const ok = safe(() => { Game.UnitOperations.sendRequest(u.id, op, {}); return true; }, false);
				if (ok) { skipped++; break; }
			}
		}
	}
	return skipped;
}

function autoEndTurn() {
	if (AUTOPLAY_STOP_TURN <= 0) return;
	const playerId = safe(() => GameContext.localPlayerID, -1);
	const player = safe(() => Players.get(playerId), null);
	if (!player || !safe(() => player.isTurnActive, false)) return;

	const turn = safe(() => Game.turn, null);
	if (turn != null && turn >= AUTOPLAY_STOP_TURN) return;   // reached target
	if (safe(() => GameContext.hasSentTurnComplete(), false)) return; // already ending
	if (Date.now() - lastActionAt < SETTLE_MS) return; // let a slot-fill settle first

	// Clear any stuck non-default interface mode (e.g. a leftover tile-acquire
	// placement interrupted by a milestone popup). Growth is resolved earlier in
	// the sweep, so dropping back to default here is safe and unblocks end-turn.
	const mode = safe(() => InterfaceMode.getCurrent(), null);
	if (mode && mode !== "INTERFACEMODE_DEFAULT") {
		safe(() => InterfaceMode.switchToDefault(), null);
	}

	// Empty research/production (the hard blockers) are filled earlier in the
	// sweep and settle-guarded above, so by here the only thing left to clear is
	// idle units. Mark them done, then end the turn the same way the action panel
	// does. (We don't gate on getEndTurnBlockingType / EndTurnBlockingTypes — that
	// enum isn't a reliable global here; ending is idempotent under the
	// hasSentTurnComplete guard, so a rejected send just retries next sweep.)
	skipIdleUnits(player);
	safe(() => UI.Player.deselectAllUnits(), null);
	const sent = safe(() => { GameContext.sendTurnComplete(); return true; }, false);
	try { console.error(`${TURN_TAG} ${JSON.stringify({ endedTurn: turn, sent })}`); } catch (e) {}
}

// Each step is isolated: a throw in one (e.g. an unexpected engine state) must
// never prevent the others — especially autoEndTurn — from running.
function sweep() {
	safe(resolveGrowth, null);
	safe(autoFillEmptySlots, null);
	safe(autoEndTurn, null);
}

// IMPORTANT: this UI scripting environment does not run setInterval (only
// setTimeout fires). A one-shot per-turn sweep is not enough — growth becomes
// ready mid-turn, production empties when a build finishes, and auto-end is
// settle-guarded right after a slot-fill — all of which need a *recurring*
// sweep. So we self-reschedule with setTimeout to form a reliable 3s loop.
const SWEEP_MS = 3000;
function tick() {
	safe(sweep, null);
	setTimeout(tick, SWEEP_MS);
}

try {
	engine.on("PlayerTurnActivated", (data) => {
		if (data && data.player === GameContext.localPlayerID) {
			setTimeout(sweep, 1200);
		}
	});
	engine.on("LocalPlayerTurnBegin", () => setTimeout(sweep, 1200));
	engine.on("CityGrowthChanged", () => setTimeout(resolveGrowth, 400));
} catch (e) {
	console.error("AI_ADVISOR_GROWTH: failed to bind engine events", e);
}
setTimeout(tick, SWEEP_MS);
