/**
 * AI Advisor state emitter.
 *
 * Bridges the in-game state to the external advisor pipeline: on each local
 * player turn it gathers a structured snapshot of the empire and writes it to
 * UI.log as a single line:  AI_ADVISOR_STATE: {...json...}
 *
 * The Python harness tails UI.log, parses these lines, and feeds them to the
 * advisor council. console.error is used because that is what reaches UI.log.
 */
const TAG = "AI_ADVISOR_STATE:";

const YIELDS = [
	["gold", "YIELD_GOLD"],
	["science", "YIELD_SCIENCE"],
	["culture", "YIELD_CULTURE"],
	["happiness", "YIELD_HAPPINESS"],
	["production", "YIELD_PRODUCTION"],
	["food", "YIELD_FOOD"],
];

function safe(fn, dflt) {
	try { return fn(); } catch (e) { return dflt; }
}

function progressionName(player, kind) {
	// kind: "Techs" or "Culture" — returns {name, turnsLeft} for active research
	return safe(() => {
		const sys = player[kind];
		if (!sys) return null;
		const treeType = kind === "Techs" ? sys.getTreeType() : sys.getActiveTree();
		const tree = Game.ProgressionTrees.getTree(player.id, treeType);
		if (!tree || tree.activeNodeIndex < 0) return null;
		const activeNode = tree.nodes[tree.activeNodeIndex];
		const info = GameInfo.ProgressionTreeNodes.lookup(activeNode.nodeType);
		const name = info ? Locale.compose(info.Name ?? info.ProgressionTreeNodeType) : null;
		return { name, turnsLeft: safe(() => sys.getTurnsLeft(), null) };
	}, null);
}

function gatherState() {
	const player = safe(() => Players.get(GameContext.localPlayerID), null);
	const state = {
		turn: safe(() => Game.turn, null),
		age: safe(() => Locale.compose(GameInfo.Ages.lookup(Game.age).Name), null),
		leader: safe(() => Locale.compose(player.leaderName), null),
		civ: safe(() => Locale.compose(player.civilizationFullName), null),
		yields: {},
		cities: [],
		units: [],
		research: null,
		civic: null,
	};
	if (!player) return state;

	const stats = safe(() => player.Stats, null);
	if (stats) {
		for (const [label, yt] of YIELDS) {
			state.yields[label] = safe(() => Math.round(stats.getNetYield(YieldTypes[yt]) * 10) / 10, null);
		}
	}
	state.yields.gold_balance = safe(() => Math.round(player.Treasury.goldBalance), null);

	const cities = safe(() => player.Cities.getCities(), []) || [];
	for (const c of cities) {
		state.cities.push({
			name: safe(() => Locale.compose(c.name), null),
			population: safe(() => c.population, null),
			producing: safe(() => {
				const item = c.BuildQueue?.currentProductionTypeHash;
				if (item == null) return null;
				const u = GameInfo.Units.lookup(item);
				const b = GameInfo.Constructibles.lookup(item);
				const p = GameInfo.Projects.lookup(item);
				const def = u || b || p;
				return def ? Locale.compose(def.Name) : null;
			}, null),
		});
	}

	// units grouped by type
	const counts = {};
	const units = safe(() => player.Units.getUnits(), []) || [];
	for (const u of units) {
		const t = safe(() => {
			const info = GameInfo.Units.lookup(u.type);
			return info ? Locale.compose(info.Name) : null;
		}, null);
		if (t) counts[t] = (counts[t] || 0) + 1;
	}
	state.units = Object.entries(counts).map(([type, count]) => ({ type, count }));

	state.research = progressionName(player, "Techs");
	state.civic = progressionName(player, "Culture");
	return state;
}

function emit() {
	try {
		const state = gatherState();
		console.error(`${TAG} ${JSON.stringify(state)}`);
	} catch (e) {
		console.error("AI_ADVISOR_STATE_ERROR:", e);
	}
}

// Emit on each local player's turn, plus once shortly after load.
try {
	engine.on("PlayerTurnActivated", (data) => {
		if (data && data.player === GameContext.localPlayerID) {
			emit();
		}
	});
	engine.on("LocalPlayerTurnBegin", () => emit());
} catch (e) {
	console.error("AI_ADVISOR_STATE: failed to bind engine events", e);
}
setTimeout(emit, 4000);
