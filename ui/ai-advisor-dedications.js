/**
 * AI Advisor — Dedications.
 *
 * At the dawn of each Age the advisors ask the leader to pick THREE Triumphs
 * (Major Legacies) to dedicate the Age to. Completing a Triumph banks Legacy
 * Points and unlocks its Dedication reward card for the next Age, so choosing a
 * focus up front lets the council track progress and give concrete "build this /
 * do that" guidance toward each chosen goal.
 *
 * This module is the single source of truth, shared (as an ES-module singleton)
 * by the panel (selection + tracking UI) and the state emitter (UI.log bridge):
 *   - reads the Age's available Major Triumphs and live progress from
 *     `player.Legacies` (the same APIs the base Legacies screen uses), and
 *   - persists the leader's chosen 3 per-Age so the choice survives panel
 *     re-opens and (via localStorage when present) UI reloads.
 *
 * Everything is read defensively — missing data degrades to a sensible default
 * rather than throwing, matching the rest of the mod.
 */

function safe(fn, dflt) { try { const v = fn(); return v == null ? dflt : v; } catch (e) { return dflt; } }

// --- persistence ------------------------------------------------------------
// The selection must outlive a panel close (new instance) and ideally a UI
// reload. We keep the canonical copy on globalThis (survives panel re-open
// within an Age) and mirror it to localStorage when that exists (survives the
// reload an Age transition triggers). Keyed by Age so each Age starts fresh.

const LS_KEY = "lou-ai-advisor.dedications";

const MEM = (globalThis.__aiAdvisorDedications ||= { byAge: {} });
if (!MEM._hydrated) {
	MEM._hydrated = true;
	try {
		if (typeof localStorage !== "undefined" && localStorage) {
			const raw = localStorage.getItem(LS_KEY);
			if (raw) Object.assign(MEM.byAge, JSON.parse(raw));
		}
	} catch (e) { /* localStorage unavailable in this UI scope — globalThis still works */ }
}

function persist() {
	try {
		if (typeof localStorage !== "undefined" && localStorage) {
			localStorage.setItem(LS_KEY, JSON.stringify(MEM.byAge));
		}
	} catch (e) { /* best effort */ }
}

// A stable per-Age key, scoped to this specific game so a new game that revisits
// the same Age doesn't inherit a previous game's pick (which would skip the
// "ask at the start of the Age" prompt). The map seed is unique per game; the
// AgeType is stable across the reload an Age transition triggers.
function ageKey() {
	const game = safe(() => String(Configuration.getMap().mapSeed), "g");
	const age = safe(() => GameInfo.Ages.lookup(Game.age).AgeType, null)
		|| safe(() => String(Game.age), "AGE_UNKNOWN");
	return `${game}:${age}`;
}

/** The LegacyTypes the leader has dedicated this Age to (max 3), or []. */
function getChosen() {
	const k = ageKey();
	const arr = MEM.byAge[k];
	return Array.isArray(arr) ? arr.slice(0, 3) : [];
}

/** Replace this Age's dedication selection (an array of up to 3 LegacyTypes). */
function setChosen(legacyTypes) {
	const k = ageKey();
	MEM.byAge[k] = (legacyTypes || []).slice(0, 3);
	persist();
	return MEM.byAge[k];
}

function clearChosen() {
	const k = ageKey();
	delete MEM.byAge[k];
	persist();
}

/** True once the leader has locked in a selection for the current Age. */
function hasChosenThisAge() { return getChosen().length > 0; }

// --- attribute → advisor persona & concrete guidance ------------------------
// Maps each Triumph attribute (LegacySubtype) to the advisor who owns it and a
// short, ordered list of in-game actions that advance that attribute. The
// guidance is intentionally action-oriented ("build / do") so the leader knows
// what to do next, not just what the goal is.

const ATTR = {
	LEGACY_CULTURAL: {
		key: "culture", advisor: "Culture Advisor", icon: "🎭", color: "#bb6bd9", label: "Cultural",
		actions: [
			"Raise Wonders — each finished Wonder is the surest cultural progress.",
			"Build culture buildings (Monuments, Amphitheaters) and work Tiles with Culture adjacency.",
			"Create Great Works and slot them; put Relics and Artifacts on display.",
		],
	},
	LEGACY_SCIENTIFIC: {
		key: "science", advisor: "Science Advisor", icon: "🔬", color: "#56ccf2", label: "Scientific",
		actions: [
			"Keep a tech always researching — idle science is wasted progress.",
			"Build science buildings (Libraries, Academies) and push Science per turn.",
			"Complete Tech Masteries and display Codices to bank toward the goal.",
		],
	},
	LEGACY_ECONOMIC: {
		key: "economy", advisor: "Economic Advisor", icon: "💰", color: "#f2c94c", label: "Economic",
		actions: [
			"Stack Gold buildings (+Gold/turn) and grow your Treasury.",
			"Run Trade Routes and assign City & imported Resources.",
			"Found and grow Towns specialized toward Gold.",
		],
	},
	LEGACY_MILITARISTIC: {
		key: "military", advisor: "Military Advisor", icon: "⚔️", color: "#eb5757", label: "Militaristic",
		actions: [
			"Train an army — Commanders plus a core of current-era units.",
			"Defeat enemy units and Independent Powers; war pays this Triumph.",
			"Capture rival Settlements to convert force into progress.",
		],
	},
	LEGACY_EXPANSIONIST: {
		key: "expansion", advisor: "Expansion Advisor", icon: "🧭", color: "#6fcf97", label: "Expansionist",
		actions: [
			"Build Settlers and found new Towns near fresh water and good adjacency.",
			"Grow and specialize Towns; convert strong ones into Cities.",
			"Expand territory and build improvements to claim tiles.",
		],
	},
	LEGACY_DIPLOMATIC: {
		key: "diplomacy", advisor: "Diplomatic Advisor", icon: "🤝", color: "#7aa8ff", label: "Diplomatic",
		actions: [
			"Befriend City-States and Independent Powers; spend Influence to support them.",
			"Open Diplomacy actions (Endeavors, Treaties) and keep relations warm.",
			"Earn and bank Influence so you can win Diplomatic endeavours.",
		],
	},
};

const ATTR_DEFAULT = { key: "council", advisor: "Council", icon: "🏛️", color: "#c9c2b4", label: "" };

function attrMeta(subtype) { return ATTR[subtype] || ATTR_DEFAULT; }

// --- reading available Triumphs & live progress -----------------------------

function localPlayer() { return safe(() => Players.get(GameContext.localPlayerID), null); }

/**
 * Read one Triumph's live state for the local player: validity, completion,
 * and current/total progress (mirrors base legacies-model `createTriumphData`).
 */
function readTriumph(pl, def) {
	const triggered = safe(() => pl.isTriggered(def.LegacyType), false);
	const prog = safe(() => pl.getProgress(def.LegacyType), null);
	let cur = 0, total = 0, raceWinner = -1;
	if (prog && prog.progress && prog.progress[0]) {
		cur = prog.progress[0].current || 0;
		total = prog.progress[0].total || 0;
	}
	if (prog && prog.raceWinner != null) raceWinner = prog.raceWinner;
	const meta = attrMeta(def.LegacySubtype);
	return {
		type: def.LegacyType,
		subtype: def.LegacySubtype,
		name: safe(() => Locale.compose(def.Name), def.LegacyType),
		// stylize resolves Civ7 text markup ([B], [icon:…], [TIP:…]) to rich HTML.
		requirement: safe(() => (def.TriggerDescription ? Locale.stylize(def.TriggerDescription) : ""), ""),
		reward: safe(() => (def.Description ? Locale.stylize(def.Description) : ""), ""),
		attr: meta.label, advisor: meta.advisor, advisorKey: meta.key, icon: meta.icon, color: meta.color,
		firstOnly: !!def.FirstPlayerOnly,
		major: def.MajorLegacy !== false && def.MajorLegacy !== 0,
		triggered, cur, total, raceWinner,
		// a rival already won a "first player only" race we can no longer take
		raceLost: !!def.FirstPlayerOnly && raceWinner !== -1 && raceWinner !== safe(() => GameContext.localPlayerID, -2),
	};
}

/**
 * The Major, non-crisis Triumphs available to dedicate to this Age, each with
 * live progress. These are the cards the advisors offer the leader to pick from.
 */
function getAvailableTriumphs() {
	const player = localPlayer();
	const pl = safe(() => player.Legacies, null);
	const out = [];
	if (!pl) return out;
	for (const def of (safe(() => GameInfo.Legacies, []) || [])) {
		if (def.LegacySubtype === "LEGACY_CRISIS") continue;
		if (def.MajorLegacy === false || def.MajorLegacy === 0) continue; // major Triumphs only
		if (!safe(() => pl.isValidLegacy(def.LegacyType), false)) continue;
		out.push(readTriumph(pl, def));
	}
	// Group by attribute for a tidy picker, completed/race-lost sink to the end.
	out.sort((a, b) =>
		(a.attr < b.attr ? -1 : a.attr > b.attr ? 1 : 0)
		|| (a.triggered - b.triggered)
		|| (a.type < b.type ? -1 : 1));
	return out;
}

/** Look up a single Triumph by LegacyType with live progress (or null). */
function getTriumphByType(legacyType) {
	const pl = safe(() => localPlayer().Legacies, null);
	if (!pl) return null;
	const def = safe(() => GameInfo.Legacies.lookup(legacyType), null);
	if (!def) return null;
	return readTriumph(pl, def);
}

// --- on-track verdict + tracking guidance -----------------------------------

/** Age clock fraction (0..1): how far through the Age we are. */
function ageFraction() {
	const cur = safe(() => Game.AgeProgressManager.getCurrentAgeProgressionPoints(), 0) || 0;
	const max = safe(() => Game.AgeProgressManager.getMaxAgeProgressionPoints(), 0) || 0;
	if (max <= 0) return 0;
	return Math.max(0, Math.min(1, cur / max));
}

/**
 * Compare a Triumph's completion fraction to the Age clock to judge whether the
 * leader is pacing well enough to finish before the Age ends.
 *   leading the clock      → On track
 *   within ~2/3 of pace    → Slightly behind
 *   else                   → Behind
 */
function trackingVerdict(t, ageFrac) {
	if (t.triggered) return { label: "Complete", color: "#6fcf97", tone: "complete" };
	if (t.raceLost) return { label: "Lost the race", color: "#9aa3ad", tone: "lost" };
	if (!t.total) return { label: "Tracking", color: "#9aa3ad", tone: "unknown" };
	const done = t.cur / t.total;
	// Early in the Age (clock near 0) any start counts as on track.
	const pace = Math.max(ageFrac, 0.05);
	if (done >= pace) return { label: "On track", color: "#6fcf97", tone: "ontrack" };
	// Too early to sound the alarm: there's still plenty of Age left to catch up.
	if (ageFrac < 0.15) return { label: "Underway", color: "#9aa3ad", tone: "early" };
	if (done >= pace * 0.66) return { label: "Slightly behind", color: "#f2c94c", tone: "slightly" };
	return { label: "Behind", color: "#eb5757", tone: "behind" };
}

/**
 * A one-line, action-oriented guidance sentence for a tracked Triumph: where it
 * stands, whether it's on pace, and the single most useful next action.
 */
function guidanceLine(t, verdict) {
	const meta = attrMeta(t.subtype);
	const nextAction = meta.actions[0];
	if (t.triggered) return `✓ Done — the ${t.attr} Dedication is banked. Defend the lead and start the next goal.`;
	if (t.raceLost) return `A rival completed this race first — switch this slot to another Triumph you can still win.`;
	const remain = t.total ? Math.max(0, t.total - t.cur) : null;
	const progressTxt = t.total ? `${t.cur}/${t.total} (${remain} to go)` : "in progress";
	switch (verdict.tone) {
		case "ontrack":
			return `On track at ${progressTxt}. Keep it up: ${nextAction}`;
		case "early":
			return `Early days — plenty of Age left at ${progressTxt}. Get started: ${nextAction}`;
		case "slightly":
			return `Slightly behind the Age clock at ${progressTxt}. Prioritize it: ${nextAction}`;
		case "behind":
			return `Behind pace at ${progressTxt} — the Age may end first. Push hard now: ${nextAction}`;
		default:
			return `Tracking this goal. ${nextAction}`;
	}
}

/**
 * Full tracking snapshot for the chosen dedications: each with live progress, an
 * on-track verdict, a guidance line, and the attribute's action list. Used by
 * the panel's tracking view and the UI.log bridge.
 */
function getTracking() {
	const chosen = getChosen();
	const ageFrac = ageFraction();
	const items = [];
	for (const type of chosen) {
		const t = getTriumphByType(type);
		if (!t) continue;
		const verdict = trackingVerdict(t, ageFrac);
		items.push({
			...t,
			verdict,
			guidance: guidanceLine(t, verdict),
			actions: attrMeta(t.subtype).actions,
		});
	}
	return { ageFraction: ageFrac, items };
}

export {
	safe, attrMeta,
	getChosen, setChosen, clearChosen, hasChosenThisAge, ageKey,
	getAvailableTriumphs, getTriumphByType,
	getTracking, trackingVerdict, guidanceLine, ageFraction,
};
