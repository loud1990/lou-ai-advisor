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
import { getChosen, hasChosenThisAge, getTracking } from './ai-advisor-dedications.js';

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

// Test of Time (1.4.0) victory classes -> the stat each is won by.
const VICTORY_STAT = {
	VICTORY_CLASS_MILITARY: "Dominion",
	VICTORY_CLASS_CULTURE: "Tourism",
	VICTORY_CLASS_ECONOMIC: "GDP",
	VICTORY_CLASS_SCIENCE: "Innovation",
};

function gatherTriumphs(player) {
	// Test of Time victory conditions + this Age's Triumphs (Legacies). Each
	// victory is won by the greatest measured stat among leaders, so we emit your
	// points, the strongest rival's points, and whether you lead.
	const out = { isFinalAge: false, victories: [], ageTriumphs: [] };
	if (!player) return out;
	out.isFinalAge = safe(() => Game.AgeProgressManager.isFinalAge, false);

	const majors = safe(() => Players.getAlive().filter((p) => p.isMajor), []) || [];
	const myId = safe(() => GameContext.localPlayerID, -1);
	const myDip = safe(() => player.Diplomacy, null);

	for (const v of (safe(() => GameInfo.Victories, []) || [])) {
		const stat = VICTORY_STAT[v.VictoryClassType];
		if (!stat) continue;
		const hash = safe(() => Database.makeHash(v.VictoryType), null) ?? v.$hash;
		const myPoints = safe(() => player.Victories.getPointsForVictoryType(hash), 0) || 0;
		let rivalsMax = 0;
		for (const op of majors) {
			if (op.id === myId) continue;
			if (!safe(() => (myDip ? myDip.hasMet(op.id) : true), true)) continue;
			const pts = safe(() => op.Victories.getPointsForVictoryType(hash), 0) || 0;
			if (pts > rivalsMax) rivalsMax = pts;
		}
		const target = safe(() => Game.VictoryManager.getCountdownVictoryDominanceScore(hash), -1);
		const standing = (myPoints <= 0 && rivalsMax <= 0) ? "uncontested"
			: (myPoints >= rivalsMax && myPoints > 0) ? "leading"
			: (rivalsMax > 0 && myPoints >= rivalsMax * 0.75) ? "competitive" : "behind";
		out.victories.push({
			class: v.VictoryClassType, stat,
			name: safe(() => Locale.compose(v.Name), v.VictoryType),
			myPoints, rivalsMax, standing,
			target: target && target > 0 ? target : null,
		});
	}

	const pl = safe(() => player.Legacies, null);
	if (pl) {
		for (const t of (safe(() => GameInfo.Legacies, []) || [])) {
			if (!safe(() => pl.isValidLegacy(t.LegacyType), false)) continue;
			const triggered = safe(() => pl.isTriggered(t.LegacyType), false);
			const prog = safe(() => pl.getProgress(t.LegacyType), null);
			let cur = 0, total = 0;
			if (prog && prog.progress && prog.progress[0]) { cur = prog.progress[0].current || 0; total = prog.progress[0].total || 0; }
			if (!triggered && cur <= 0) continue;
			out.ageTriumphs.push({
				name: safe(() => Locale.compose(t.Name), t.LegacyType),
				attr: safe(() => String(t.LegacySubtype || "").replace("LEGACY_", ""), ""),
				major: !(t.MajorLegacy === false || t.MajorLegacy === 0),
				cur, total, triggered,
			});
		}
		out.ageTriumphs.sort((a, b) => (b.major - a.major) || (b.triggered - a.triggered));
		out.ageTriumphs = out.ageTriumphs.slice(0, 10);
	}
	return out;
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

// UI.log truncates each line near ~1023 bytes, so the victory/triumph data is
// emitted on its own line (tag VICTORY_TAG) to stay under the limit and keep the
// main state line valid JSON. Keys are compact for the same reason.
const VICTORY_TAG = "AI_ADVISOR_VICTORY:";

function gatherVictoryLog(player) {
	const full = gatherTriumphs(player);
	return {
		finalAge: full.isFinalAge,
		victories: full.victories.map((v) => ({
			c: v.class.replace("VICTORY_CLASS_", ""), stat: v.stat,
			p: v.myPoints, r: v.rivalsMax, st: v.standing, tgt: v.target,
		})),
		triumphs: full.ageTriumphs.slice(0, 6).map((t) => ({
			n: t.name, a: t.attr, maj: t.major, c: t.cur, t: t.total, done: t.triggered,
		})),
	};
}

// The leader's 3 chosen Dedications for the current Age + live tracking, emitted
// on its own line so the external council can guide toward the chosen goals.
const DEDICATION_TAG = "AI_ADVISOR_DEDICATIONS:";

function gatherDedicationLog() {
	const chosen = safe(() => getChosen(), []) || [];
	const tracking = safe(() => getTracking(), { items: [], ageFraction: 0 });
	return {
		chosen, // LegacyTypes
		needsPrompt: !safe(() => hasChosenThisAge(), false),
		ageFrac: Math.round((tracking.ageFraction || 0) * 100) / 100,
		items: (tracking.items || []).map((t) => ({
			n: t.name, attr: t.attr, c: t.cur, t: t.total,
			done: t.triggered, v: t.verdict?.tone, g: t.guidance,
		})),
	};
}

function emit() {
	try {
		const player = safe(() => Players.get(GameContext.localPlayerID), null);
		const state = gatherState();
		console.error(`${TAG} ${JSON.stringify(state)}`);
		console.error(`${VICTORY_TAG} ${JSON.stringify(gatherVictoryLog(player))}`);
		console.error(`${DEDICATION_TAG} ${JSON.stringify(gatherDedicationLog())}`);
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
