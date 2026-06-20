/**
 * AI Advisor — City Council.
 *
 * Gives every City its own advisor. A city advisor is created the moment a
 * settlement first becomes a City — founded as a City (your capital), a Town
 * upgraded to a City, or a City taken by conquest. A settlement captured *as a
 * Town* gets none (it only earns an advisor if it later upgrades), matching how
 * Towns are second-class build-wise.
 *
 * The city advisors coordinate with each other and with the five empire advisors
 * (Expansion, Military, Science, Culture, Economy) to recommend what each city
 * should build next:
 *   1. getEmpirePriorities() turns the leader's chosen Dedications + Victory
 *      standing into a weight per attribute — this is the voice of the empire
 *      advisors (each owns one attribute / Victory).
 *   2. assignFoci() spreads those priorities across the cities by each city's
 *      local strengths, so the cities collectively cover the goals instead of all
 *      chasing the same thing.
 *   3. recommendForCity() scores that city's *actually buildable* items (read with
 *      the same engine queries the base production chooser uses) against the
 *      empire priorities + the city's assigned focus, and returns a ranked list
 *      with advisor-voiced reasons. applyBuild() queues a pick (one-click apply).
 *
 * Everything is read defensively — missing data degrades to a sensible default
 * rather than throwing, matching the rest of the mod. This module is a shared
 * ES-module singleton used by the city overlay panel, the main panel's Cities
 * tab, and the UI.log state emitter.
 */
import ContextManager from '/core/ui/context-manager/context-manager.js';
import { getTracking } from './ai-advisor-dedications.js';

function safe(fn, dflt) { try { const v = fn(); return v == null ? dflt : v; } catch (e) { return dflt; } }

// --- persistence ------------------------------------------------------------
// Keep the canonical registry on globalThis (survives panel re-open) and mirror
// the durable fields to localStorage (survives the UI reloads an Age transition
// triggers). Keyed by map seed so a new game starts with a fresh council.

const LS_KEY = "lou-ai-advisor.cityCouncil";

const MEM = (globalThis.__aiAdvisorCityCouncil ||= { byKey: {} });
if (!MEM._hydrated) {
	MEM._hydrated = true;
	try {
		if (typeof localStorage !== "undefined" && localStorage) {
			const raw = localStorage.getItem(LS_KEY);
			if (raw) Object.assign(MEM.byKey, JSON.parse(raw));
		}
	} catch (e) { /* localStorage unavailable in this UI scope — globalThis still works */ }
}

function persist() {
	try {
		if (typeof localStorage === "undefined" || !localStorage) return;
		const out = {};
		for (const k in MEM.byKey) {
			const r = MEM.byKey[k];
			out[k] = { name: r.name, origin: r.origin, bornTurn: r.bornTurn };
		}
		localStorage.setItem(LS_KEY, JSON.stringify(out));
	} catch (e) { /* best effort */ }
}

function mapSeed() { return safe(() => String(Configuration.getMap().mapSeed), "g"); }

/** A stable string key for a city ComponentID, scoped to this game. */
function cidKey(cid) {
	if (cid == null) return null;
	const seed = mapSeed();
	if (typeof cid === "object") return `${seed}:${cid.owner}_${cid.id}`;
	return `${seed}:${cid}`;
}

// --- advisor identity (flavor) ----------------------------------------------
// Each city advisor gets a stable name so it reads like a person on the council.

const ADVISOR_NAMES = [
	"Aelius", "Borin", "Cyra", "Dahlia", "Ezra", "Faria", "Goran", "Hespa",
	"Ila", "Joran", "Kira", "Lucan", "Mira", "Nadir", "Oona", "Petra",
	"Quill", "Rhea", "Soren", "Talia", "Ulric", "Vesna", "Wren", "Yusuf",
];

function nameFor(cid) {
	let h = 0;
	const s = cidKey(cid) || "";
	for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
	return ADVISOR_NAMES[h % ADVISOR_NAMES.length];
}

// --- attribute model --------------------------------------------------------
// The six Triumph/advisor attributes, shared with the dedications module. Each
// buildable item carries an "affinity" — how much it advances each attribute.

const ATTR_LABEL = {
	culture: "Cultural", science: "Scientific", economy: "Economic",
	military: "Militaristic", expansion: "Expansionist", diplomacy: "Diplomatic",
};
const ATTR_ADVISOR = {
	culture: "Culture Advisor", science: "Science Advisor", economy: "Economic Advisor",
	military: "Military Advisor", expansion: "Expansion Advisor", diplomacy: "Diplomatic Advisor",
};
const ATTR_ICON = {
	culture: "🎭", science: "🔬", economy: "💰", military: "⚔️", expansion: "🧭", diplomacy: "🤝",
};
const ATTR_COLOR = {
	culture: "#bb6bd9", science: "#56ccf2", economy: "#f2c94c",
	military: "#eb5757", expansion: "#6fcf97", diplomacy: "#7aa8ff",
};

// Keyword → attribute affinity on the Type string. Deliberately coarse: this is a
// heuristic, the same spirit as the rule-based advice in the main panel.
const KEYWORD_AFFINITY = [
	[/LIBRARY|ACADEMY|UNIVERSITY|SCIENCE|OBSERVATORY|LABORATORY/, "science"],
	[/MONUMENT|AMPHITHEAT|THEATER|MUSEUM|MONASTERY|GARDEN|CULTUR/, "culture"],
	[/MARKET|BANK|BAZAAR|TREASUR|GOLD|PORT|WAREHOUSE|TRADER|MERCHANT|GRANARY_GOLD/, "economy"],
	[/WALL|FORT|BASTION|BARRACK|STABLE|BLACKSMITH|GARRISON|KEEP|CASTLE/, "military"],
	[/WARRIOR|SLINGER|ARCHER|SPEARMAN|SWORDSMAN|HORSEMAN|CAVALRY|KNIGHT|CATAPULT|TREBUCHET|CROSSBOW|COMMANDER|ARMY|MUSKET|ARTILLERY|TANK|INFANTRY/, "military"],
	[/SETTLER|MIGRANT|FOUNDER/, "expansion"],
	[/GRANARY|FARM|FISHING|PASTURE|AQUEDUCT|SEWER/, "expansion"],
	[/SCOUT/, "expansion"],
	[/EMBASSY|DIPLOM|PALACE_DIPLO/, "diplomacy"],
];

function affinityFor(type, category) {
	const t = String(type || "").toUpperCase();
	const aff = {};
	for (const [re, key] of KEYWORD_AFFINITY) {
		if (re.test(t)) aff[key] = Math.max(aff[key] || 0, 1);
	}
	// Wonders are the surest Tourism (Cultural) progress, and need heavy production.
	if (category === "wonders") { aff.culture = Math.max(aff.culture || 0, 1.2); }
	// A plain building with no keyword hit still helps the city generally; give it a
	// small, neutral economy lean so it doesn't score zero.
	if (Object.keys(aff).length === 0) {
		if (category === "buildings") aff.economy = 0.4;
		else if (category === "projects") aff.science = 0.4;
		else if (category === "units") aff.military = 0.5;
	}
	return aff;
}

// --- live game reads --------------------------------------------------------

function localPlayerId() { return safe(() => GameContext.localPlayerID, -1); }
function getCity(cid) { return safe(() => Cities.get(cid), null); }

/** Current City (non-town) settlements owned by the local player. */
function localCities() {
	const player = safe(() => Players.get(localPlayerId()), null);
	const cities = safe(() => player.Cities.getCities(), []) || [];
	return cities.filter((c) => c && safe(() => !c.isTown, true));
}

const YT = {
	production: "YIELD_PRODUCTION", science: "YIELD_SCIENCE", culture: "YIELD_CULTURE",
	gold: "YIELD_GOLD", food: "YIELD_FOOD",
};

function cityYield(city, key) {
	return safe(() => city.Yields.getNetYield(YieldTypes[YT[key]]), 0) || 0;
}

/** How well a city is set up to pursue each attribute, from its per-turn yields. */
function cityStrengths(city) {
	const prod = cityYield(city, "production");
	return {
		culture: cityYield(city, "culture") + prod * 0.4, // wonders need production
		science: cityYield(city, "science"),
		economy: cityYield(city, "gold"),
		military: prod,                                    // production trains armies
		expansion: cityYield(city, "food"),
		diplomacy: cityYield(city, "gold") * 0.3 + cityYield(city, "culture") * 0.3,
	};
}

// Test of Time victory class -> the attribute (and advisor) that drives it.
const VICTORY_ATTR = {
	VICTORY_CLASS_MILITARY: "military", VICTORY_CLASS_CULTURE: "culture",
	VICTORY_CLASS_ECONOMIC: "economy", VICTORY_CLASS_SCIENCE: "science",
};

/** Per-victory standing (leading/competitive/behind) for the local player. */
function victoryStanding() {
	const player = safe(() => Players.get(localPlayerId()), null);
	const out = [];
	if (!player) return out;
	const majors = safe(() => Players.getAlive().filter((p) => p.isMajor), []) || [];
	const myId = localPlayerId();
	const myDip = safe(() => player.Diplomacy, null);
	for (const v of (safe(() => GameInfo.Victories, []) || [])) {
		const key = VICTORY_ATTR[v.VictoryClassType];
		if (!key) continue;
		const hash = safe(() => Database.makeHash(v.VictoryType), null) ?? v.$hash;
		const mine = safe(() => player.Victories.getPointsForVictoryType(hash), 0) || 0;
		let rival = 0;
		for (const op of majors) {
			if (op.id === myId) continue;
			if (!safe(() => (myDip ? myDip.hasMet(op.id) : true), true)) continue;
			const pts = safe(() => op.Victories.getPointsForVictoryType(hash), 0) || 0;
			if (pts > rival) rival = pts;
		}
		const standing = (mine <= 0 && rival <= 0) ? "uncontested"
			: (mine >= rival && mine > 0) ? "leading"
			: (rival > 0 && mine >= rival * 0.75) ? "competitive" : "behind";
		out.push({ key, standing });
	}
	return out;
}

// --- empire priorities (the voice of the five advisors) ---------------------

/**
 * A weight per attribute combining the leader's chosen Dedications (explicit
 * goals, weighted up when behind pace) with live Victory standing (press where
 * you lead). This is how the city advisors "work with the other advisors".
 */
function getEmpirePriorities() {
	const w = { culture: 1, science: 1, economy: 1, military: 1, expansion: 1, diplomacy: 1 };
	for (const t of (safe(() => getTracking().items, []) || [])) {
		const k = t.advisorKey;
		if (!(k in w)) continue;
		const tone = t.verdict && t.verdict.tone;
		w[k] += tone === "behind" ? 1.6 : tone === "slightly" ? 1.1
			: tone === "complete" ? 0.2 : 0.7; // ontrack / early / unknown
	}
	for (const v of victoryStanding()) {
		if (!(v.key in w)) continue;
		if (v.standing === "leading") w[v.key] += 0.4;
		else if (v.standing === "competitive") w[v.key] += 0.25;
	}
	return w;
}

// --- coordination: assign each city a focus -----------------------------------

/**
 * Give each city advisor a primary focus, spreading the empire's top priorities
 * across the cities by each city's strengths so the council divides the labor
 * (the few highest-production cities take Wonders; high-food cities take growth /
 * Settlers for Expansion; etc.) rather than every city chasing the same goal.
 */
function assignFoci(advisors, priorities) {
	const order = Object.keys(priorities).sort((a, b) => priorities[b] - priorities[a]);
	const assigned = {};
	for (const a of advisors) {
		const city = getCity(a.cityId);
		const s = city ? cityStrengths(city) : {};
		let best = order[0], bestScore = -Infinity;
		for (const k of order) {
			// Diminish a focus the more cities already hold it, to spread coverage.
			const spread = 1 / (1 + (assigned[k] || 0) * 0.6);
			const score = (priorities[k] || 1) * ((s[k] || 0) + 0.1) * spread;
			if (score > bestScore) { bestScore = score; best = k; }
		}
		a.focus = best;
		assigned[best] = (assigned[best] || 0) + 1;
	}
}

// --- registry + lifecycle ---------------------------------------------------

/**
 * Reconcile the registry with the live City list: add an advisor for any new City,
 * drop advisors for Cities that are gone, and (re)assign foci. Because only
 * non-town settlements are enumerated, a settlement captured as a Town correctly
 * gets no advisor until it upgrades. `originHint` (from the lifecycle event that
 * triggered the sync) labels how any newly-discovered City came to be.
 */
function syncCouncil(originHint) {
	const turn = safe(() => Game.turn, 0);
	const cities = localCities();
	const seen = new Set();
	const hint = originHint;

	for (const city of cities) {
		const key = cidKey(city.id);
		if (!key) continue;
		seen.add(key);
		let rec = MEM.byKey[key];
		if (!rec) {
			const isCapital = safe(() => city.isCapital, false);
			const origin = hint || (isCapital ? "founded" : "upgraded");
			rec = MEM.byKey[key] = { name: nameFor(city.id), origin, bornTurn: turn };
		}
		// refresh transient (non-persisted) live refs each sync
		rec.cityId = city.id;
		rec.key = key;
		rec.cityName = safe(() => Locale.compose(city.name), "City");
	}
	// prune advisors whose City no longer exists for us
	for (const key in MEM.byKey) {
		if (key.startsWith(mapSeed() + ":") && !seen.has(key)) delete MEM.byKey[key];
	}

	const advisors = activeAdvisors();
	assignFoci(advisors, getEmpirePriorities());
	persist();
	return advisors;
}

/** All city advisors for the current game (in-memory records with live cityId). */
function activeAdvisors() {
	const prefix = mapSeed() + ":";
	return Object.keys(MEM.byKey)
		.filter((k) => k.startsWith(prefix) && MEM.byKey[k].cityId)
		.map((k) => MEM.byKey[k]);
}

/** The advisor record for a city ComponentID (syncing first if unseen). */
function getAdvisor(cid) {
	const key = cidKey(cid);
	if (!key) return null;
	if (!MEM.byKey[key] || !MEM.byKey[key].cityId) syncCouncil();
	return MEM.byKey[key] || null;
}

// --- buildable enumeration --------------------------------------------------
// Uses the same engine queries the base production chooser uses (no invented
// APIs): canStartQuery for constructibles/units, GameInfo.Projects for projects.

function cityRecommendations(city) {
	// The base game's own production recommendations, used as a scoring signal.
	const recs = safe(() => Players.Advisory.get(city.owner)
		.getBuildRecommendations({ cityId: city.id, subject: AdvisorySubjectTypes.PRODUCTION, maxReturnedEntries: 0 }), []) || [];
	const types = new Set();
	for (const r of recs) {
		const t = r && (r.type || r.BuildType || r.constructibleType || r.unitType);
		if (t) types.add(String(t));
	}
	return types;
}

function makeItem(city, type, nameKey, category, recommendedTypes) {
	return {
		type,
		name: safe(() => Locale.compose(nameKey), type),
		category,
		kind: category === "units" ? "unit" : category === "projects" ? "project" : "building",
		turns: safe(() => city.BuildQueue.getTurnsLeft(type), null),
		affinity: affinityFor(type, category),
		recommended: recommendedTypes.has(String(type)),
	};
}

function enumerateBuildables(city) {
	const items = [];
	const recommended = cityRecommendations(city);

	const cons = safe(() => Game.CityOperations.canStartQuery(city.id, CityOperationTypes.BUILD, CityQueryType.Constructible), []) || [];
	for (const { index, result } of cons) {
		if (!result || !result.Success) continue;
		const def = safe(() => GameInfo.Constructibles.lookup(index), null);
		if (!def) continue;
		const isWonder = String(def.ConstructibleClass || "") === "WONDER";
		items.push(makeItem(city, def.ConstructibleType, def.Name, isWonder ? "wonders" : "buildings", recommended));
	}

	const units = safe(() => Game.CityOperations.canStartQuery(city.id, CityOperationTypes.BUILD, CityQueryType.Unit), []) || [];
	for (const { index, result } of units) {
		if (!result || !result.Success) continue;
		const def = safe(() => GameInfo.Units.lookup(index), null);
		if (!def) continue;
		items.push(makeItem(city, def.UnitType, def.Name, "units", recommended));
	}

	for (const project of (safe(() => GameInfo.Projects, []) || [])) {
		if (safe(() => project.CityOnly && city.isTown, false)) continue;
		const r = safe(() => Game.CityOperations.canStart(city.id, CityOperationTypes.BUILD, { ProjectType: project.$index }, false), null);
		if (!r || !r.Success) continue;
		items.push(makeItem(city, project.ProjectType, project.Name, "projects", recommended));
	}
	return items;
}

// --- scoring + recommendation -----------------------------------------------

function scoreItem(item, priorities, focusKey) {
	let score = 0;
	let topAttr = null, topVal = 0;
	for (const k in item.affinity) {
		const contrib = item.affinity[k] * (priorities[k] || 1);
		score += contrib;
		if (contrib > topVal) { topVal = contrib; topAttr = k; }
	}
	if (focusKey && item.affinity[focusKey]) score += item.affinity[focusKey] * 1.5;
	if (item.recommended) score += 2;                         // base-game advisor agrees
	if (item.turns != null) score += Math.max(0, 12 - item.turns) * 0.03; // gentle "sooner" nudge
	return { score, topAttr: topAttr || focusKey };
}

function reasonFor(item, topAttr, focusKey, advisorName) {
	const attr = topAttr || focusKey || "economy";
	const owner = ATTR_ADVISOR[attr] || "Council";
	const label = ATTR_LABEL[attr] || "";
	const focusMatch = focusKey && item.affinity[focusKey];
	const lead = focusMatch
		? `fits this city's ${ATTR_LABEL[focusKey]} focus`
		: `advances the empire's ${label} goal`;
	const rec = item.recommended ? " The city's own advisors flag it too." : "";
	const t = item.turns != null && item.turns > 0 ? ` (~${item.turns} turns)` : "";
	return `${advisorName} (${owner}): build ${item.name}${t} — it ${lead}.${rec}`;
}

/**
 * Ranked build recommendation for one City: its advisor, assigned focus, the top
 * pick + runner-ups (each with an advisor-voiced reason), and the live current
 * production. Returns null if the settlement has no city advisor (e.g. a Town).
 */
function recommendForCity(cid) {
	const city = getCity(cid);
	if (!city || safe(() => city.isTown, false)) return null;
	const rec = getAdvisor(cid);
	if (!rec) return null;
	const priorities = getEmpirePriorities();
	if (!rec.focus) assignFoci([rec], priorities);

	const items = enumerateBuildables(city);
	const scored = items.map((it) => {
		const { score, topAttr } = scoreItem(it, priorities, rec.focus);
		return {
			item: it, score, topAttr,
			reason: reasonFor(it, topAttr, rec.focus, rec.name),
		};
	}).sort((a, b) => b.score - a.score);

	return {
		key: rec.key, cityId: cid,
		cityName: safe(() => Locale.compose(city.name), rec.cityName || "City"),
		advisorName: rec.name,
		origin: rec.origin,
		isTown: false,
		focus: { key: rec.focus, label: ATTR_LABEL[rec.focus] || "", icon: ATTR_ICON[rec.focus] || "🏛️", color: ATTR_COLOR[rec.focus] || "#c9c2b4" },
		producing: currentProduction(city),
		top: scored[0] || null,
		runnerUps: scored.slice(1, 4),
		count: scored.length,
	};
}

function currentProduction(city) {
	return safe(() => {
		const h = city.BuildQueue && city.BuildQueue.currentProductionTypeHash;
		if (h == null) return null;
		const def = GameInfo.Units.lookup(h) || GameInfo.Constructibles.lookup(h) || GameInfo.Projects.lookup(h);
		return def ? Locale.compose(def.Name) : null;
	}, null);
}

// --- one-click apply (mirrors base-game Construct) --------------------------

/** Queue a recommended item into a City's production. Returns true on success. */
function applyBuild(cid, item) {
	const city = getCity(cid);
	if (!city || !item) return false;
	const typeInfo = safe(() => GameInfo.Types.lookup(item.type), null);
	if (!typeInfo) return false;
	let args;
	if (typeInfo.Kind === "KIND_CONSTRUCTIBLE") args = { ConstructibleType: typeInfo.Hash };
	else if (typeInfo.Kind === "KIND_UNIT") args = { UnitType: typeInfo.Hash };
	else if (typeInfo.Kind === "KIND_PROJECT") args = { ProjectType: typeInfo.Hash };
	else return false;

	const result = safe(() => Game.CityOperations.canStart(city.id, CityOperationTypes.BUILD, args, false), null);
	if (!result || !result.Success) return false;
	// If the engine already resolved a target plot, pass it through (matches base Construct).
	if (result.InProgress && result.Plots && result.Plots.length) {
		const loc = safe(() => GameplayMap.getLocationFromIndex(result.Plots[0]), null);
		if (loc) { args.X = loc.x; args.Y = loc.y; }
	}
	if (typeInfo.Kind === "KIND_PROJECT" && safe(() => city.isTown, false)) {
		args.InsertMode = safe(() => CityOperationsParametersValues.Exclusive, undefined);
	}
	try {
		Game.CityOperations.sendRequest(city.id, CityOperationTypes.BUILD, args);
		return true;
	} catch (e) { return false; }
}

// --- snapshot for the UI.log bridge -----------------------------------------

/** Compact per-city council snapshot for the external advisor pipeline. */
function getCouncilSnapshot() {
	const advisors = syncCouncil();
	const priorities = getEmpirePriorities();
	const top = Object.keys(priorities).sort((a, b) => priorities[b] - priorities[a]).slice(0, 3);
	return {
		priorities: top,
		cities: advisors.map((rec) => {
			const r = safe(() => recommendForCity(rec.cityId), null);
			if (!r) return null;
			return {
				n: r.cityName, adv: r.advisorName, o: r.origin,
				f: r.focus.key, prod: r.producing,
				rec: r.top ? r.top.item.name : null,
			};
		}).filter(Boolean).slice(0, 12),
	};
}

// --- auto-open controller (overlay on the city screen) ----------------------
// When a City is selected (the base production chooser opens), show the per-city
// advisor overlay; the overlay closes itself when selection clears.

let _panelOpen = false;
function setCityPanelOpen(b) { _panelOpen = !!b; }

function isCitySelected() {
	const cid = safe(() => UI.Player.getHeadSelectedCity(), null);
	if (!cid) return null;
	const valid = safe(() => ComponentID.isValid(cid), cid && cid.id >= 0);
	if (!valid) return null;
	// Only Cities get the overlay (Towns use the native town focus UI).
	const city = getCity(cid);
	if (!city || safe(() => city.isTown, false)) return null;
	return cid;
}

function onCitySelectionChanged() {
	const cid = isCitySelected();
	if (cid && !_panelOpen) {
		_panelOpen = true;
		safe(() => ContextManager.push("ai-advisor-city-panel", { singleton: true, createMouseGuard: false }), null);
	}
}

// --- engine event wiring ----------------------------------------------------

function bind(evt, fn) { try { engine.on(evt, fn); } catch (e) { /* event may not exist on this build */ } }

bind("CityAddedToMap", () => syncCouncil("founded"));
bind("CityGovernmentLevelChanged", () => syncCouncil("upgraded"));
bind("CityTransfered", () => syncCouncil("conquered"));
bind("ConqueredSettlementIntegrated", () => syncCouncil("conquered"));
bind("CityRemovedFromMap", () => syncCouncil());
bind("PlayerTurnActivated", (data) => {
	if (data && data.player === localPlayerId()) syncCouncil();
});
bind("CitySelectionChanged", onCitySelectionChanged);

// Initial reconciliation shortly after load (cities exist by then).
setTimeout(() => safe(() => syncCouncil(), null), 4000);

export {
	safe,
	syncCouncil, activeAdvisors, getAdvisor,
	getEmpirePriorities, assignFoci,
	recommendForCity, applyBuild,
	getCouncilSnapshot,
	setCityPanelOpen, isCitySelected,
	ATTR_LABEL, ATTR_ADVISOR, ATTR_ICON, ATTR_COLOR,
};
