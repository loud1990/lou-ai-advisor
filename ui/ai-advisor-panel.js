import Panel from '/core/ui/panel-support.js';
import { MustGetElement } from '/core/ui/utilities/utilities-dom.js';
import '/core/ui/components/fxs-tab-bar.js';
import '/core/ui/components/fxs-scrollable.js';
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
/* Cap the whole panel so it never overflows the screen; each tab scrolls. */
.ai-advisor__frame{max-height:86vh;}
.ai-advisor__scroll{height:46vh;min-height:18rem;}
.ai-advisor__spinner{width:2.4rem;height:2.4rem;border:0.3rem solid rgba(255,255,255,0.18);border-top-color:#e0c060;border-radius:50%;animation:aiadv-spin 0.9s linear infinite;}
@keyframes aiadv-spin{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}
.ai-advisor__card{display:flex;flex-direction:row;align-items:flex-start;padding:0.5rem 0.7rem;margin:0.28rem 0;background:rgba(0,0,0,0.28);border-left:0.28rem solid #888;border-radius:0.25rem;opacity:0;transition:opacity 0.35s ease;}
.ai-advisor__card.shown{opacity:1;}
.ai-advisor__card-icon{font-size:1.4rem;margin-right:0.6rem;line-height:1.6rem;}
.ai-advisor__card-body{display:flex;flex-direction:column;flex:1;}
.ai-advisor__card-name{font-weight:700;margin-bottom:0.1rem;}
.ai-advisor__card-text{color:#d9d2c4;}
/* Triumph (legacy path) cards */
.ai-advisor__triumph{display:flex;flex-direction:column;padding:0.55rem 0.75rem;margin:0.3rem 0;background:rgba(0,0,0,0.28);border-left:0.28rem solid #888;border-radius:0.25rem;}
.ai-advisor__triumph-head{display:flex;flex-direction:row;align-items:center;justify-content:space-between;}
.ai-advisor__triumph-name{font-weight:700;}
.ai-advisor__triumph-verdict{font-weight:700;font-size:0.82rem;padding:0.05rem 0.4rem;border-radius:0.7rem;background:rgba(0,0,0,0.35);white-space:nowrap;margin-left:0.5rem;}
.ai-advisor__triumph-how{color:#d9d2c4;margin:0.15rem 0 0.35rem 0;}
.ai-advisor__triumph-barwrap{position:relative;height:0.7rem;background:rgba(255,255,255,0.12);border-radius:0.5rem;overflow:hidden;}
.ai-advisor__triumph-bar{position:absolute;top:0;left:0;height:100%;border-radius:0.5rem;transition:width 0.5s ease;}
.ai-advisor__triumph-meta{display:flex;flex-direction:row;justify-content:space-between;color:#bcb6a8;font-size:0.8rem;margin-top:0.2rem;}
.ai-advisor__triumph-section{margin:0.6rem 0 0.15rem 0;padding-bottom:0.15rem;border-bottom:0.07rem solid rgba(224,192,96,0.35);letter-spacing:0.03em;}
.ai-advisor__triumph-section:first-child{margin-top:0;}
`;

const TABS = [
	{ id: "council", label: "LOC_AI_ADVISOR_TAB_COUNCIL" },
	{ id: "triumphs", label: "LOC_AI_ADVISOR_TAB_TRIUMPHS" },
	{ id: "empire", label: "LOC_AI_ADVISOR_TAB_EMPIRE" },
];

// Test of Time (1.4.0) victory conditions. The four attribute Victories culminate
// in the Modern age — each is won by having the greatest of a measured stat among
// all leaders. Map each to the advisor who owns it and a concise "how to win".
const VICTORY_META = {
	VICTORY_CLASS_MILITARY: {
		advisor: "military", stat: "Dominion", title: "Military Victory",
		how: "Win by Dominion — control the most Settlements (4 each; +4 your original capital, +1 for Distant Lands or captured). Expand and conquer.",
	},
	VICTORY_CLASS_CULTURE: {
		advisor: "culture", stat: "Tourism", title: "Cultural Victory",
		how: "Win by Tourism — build Wonders, display Relics, Artifacts and Great Works, improve Natural Wonders, and celebrate.",
	},
	VICTORY_CLASS_ECONOMIC: {
		advisor: "economy", stat: "GDP", title: "Economic Victory",
		how: "Win by GDP — stack Gold buildings (+2/turn each), assign City and imported Resources, and run Trade Routes.",
	},
	VICTORY_CLASS_SCIENCE: {
		advisor: "science", stat: "Innovation", title: "Scientific Victory",
		how: "Win the Space Race — reach 100 Innovation with an active Launch Pad via Tech Masteries, Projects and displayed Codices.",
	},
};

// Legacy attribute (Triumph subtype) -> short label for the per-Age triumph list.
const LEGACY_SUBTYPE_LABEL = {
	LEGACY_CULTURAL: "Cultural", LEGACY_DIPLOMATIC: "Diplomatic", LEGACY_MILITARY: "Militaristic",
	LEGACY_ECONOMIC: "Economic", LEGACY_SCIENTIFIC: "Scientific", LEGACY_EXPANSIONIST: "Expansionist",
};

function safe(fn, dflt) { try { return fn(); } catch (e) { return dflt; } }

class AiAdvisorPanel extends Panel {
	closeButton = null;
	tabBar = null;
	tabPanels = {};
	thinkingEl = null;
	thinkingText = null;
	councilEl = null;
	triumphsContainer = null;
	empireContainer = null;
	yieldsContainer = null;
	_dotTimer = null;
	_revealTimer = null;

	onInitialize() {
		super.onInitialize();
		this.injectStyle();
		this.closeButton = MustGetElement("fxs-close-button", this.Root);
		this.tabBar = MustGetElement(".ai-advisor__tabs", this.Root);
		this.tabPanels = {
			council: MustGetElement(".ai-advisor__tab-council", this.Root),
			triumphs: MustGetElement(".ai-advisor__tab-triumphs", this.Root),
			empire: MustGetElement(".ai-advisor__tab-empire", this.Root),
		};
		this.thinkingEl = MustGetElement(".ai-advisor__thinking", this.Root);
		this.thinkingText = MustGetElement(".ai-advisor__thinking-text", this.Root);
		this.councilEl = MustGetElement(".ai-advisor__council", this.Root);
		this.triumphsContainer = MustGetElement(".ai-advisor__triumphs", this.Root);
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
		this.setupTabs();
		this.buildEmpireInfo();
		this.buildYieldInfo();
		this.buildTriumphs();
		this.startDeliberation();
	}

	// --- tabs ----------------------------------------------------------------

	setupTabs() {
		this.tabBar.addEventListener("tab-selected", (e) => {
			const tab = TABS[e.detail.index];
			if (tab) this.showTab(tab.id);
		});
		this.tabBar.setAttribute("tab-items", JSON.stringify(
			TABS.map((t) => ({ id: t.id, label: t.label }))
		));
		this.tabBar.setAttribute("selected-tab-index", "1");
		this.showTab("triumphs");
	}

	showTab(id) {
		for (const key in this.tabPanels) {
			this.tabPanels[key].style.display = key === id ? "flex" : "none";
		}
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
		const vic = this.gatherVictories();
		const byAdvisor = {};
		for (const v of vic.victories) if (v.advisor) byAdvisor[v.advisor] = v;
		ADVISORS.forEach((adv, i) => {
			let text = ADVICE[adv.key](state);
			const v = byAdvisor[adv.key];
			if (v) {
				const verdict = this.victoryVerdict(v);
				const rival = v.rivalsMax > 0 ? ` vs top rival ${v.rivalsMax}` : "";
				text += `  Victory — ${v.name}: you have ${v.myPoints} ${v.stat}${rival} (${verdict.label}).`;
			}
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

	// --- Test of Time victory conditions: target, how-to, standing, on-track ---

	/**
	 * Read the four attribute Victory conditions (Test of Time). Each is won by
	 * having the greatest of a measured stat (Dominion/Tourism/GDP/Innovation)
	 * among all leaders, so "progress" is your stat vs the strongest rival and
	 * "on track" means you are leading. Uses player.Victories.getPointsForVictoryType.
	 */
	gatherVictories() {
		const player = this.getLocalPlayer();
		const out = { victories: [], age: null, isFinalAge: false };
		if (!player) return out;
		out.age = safe(() => Locale.compose(GameInfo.Ages.lookup(Game.age).Name), null);
		out.isFinalAge = safe(() => Game.AgeProgressManager.isFinalAge, false);

		const majors = safe(() => Players.getAlive().filter((p) => p.isMajor), []) || [];
		const myId = safe(() => GameContext.localPlayerID, -1);
		const myDip = safe(() => player.Diplomacy, null);

		for (const v of (safe(() => GameInfo.Victories, []) || [])) {
			const meta = VICTORY_META[v.VictoryClassType];
			if (!meta) continue; // only the four attribute victories
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
			out.victories.push({
				advisor: meta.advisor,
				name: meta.title,
				stat: meta.stat,
				how: meta.how,
				myPoints, rivalsMax,
				target: target && target > 0 ? target : null,
			});
		}
		return out;
	}

	// Standing verdict for a victory: are you leading the measured stat?
	victoryVerdict(v) {
		if (v.myPoints <= 0 && v.rivalsMax <= 0) return { label: "Not yet contested", color: "#9aa3ad" };
		if (v.myPoints >= v.rivalsMax && v.myPoints > 0) return { label: "Leading", color: "#6fcf97" };
		if (v.rivalsMax > 0 && v.myPoints >= v.rivalsMax * 0.75) return { label: "Competitive", color: "#f2c94c" };
		return { label: "Behind", color: "#eb5757" };
	}

	/**
	 * The current Age's Triumphs (Test of Time Legacies) the player is advancing:
	 * name, requirement, progress, and whether completed. Limited to in-progress
	 * and completed so the list stays focused.
	 */
	gatherAgeTriumphs() {
		const player = this.getLocalPlayer();
		const out = [];
		const pl = safe(() => player.Legacies, null);
		if (!pl) return out;
		for (const t of (safe(() => GameInfo.Legacies, []) || [])) {
			if (!safe(() => pl.isValidLegacy(t.LegacyType), false)) continue;
			const triggered = safe(() => pl.isTriggered(t.LegacyType), false);
			const prog = safe(() => pl.getProgress(t.LegacyType), null);
			let cur = 0, total = 0;
			if (prog && prog.progress && prog.progress[0]) {
				cur = prog.progress[0].current || 0;
				total = prog.progress[0].total || 0;
			}
			if (!triggered && cur <= 0) continue; // only what you're actively advancing
			out.push({
				name: safe(() => Locale.compose(t.Name), t.LegacyType),
				// stylize resolves the Civ7 text markup ([B], [icon:…], [TIP:…]) to rich HTML.
				req: safe(() => (t.TriggerDescription ? Locale.stylize(t.TriggerDescription) : null), null),
				attr: LEGACY_SUBTYPE_LABEL[t.LegacySubtype] || "",
				major: !(t.MajorLegacy === false || t.MajorLegacy === 0),
				cur, total, triggered,
			});
		}
		out.sort((a, b) => (b.major - a.major) || (b.triggered - a.triggered)
			|| ((b.cur / (b.total || 1)) - (a.cur / (a.total || 1))));
		return out.slice(0, 8);
	}

	sectionHeader(text) {
		const h = document.createElement("div");
		h.classList.add("ai-advisor__triumph-section", "font-title-sm", "text-accent-2");
		h.textContent = text;
		return h;
	}

	buildTriumphs() {
		const data = this.gatherVictories();
		const c = this.triumphsContainer;
		c.innerHTML = "";

		// --- Section 1: the four victory conditions (the win targets) ---
		c.appendChild(this.sectionHeader("Victory Conditions"));
		if (!data.victories.length) {
			const empty = document.createElement("div");
			empty.classList.add("font-body-sm", "text-accent-3", "italic", "text-center", "my-2");
			empty.textContent = Locale.compose("LOC_AI_ADVISOR_TRIUMPHS_NONE");
			c.appendChild(empty);
		}
		for (const v of data.victories) {
			const verdict = this.victoryVerdict(v);
			const card = document.createElement("div");
			card.classList.add("ai-advisor__triumph");
			card.style.borderLeftColor = verdict.color;

			const head = document.createElement("div");
			head.classList.add("ai-advisor__triumph-head");
			const name = document.createElement("div");
			name.classList.add("ai-advisor__triumph-name", "font-body-base");
			name.textContent = v.name;
			const vEl = document.createElement("div");
			vEl.classList.add("ai-advisor__triumph-verdict");
			vEl.style.color = verdict.color;
			vEl.textContent = verdict.label;
			head.appendChild(name); head.appendChild(vEl);
			card.appendChild(head);

			const how = document.createElement("div");
			how.classList.add("ai-advisor__triumph-how", "font-body-sm");
			how.textContent = v.how;
			card.appendChild(how);

			// Standing bar: your stat relative to the strongest rival (or target).
			const denom = Math.max(v.myPoints, v.rivalsMax, v.target || 0, 1);
			const barWrap = document.createElement("div");
			barWrap.classList.add("ai-advisor__triumph-barwrap");
			const bar = document.createElement("div");
			bar.classList.add("ai-advisor__triumph-bar");
			bar.style.width = `${Math.min(100, Math.round((v.myPoints / denom) * 100))}%`;
			bar.style.backgroundColor = verdict.color;
			barWrap.appendChild(bar);
			card.appendChild(barWrap);

			const meta = document.createElement("div");
			meta.classList.add("ai-advisor__triumph-meta", "font-body-sm");
			const left = document.createElement("div");
			left.textContent = `You ${v.myPoints} ${v.stat}` + (v.rivalsMax > 0 ? ` · top rival ${v.rivalsMax}` : "");
			const right = document.createElement("div");
			right.textContent = v.target != null ? `Target ${v.target}` : (data.isFinalAge ? "" : "Decided in the Modern Age");
			meta.appendChild(left); meta.appendChild(right);
			card.appendChild(meta);

			c.appendChild(card);
		}

		// --- Section 2: this Age's Triumphs (what to do now) ---
		const triumphs = this.gatherAgeTriumphs();
		c.appendChild(this.sectionHeader(`Triumphs This Age${data.age ? " — " + data.age : ""}`));
		if (!triumphs.length) {
			const note = document.createElement("div");
			note.classList.add("font-body-sm", "text-accent-3", "italic", "my-2");
			note.textContent = "No Triumphs in progress yet. Complete Major Triumphs to bank Legacy Points and Attributes toward your victory.";
			c.appendChild(note);
		}
		for (const t of triumphs) {
			const done = t.triggered;
			const color = done ? "#6fcf97" : "#56ccf2";
			const card = document.createElement("div");
			card.classList.add("ai-advisor__triumph");
			card.style.borderLeftColor = color;

			const head = document.createElement("div");
			head.classList.add("ai-advisor__triumph-head");
			const name = document.createElement("div");
			name.classList.add("ai-advisor__triumph-name", "font-body-base");
			name.textContent = (t.major ? "★ " : "") + t.name + (t.attr ? ` (${t.attr})` : "");
			const vEl = document.createElement("div");
			vEl.classList.add("ai-advisor__triumph-verdict");
			vEl.style.color = color;
			vEl.textContent = done ? "✓ Complete" : (t.total > 0 ? `${t.cur}/${t.total}` : "In progress");
			head.appendChild(name); head.appendChild(vEl);
			card.appendChild(head);

			if (t.req) {
				const req = document.createElement("div");
				req.classList.add("ai-advisor__triumph-how", "font-body-sm");
				req.innerHTML = t.req; // stylized rich text (see gatherAgeTriumphs)
				card.appendChild(req);
			}
			if (!done && t.total > 0) {
				const barWrap = document.createElement("div");
				barWrap.classList.add("ai-advisor__triumph-barwrap");
				const bar = document.createElement("div");
				bar.classList.add("ai-advisor__triumph-bar");
				bar.style.width = `${Math.min(100, Math.round((t.cur / t.total) * 100))}%`;
				bar.style.backgroundColor = color;
				barWrap.appendChild(bar);
				card.appendChild(barWrap);
			}
			c.appendChild(card);
		}
	}
}

// --- rule-based advisor logic (mirrors advisors/personas.py) -----------------

const ADVICE = {
	// Expansion feeds Dominion (the Military Victory) and Expansionist Triumphs.
	expansion(s) {
		const n = s.cities.length;
		if (n === 0) return "Found your capital this turn — every turn unsettled is wasted yields. Settle near fresh water with good adjacency.";
		if (n === 1) return "One city so far. Build a Settler and found a second settlement — each one is worth 4 Dominion toward the Military Victory and feeds your Expansionist Triumphs.";
		return `You have ${n} settlements — keep expanding. Settlements are the backbone of Dominion (Military Victory) and your Expansionist Triumphs; scout for the next strong site.`;
	},
	// Military Victory in Test of Time is won by the greatest Dominion (Settlements ×4).
	military(s) {
		if (!s.hasMilitary) return "No combat unit yet — train a Warrior to defend against Independent Powers and barbarians, then build the army that captures Settlements for Dominion.";
		return "Hold your borders, then look outward: the Military Victory is won by Dominion, so capturing rival Settlements (and protecting your own) is how you pull ahead.";
	},
	// Scientific Victory is the Space Race: 100 Innovation + an active Launch Pad.
	science(s) {
		if (!s.research) return "⚠ No technology selected — choose one now; idle research wastes science every turn.";
		const sci = s.yields.science;
		const sciTxt = (sci != null) ? ` Science is ${sci > 0 ? "+" : ""}${sci}/turn.` : "";
		return `Researching ${s.research}.${sciTxt} Bank Innovation toward the Space Race — chase Tech Masteries, unlock Projects, and display Codices.`;
	},
	// Cultural Victory is won by the greatest Tourism.
	culture(s) {
		if (!s.civic) return "No civic selected — pick one so your culture isn't idle.";
		return `Pursuing ${s.civic}. Build toward Tourism for the Cultural Victory — raise Wonders, create and display Great Works, and keep Relics and Artifacts on show.`;
	},
	// Economic Victory is won by the greatest GDP.
	economy(s) {
		const h = s.yields.happiness;
		if (h != null && h < 0) return "Happiness is NEGATIVE — build an amenity or trigger a celebration before penalties stall growth.";
		if (h != null && h < 3) return `Happiness is tight (${h}). Plan an amenity building soon as the empire grows.`;
		const idle = s.cities.find((c) => !c.producing);
		if (idle) return `${idle.name} has no active production — build a Gold building or assign Resources; idle hammers are GDP left on the table.`;
		const g = s.yields.gold;
		return `Economy is steady${g != null ? ` (${g > 0 ? "+" : ""}${g} gold/turn)` : ""}. Stack Gold buildings and assign City/imported Resources to climb GDP for the Economic Victory.`;
	},
};

Controls.define("ai-advisor-panel", {
	createInstance: AiAdvisorPanel,
	description: "AI Advisor panel with live game information and advisor advice.",
	classNames: ["ai-advisor-panel", "absolute", "inset-0", "flex", "items-center", "justify-center"],
	innerHTML: [content],
});

export { AiAdvisorPanel };
