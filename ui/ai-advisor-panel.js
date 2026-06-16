import Panel from '/core/ui/panel-support.js';
import { MustGetElement } from '/core/ui/utilities/utilities-dom.js';
import content from './ai-advisor-panel.html.js';

/**
 * AI Advisor panel.
 *
 * Opened from the dock button. Shows the advisor council's recommendations for
 * the current turn — computed live from the empire state — plus an empire/yields
 * summary. When opened it first shows a short "deliberating" animation, then
 * reveals each advisor's advice (mirrors the external KB/Claude council's logic).
 */

const ADVISORS = [
	{ key: "expansion", name: "Expansion Advisor", icon: "🧭", color: "#6fcf97" },
	{ key: "military", name: "Military Advisor", icon: "⚔️", color: "#eb5757" },
	{ key: "science", name: "Science Advisor", icon: "🔬", color: "#56ccf2" },
	{ key: "culture", name: "Culture Advisor", icon: "🎭", color: "#bb6bd9" },
	{ key: "economy", name: "Economic Advisor", icon: "💰", color: "#f2c94c" },
];

const STYLE_ID = "ai-advisor-style";
const STYLE = `
.ai-advisor__spinner{width:2.4rem;height:2.4rem;border:0.3rem solid rgba(255,255,255,0.18);border-top-color:#e0c060;border-radius:50%;animation:aiadv-spin 0.9s linear infinite;}
@keyframes aiadv-spin{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}
.ai-advisor__card{display:flex;flex-direction:row;align-items:flex-start;padding:0.5rem 0.7rem;margin:0.28rem 0;background:rgba(0,0,0,0.28);border-left:0.28rem solid #888;border-radius:0.25rem;opacity:0;transition:opacity 0.35s ease;}
.ai-advisor__card.shown{opacity:1;}
.ai-advisor__card-icon{font-size:1.4rem;margin-right:0.6rem;line-height:1.6rem;}
.ai-advisor__card-body{display:flex;flex-direction:column;flex:1;}
.ai-advisor__card-name{font-weight:700;margin-bottom:0.1rem;}
.ai-advisor__card-text{color:#d9d2c4;}
`;

function safe(fn, dflt) { try { return fn(); } catch (e) { return dflt; } }

class AiAdvisorPanel extends Panel {
	closeButton = null;
	thinkingEl = null;
	thinkingText = null;
	councilEl = null;
	empireContainer = null;
	yieldsContainer = null;
	_dotTimer = null;
	_revealTimer = null;

	onInitialize() {
		super.onInitialize();
		this.injectStyle();
		this.closeButton = MustGetElement("fxs-close-button", this.Root);
		this.thinkingEl = MustGetElement(".ai-advisor__thinking", this.Root);
		this.thinkingText = MustGetElement(".ai-advisor__thinking-text", this.Root);
		this.councilEl = MustGetElement(".ai-advisor__council", this.Root);
		this.empireContainer = MustGetElement(".ai-advisor__empire", this.Root);
		this.yieldsContainer = MustGetElement(".ai-advisor__yields", this.Root);
		this.enableOpenSound = true;
		this.enableCloseSound = true;
	}

	injectStyle() {
		if (!document.getElementById(STYLE_ID)) {
			const s = document.createElement("style");
			s.id = STYLE_ID;
			s.textContent = STYLE;
			(document.head || document.body || this.Root).appendChild(s);
		}
	}

	onAttach() {
		super.onAttach();
		this.closeButton.addEventListener("action-activate", () => this.close());
		this.buildEmpireInfo();
		this.buildYieldInfo();
		this.startDeliberation();
	}

	onDetach() {
		if (this._dotTimer) clearInterval(this._dotTimer);
		if (this._revealTimer) clearTimeout(this._revealTimer);
		super.onDetach();
	}

	// --- "thinking" animation, then reveal advice ---------------------------

	startDeliberation() {
		this.councilEl.innerHTML = "";
		this.thinkingEl.style.display = "flex";
		const base = Locale.compose("LOC_AI_ADVISOR_THINKING");
		let n = 0;
		this.thinkingText.textContent = base;
		this._dotTimer = setInterval(() => {
			n = (n + 1) % 4;
			this.thinkingText.textContent = base + ".".repeat(n);
		}, 350);
		// deliberate briefly, then reveal
		this._revealTimer = setTimeout(() => {
			if (this._dotTimer) { clearInterval(this._dotTimer); this._dotTimer = null; }
			this.thinkingEl.style.display = "none";
			this.renderAdvice();
		}, 1900);
	}

	renderAdvice() {
		const state = this.gatherState();
		ADVISORS.forEach((adv, i) => {
			const text = ADVICE[adv.key](state);
			const card = document.createElement("div");
			card.classList.add("ai-advisor__card");
			card.style.borderLeftColor = adv.color;

			const icon = document.createElement("div");
			icon.classList.add("ai-advisor__card-icon");
			icon.textContent = adv.icon;

			const body = document.createElement("div");
			body.classList.add("ai-advisor__card-body");
			const name = document.createElement("div");
			name.classList.add("ai-advisor__card-name", "font-body-base");
			name.style.color = adv.color;
			name.textContent = adv.name;
			const advice = document.createElement("div");
			advice.classList.add("ai-advisor__card-text", "font-body-sm");
			advice.textContent = text;
			body.appendChild(name);
			body.appendChild(advice);

			card.appendChild(icon);
			card.appendChild(body);
			this.councilEl.appendChild(card);
			// staggered fade-in
			setTimeout(() => card.classList.add("shown"), 80 + i * 120);
		});
	}

	// --- state gathering (mirrors ui/ai-advisor-state.js) -------------------

	gatherState() {
		const player = safe(() => Players.get(GameContext.localPlayerID), null);
		const s = {
			cities: [], units: [], research: null, civic: null,
			yields: {}, hasMilitary: false,
		};
		if (!player) return s;

		const stats = safe(() => player.Stats, null);
		const yt = { gold: "YIELD_GOLD", science: "YIELD_SCIENCE", culture: "YIELD_CULTURE",
			happiness: "YIELD_HAPPINESS", production: "YIELD_PRODUCTION", food: "YIELD_FOOD" };
		if (stats) {
			for (const k in yt) {
				s.yields[k] = safe(() => Math.round(stats.getNetYield(YieldTypes[yt[k]]) * 10) / 10, null);
			}
		}

		const cities = safe(() => player.Cities.getCities(), []) || [];
		for (const c of cities) {
			s.cities.push({
				name: safe(() => Locale.compose(c.name), "City"),
				producing: safe(() => {
					const h = c.BuildQueue?.currentProductionTypeHash;
					if (h == null) return null;
					const def = GameInfo.Units.lookup(h) || GameInfo.Constructibles.lookup(h) || GameInfo.Projects.lookup(h);
					return def ? Locale.compose(def.Name) : null;
				}, null),
			});
		}

		const units = safe(() => player.Units.getUnits(), []) || [];
		const nonMil = ["FOUNDER", "MIGRANT", "SETTLER", "SCOUT"];
		for (const u of units) {
			const t = safe(() => GameInfo.Units.lookup(u.type), null);
			const name = t ? Locale.compose(t.Name) : "Unit";
			s.units.push(name);
			const ut = safe(() => String(t?.UnitType || "").toUpperCase(), "");
			if (ut && !nonMil.some((m) => ut.includes(m))) s.hasMilitary = true;
		}

		s.research = this.activeName(player, "Techs");
		s.civic = this.activeName(player, "Culture");
		return s;
	}

	activeName(player, kind) {
		return safe(() => {
			const sys = player[kind];
			if (!sys) return null;
			const treeType = kind === "Techs" ? sys.getTreeType() : sys.getActiveTree();
			const tree = Game.ProgressionTrees.getTree(player.id, treeType);
			if (!tree || tree.activeNodeIndex < 0) return null;
			const node = tree.nodes[tree.activeNodeIndex];
			const info = GameInfo.ProgressionTreeNodes.lookup(node.nodeType);
			return info ? Locale.compose(info.Name ?? info.ProgressionTreeNodeType) : null;
		}, null);
	}

	// --- empire / yields summary (unchanged) --------------------------------

	addRow(container, label, value) {
		const row = document.createElement("div");
		row.classList.add("flex", "justify-between", "items-center", "py-1");
		const l = document.createElement("div");
		l.classList.add("font-body-base", "text-accent-2");
		l.textContent = label;
		const v = document.createElement("div");
		v.classList.add("font-body-base", "text-accent-1");
		v.textContent = value;
		row.appendChild(l); row.appendChild(v);
		container.appendChild(row);
	}

	getLocalPlayer() { return safe(() => Players.get(GameContext.localPlayerID), null); }

	buildEmpireInfo() {
		const player = this.getLocalPlayer();
		this.addRow(this.empireContainer, "Turn", safe(() => Game.turn.toString(), "?"));
		const ageName = safe(() => GameInfo.Ages.lookup(Game.age)?.Name, null);
		if (ageName) this.addRow(this.empireContainer, "Age", Locale.compose(ageName));
		if (!player) { this.addRow(this.empireContainer, "Player", "Unavailable"); return; }
		const leader = safe(() => player.leaderName && Locale.compose(player.leaderName), null);
		if (leader) this.addRow(this.empireContainer, "Leader", leader);
		const civ = safe(() => player.civilizationFullName && Locale.compose(player.civilizationFullName), null);
		if (civ) this.addRow(this.empireContainer, "Civilization", civ);
		this.addRow(this.empireContainer, "Settlements", safe(() => (player.Cities?.getCities() ?? []).length.toString(), "0"));
	}

	buildYieldInfo() {
		const stats = this.getLocalPlayer()?.Stats;
		if (!stats) { this.addRow(this.yieldsContainer, "Yields", "Unavailable"); return; }
		const yields = [["Gold", "YIELD_GOLD"], ["Science", "YIELD_SCIENCE"], ["Culture", "YIELD_CULTURE"],
			["Happiness", "YIELD_HAPPINESS"], ["Production", "YIELD_PRODUCTION"], ["Food", "YIELD_FOOD"]];
		for (const [label, yt] of yields) {
			const net = safe(() => stats.getNetYield(YieldTypes[yt]), null);
			if (net == null) continue;
			const r = Math.round(net * 10) / 10;
			this.addRow(this.yieldsContainer, label, `${r > 0 ? "+" : ""}${r}`);
		}
	}
}

// --- rule-based advisor logic (mirrors advisors/personas.py) -----------------

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

Controls.define("ai-advisor-panel", {
	createInstance: AiAdvisorPanel,
	description: "AI Advisor panel with live game information and advisor advice.",
	classNames: ["ai-advisor-panel", "absolute", "inset-0", "flex", "items-center", "justify-center"],
	innerHTML: [content],
});

export { AiAdvisorPanel };
