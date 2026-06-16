// Standalone check of the in-panel advisor rule logic (ui/ai-advisor-panel.js
// ADVICE) against the real captured game states (turns 1-3, da Vinci/Greece).
// Run: node tools/test_advice.mjs

const ADVICE = {
	expansion(s) {
		const n = s.cities.length;
		if (n === 0) return "Found your capital this turn — every turn unsettled is wasted yields. Settle near fresh water with good adjacency.";
		if (n === 1) return "One city so far. Build a Migrant and settle a second town to start the wide game (the Pax Imperatoria legacy rewards many settlements).";
		return `You have ${n} settlements — keep them growing and scout for the next good site to keep expanding.`;
	},
	military(s) {
		if (!s.hasMilitary) return "No combat unit yet — train a Warrior to garrison your capital against Independent Powers and barbarians.";
		return "No major threats detected. Keep a Scout exploring as early warning and hold your Warrior near the capital.";
	},
	science(s) {
		if (!s.research) return "⚠ No technology selected — choose one now; idle research wastes science every turn.";
		const sci = s.yields.science;
		const sciTxt = (sci != null) ? ` Science is ${sci > 0 ? "+" : ""}${sci}/turn.` : "";
		return `Researching ${s.research}.${sciTxt} Head toward Libraries and the Great Library codex path.`;
	},
	culture(s) {
		if (!s.civic) return "No civic selected — pick one so your culture isn't idle.";
		return `Pursuing ${s.civic}. Aim for a Tradition slot and keep the Wonders of the Ancient World legacy in view.`;
	},
	economy(s) {
		const h = s.yields.happiness;
		if (h != null && h < 0) return "Happiness is NEGATIVE — build an amenity or trigger a celebration before penalties stall growth.";
		if (h != null && h < 3) return `Happiness is tight (${h}). Plan an amenity building soon as the empire grows.`;
		const idle = s.cities.find((c) => !c.producing);
		if (idle) return `${idle.name} has no active production — set a build order; idle hammers are wasted.`;
		const g = s.yields.gold;
		return `Economy is steady${g != null ? ` (${g > 0 ? "+" : ""}${g} gold/turn)` : ""}. Bank gold toward rush-buying a key building.`;
	},
};

// adapt an emitted state (from UI.log) to the panel's gatherState() shape
function adapt(e) {
	const nonMil = ["Founder", "Migrant", "Settler", "Scout"];
	return {
		cities: e.cities || [],
		units: (e.units || []).map((u) => u.type),
		hasMilitary: (e.units || []).some((u) => !nonMil.some((m) => u.type.includes(m))),
		research: e.research ? e.research.name : null,
		civic: e.civic ? e.civic.name : null,
		yields: e.yields || {},
	};
}

// real captured states (turns 1-3) from the user's da Vinci game
const states = [
	{ turn: 1, cities: [], units: [{ type: "Founder" }], research: { name: "Agriculture" }, civic: { name: "Chiefdom" }, yields: { gold: 0, science: 0, culture: 0, happiness: 0, production: 0, food: 0 } },
	{ turn: 3, cities: [{ name: "Athênai", population: 2, producing: null }], units: [{ type: "Scout" }], research: null, civic: { name: "Chiefdom" }, yields: { gold: 5, science: 10, culture: 10, happiness: 5, production: 5, food: 5 } },
];

for (const e of states) {
	const s = adapt(e);
	console.log(`\n=== TURN ${e.turn} (panel would show) ===`);
	for (const [k, fn] of Object.entries(ADVICE)) {
		console.log(`  ${k.padEnd(10)} : ${fn(s)}`);
	}
}
