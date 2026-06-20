import Panel from '/core/ui/panel-support.js';
import { MustGetElement } from '/core/ui/utilities/utilities-dom.js';
import '/core/ui/components/fxs-tab-bar.js';
import '/core/ui/components/fxs-scrollable.js';
import content from './ai-advisor-panel.html.js';
import {
	getChosen, setChosen, clearChosen, hasChosenThisAge,
	getAvailableTriumphs, getTracking,
} from './ai-advisor-dedications.js';
import { syncCouncil, recommendForCity } from './ai-advisor-city-council.js';

/**
 * AI Advisor panel.
 *
 * Opened from the dock button. Shows the advisor council's recommendations for
 * the current turn — computed live from the empire state. When opened it first
 * shows a short "deliberating" animation, then
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
/* Dedications: pickable Triumph cards + tracking */
.ai-advisor__ded-prompt{color:#e0c060;text-align:center;margin:0.1rem 0 0.5rem 0;}
.ai-advisor__ded-count{color:#bcb6a8;text-align:center;font-size:0.85rem;margin-bottom:0.4rem;}
.ai-advisor__ded{display:flex;flex-direction:column;padding:0.5rem 0.7rem;margin:0.28rem 0;background:rgba(0,0,0,0.28);border-left:0.28rem solid #888;border-radius:0.25rem;cursor:pointer;transition:background 0.2s ease,opacity 0.2s ease;}
.ai-advisor__ded:hover{background:rgba(255,255,255,0.06);}
.ai-advisor__ded.selected{background:rgba(224,192,96,0.16);box-shadow:inset 0 0 0 0.12rem rgba(224,192,96,0.6);}
.ai-advisor__ded.disabled{opacity:0.45;cursor:default;}
.ai-advisor__ded-head{display:flex;flex-direction:row;align-items:center;justify-content:space-between;}
.ai-advisor__ded-title{font-weight:700;display:flex;flex-direction:row;align-items:center;}
.ai-advisor__ded-title-icon{margin-right:0.4rem;font-size:1.1rem;}
.ai-advisor__ded-pill{font-size:0.75rem;padding:0.05rem 0.4rem;border-radius:0.7rem;background:rgba(0,0,0,0.4);white-space:nowrap;margin-left:0.5rem;}
.ai-advisor__ded-check{font-weight:700;margin-left:0.4rem;}
.ai-advisor__ded-req{color:#d9d2c4;font-size:0.85rem;margin-top:0.2rem;}
.ai-advisor__ded-reward{color:#bfe3c0;font-size:0.85rem;margin-top:0.25rem;}
.ai-advisor__ded-reward-label{color:#6fcf97;font-weight:700;margin-right:0.25rem;}
.ai-advisor__ded-guide{color:#e8e2d4;font-size:0.85rem;margin-top:0.3rem;}
.ai-advisor__ded-actions-list{margin:0.3rem 0 0 0.2rem;color:#bcb6a8;font-size:0.82rem;}
.ai-advisor__ded-actions-list>div{margin:0.08rem 0;}
.ai-advisor__btn{padding:0.35rem 1.1rem;margin:0 0.3rem;border-radius:0.3rem;background:rgba(224,192,96,0.85);color:#1a1407;font-weight:700;cursor:pointer;border:none;}
.ai-advisor__btn.disabled{background:rgba(255,255,255,0.14);color:#8c867a;cursor:default;}
.ai-advisor__btn.secondary{background:rgba(255,255,255,0.12);color:#e8e2d4;}
`;

const TABS = [
	{ id: "dedications", label: "LOC_AI_ADVISOR_TAB_DEDICATIONS" },
	{ id: "council", label: "LOC_AI_ADVISOR_TAB_COUNCIL" },
	{ id: "cities", label: "LOC_AI_ADVISOR_TAB_CITIES" },
	{ id: "triumphs", label: "LOC_AI_ADVISOR_TAB_TRIUMPHS" },
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
	citiesContainer = null;
	dedicationsContainer = null;
	dedicationsActions = null;
	_dotTimer = null;
	_revealTimer = null;
	_pendingSelection = null; // working set of LegacyTypes during picking

	onInitialize() {
		super.onInitialize();
		this.injectStyle();
		this.closeButton = MustGetElement("fxs-close-button", this.Root);
		this.tabBar = MustGetElement(".ai-advisor__tabs", this.Root);
		this.tabPanels = {
			dedications: MustGetElement(".ai-advisor__tab-dedications", this.Root),
			council: MustGetElement(".ai-advisor__tab-council", this.Root),
			cities: MustGetElement(".ai-advisor__tab-cities", this.Root),
			triumphs: MustGetElement(".ai-advisor__tab-triumphs", this.Root),
		};
		this.thinkingEl = MustGetElement(".ai-advisor__thinking", this.Root);
		this.thinkingText = MustGetElement(".ai-advisor__thinking-text", this.Root);
		this.councilEl = MustGetElement(".ai-advisor__council", this.Root);
		this.triumphsContainer = MustGetElement(".ai-advisor__triumphs", this.Root);
		this.citiesContainer = MustGetElement(".ai-advisor__cities", this.Root);
		this.dedicationsContainer = MustGetElement(".ai-advisor__dedications", this.Root);
		this.dedicationsActions = MustGetElement(".ai-advisor__dedications-actions", this.Root);
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
		this.buildTriumphs();
		this.buildCities();
		this.buildDedications();
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
		// Open on Dedications so the advisors greet the leader with the per-Age
		// "pick 3 Triumphs" prompt (or the live tracking once chosen).
		this.tabBar.setAttribute("selected-tab-index", "0");
		this.showTab("dedications");
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
		// Dedications the leader chose this Age, grouped by the advisor who owns them.
		const dedByAdvisor = {};
		for (const t of safe(() => getTracking().items, []) || []) {
			(dedByAdvisor[t.advisorKey] ||= []).push(t);
		}
		ADVISORS.forEach((adv, i) => {
			let text = ADVICE[adv.key](state);
			const v = byAdvisor[adv.key];
			if (v) {
				const verdict = this.victoryVerdict(v);
				const rival = v.rivalsMax > 0 ? ` vs top rival ${v.rivalsMax}` : "";
				text += `  Victory — ${v.name}: you have ${v.myPoints} ${v.stat}${rival} (${verdict.label}).`;
			}
			for (const t of (dedByAdvisor[adv.key] || [])) {
				text += `  Dedication — ${t.name}: ${t.verdict.label}${t.total && !t.triggered ? ` (${t.cur}/${t.total})` : ""}.`;
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

	getLocalPlayer() { return safe(() => Players.get(GameContext.localPlayerID), null); }

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

	// --- Cities: every city advisor + its recommended build -----------------

	/**
	 * List each City's advisor with its assigned focus, current production, and the
	 * council's top build recommendation. Reads the shared city-council module so it
	 * stays consistent with the on-screen city overlay.
	 */
	buildCities() {
		const c = this.citiesContainer;
		c.innerHTML = "";
		const advisors = safe(() => syncCouncil(), []) || [];
		if (!advisors.length) {
			const empty = document.createElement("div");
			empty.classList.add("font-body-sm", "text-accent-3", "italic", "text-center", "my-2");
			empty.textContent = Locale.compose("LOC_AI_ADVISOR_CITIES_NONE");
			c.appendChild(empty);
			return;
		}
		for (const a of advisors) {
			const data = safe(() => recommendForCity(a.cityId), null);
			if (!data) continue;
			c.appendChild(this.cityCard(data));
		}
	}

	cityCard(data) {
		const ORIGIN = { founded: "founded", upgraded: "upgraded", conquered: "conquered" };
		const card = document.createElement("div");
		card.classList.add("ai-advisor__ded");
		card.style.cursor = "default";
		card.style.borderLeftColor = data.focus.color;

		const head = document.createElement("div");
		head.classList.add("ai-advisor__ded-head");
		const title = document.createElement("div");
		title.classList.add("ai-advisor__ded-title", "font-body-base");
		const ic = document.createElement("span");
		ic.classList.add("ai-advisor__ded-title-icon");
		ic.textContent = data.focus.icon;
		const tname = document.createElement("span");
		tname.textContent = `${data.cityName} — ${data.advisorName}`;
		title.appendChild(ic); title.appendChild(tname);
		const pill = document.createElement("div");
		pill.classList.add("ai-advisor__ded-pill");
		pill.style.color = data.focus.color;
		pill.textContent = data.focus.label || "balanced";
		head.appendChild(title); head.appendChild(pill);
		card.appendChild(head);

		const sub = document.createElement("div");
		sub.classList.add("ai-advisor__ded-req");
		sub.textContent = `${ORIGIN[data.origin] || ""}${data.producing ? ` · building ${data.producing}` : ""}`;
		card.appendChild(sub);

		const guide = document.createElement("div");
		guide.classList.add("ai-advisor__ded-guide");
		if (data.top) {
			guide.innerHTML = `<b style="color:${data.focus.color}">Recommends:</b> ${data.top.item.name}${data.top.item.recommended ? " ★" : ""}`;
			card.appendChild(guide);
			const reason = document.createElement("div");
			reason.classList.add("ai-advisor__ded-actions-list", "font-body-sm");
			const row = document.createElement("div");
			row.textContent = data.top.reason;
			reason.appendChild(row);
			card.appendChild(reason);
		} else {
			guide.textContent = "Nothing new to build right now.";
			card.appendChild(guide);
		}
		return card;
	}

	// --- Dedications: pick 3 Triumphs per Age, then track + guide ------------

	/**
	 * Render the Dedications tab. If the leader has not yet chosen this Age, show
	 * the advisor "pick 3 Triumphs" prompt with a selectable list. Once chosen,
	 * show the live tracking view (progress, on-track verdict, guidance).
	 */
	buildDedications() {
		if (hasChosenThisAge()) this.renderDedicationTracking();
		else this.renderDedicationPicker();
	}

	clearDedications() {
		this.dedicationsContainer.innerHTML = "";
		this.dedicationsActions.innerHTML = "";
	}

	makeButton(label, opts = {}) {
		const b = document.createElement("div");
		b.classList.add("ai-advisor__btn", "font-body-base");
		if (opts.secondary) b.classList.add("secondary");
		if (opts.disabled) b.classList.add("disabled");
		b.textContent = label;
		if (!opts.disabled && opts.onClick) b.addEventListener("action-activate", opts.onClick), b.addEventListener("click", opts.onClick);
		return b;
	}

	// --- selection view -----------------------------------------------------

	renderDedicationPicker() {
		this.clearDedications();
		const c = this.dedicationsContainer;
		if (this._pendingSelection == null) this._pendingSelection = getChosen();

		const ageName = safe(() => Locale.compose(GameInfo.Ages.lookup(Game.age).Name), null);
		const prompt = document.createElement("div");
		prompt.classList.add("ai-advisor__ded-prompt", "font-title-sm");
		prompt.textContent = `The dawn of ${ageName || "a new Age"} — choose 3 Triumphs to dedicate this Age to.`;
		c.appendChild(prompt);

		const triumphs = getAvailableTriumphs();
		if (!triumphs.length) {
			const empty = document.createElement("div");
			empty.classList.add("font-body-sm", "text-accent-3", "italic", "text-center", "my-2");
			empty.textContent = "No Triumphs are available to dedicate to yet. Check back once the Age is underway.";
			c.appendChild(empty);
			return;
		}

		let lastAttr = null;
		for (const t of triumphs) {
			if (t.attr !== lastAttr) { c.appendChild(this.sectionHeader(t.attr)); lastAttr = t.attr; }
			c.appendChild(this.dedicationCard(t));
		}
		this.renderPickerActions();
	}

	dedicationCard(t) {
		const card = document.createElement("div");
		card.classList.add("ai-advisor__ded");
		card.style.borderLeftColor = t.color;
		const selected = this._pendingSelection.includes(t.type);
		if (selected) card.classList.add("selected");
		// Completed or lost-race Triumphs can't be a meaningful target.
		const pickable = !t.triggered && !t.raceLost;
		if (!pickable) card.classList.add("disabled");

		const head = document.createElement("div");
		head.classList.add("ai-advisor__ded-head");
		const title = document.createElement("div");
		title.classList.add("ai-advisor__ded-title", "font-body-base");
		const ic = document.createElement("span");
		ic.classList.add("ai-advisor__ded-title-icon");
		ic.textContent = t.icon;
		const tname = document.createElement("span");
		tname.textContent = (t.firstOnly ? "🏁 " : "") + t.name;
		title.appendChild(ic); title.appendChild(tname);
		if (selected) {
			const ck = document.createElement("span");
			ck.classList.add("ai-advisor__ded-check");
			ck.style.color = "#e0c060";
			ck.textContent = "✓";
			title.appendChild(ck);
		}
		const pill = document.createElement("div");
		pill.classList.add("ai-advisor__ded-pill");
		pill.style.color = t.color;
		pill.textContent = t.triggered ? "✓ Complete" : t.raceLost ? "Race lost"
			: (t.total ? `${t.cur}/${t.total}` : t.attr);
		head.appendChild(title); head.appendChild(pill);
		card.appendChild(head);

		if (t.requirement) {
			const req = document.createElement("div");
			req.classList.add("ai-advisor__ded-req");
			req.innerHTML = t.requirement; // stylized rich text (the challenge)
			card.appendChild(req);
		}

		// The Dedication you unlock for the next Age by completing this Triumph.
		if (t.reward) {
			const rew = document.createElement("div");
			rew.classList.add("ai-advisor__ded-reward");
			rew.innerHTML = `<span class="ai-advisor__ded-reward-label">Reward:</span>${t.reward}`;
			card.appendChild(rew);
		}

		if (pickable) {
			const toggle = () => this.togglePending(t.type);
			card.addEventListener("action-activate", toggle);
			card.addEventListener("click", toggle);
		}
		return card;
	}

	togglePending(type) {
		const i = this._pendingSelection.indexOf(type);
		if (i >= 0) this._pendingSelection.splice(i, 1);
		else if (this._pendingSelection.length < 3) this._pendingSelection.push(type);
		// re-render to reflect selection state + button enablement
		this.renderDedicationPicker();
	}

	renderPickerActions() {
		const bar = this.dedicationsActions;
		bar.innerHTML = "";
		const n = this._pendingSelection.length;
		const count = document.createElement("div");
		count.classList.add("ai-advisor__ded-count", "font-body-sm");
		count.style.marginRight = "0.6rem";
		count.style.marginBottom = "0";
		count.textContent = `${n} / 3 selected`;
		bar.appendChild(count);
		bar.appendChild(this.makeButton("Confirm Dedications", {
			disabled: n !== 3,
			onClick: () => {
				setChosen(this._pendingSelection);
				this._pendingSelection = null;
				this.renderDedicationTracking();
			},
		}));
	}

	// --- tracking view ------------------------------------------------------

	renderDedicationTracking() {
		this.clearDedications();
		const c = this.dedicationsContainer;
		const { items } = getTracking();

		const ageName = safe(() => Locale.compose(GameInfo.Ages.lookup(Game.age).Name), null);
		const head = document.createElement("div");
		head.classList.add("ai-advisor__ded-prompt", "font-title-sm");
		head.textContent = `Your ${ageName || "Age"} Dedications — progress & guidance`;
		c.appendChild(head);

		if (!items.length) {
			const empty = document.createElement("div");
			empty.classList.add("font-body-sm", "text-accent-3", "italic", "text-center", "my-2");
			empty.textContent = "Your chosen Triumphs are no longer available. Pick a new set below.";
			c.appendChild(empty);
		}

		for (const t of items) c.appendChild(this.trackingCard(t));

		const bar = this.dedicationsActions;
		bar.innerHTML = "";
		bar.appendChild(this.makeButton("Change Selection", {
			secondary: true,
			onClick: () => {
				clearChosen();
				this._pendingSelection = null;
				this.renderDedicationPicker();
			},
		}));
	}

	trackingCard(t) {
		const card = document.createElement("div");
		card.classList.add("ai-advisor__ded");
		card.style.cursor = "default";
		card.style.borderLeftColor = t.verdict.color;

		const head = document.createElement("div");
		head.classList.add("ai-advisor__ded-head");
		const title = document.createElement("div");
		title.classList.add("ai-advisor__ded-title", "font-body-base");
		const ic = document.createElement("span");
		ic.classList.add("ai-advisor__ded-title-icon");
		ic.textContent = t.icon;
		const tname = document.createElement("span");
		tname.textContent = t.name;
		title.appendChild(ic); title.appendChild(tname);
		const pill = document.createElement("div");
		pill.classList.add("ai-advisor__ded-pill");
		pill.style.color = t.verdict.color;
		pill.textContent = t.verdict.label + (t.total && !t.triggered ? ` · ${t.cur}/${t.total}` : "");
		head.appendChild(title); head.appendChild(pill);
		card.appendChild(head);

		// progress bar
		if (t.total > 0) {
			const barWrap = document.createElement("div");
			barWrap.classList.add("ai-advisor__triumph-barwrap");
			barWrap.style.marginTop = "0.35rem";
			const bar = document.createElement("div");
			bar.classList.add("ai-advisor__triumph-bar");
			bar.style.width = `${Math.min(100, Math.round((t.cur / t.total) * 100))}%`;
			bar.style.backgroundColor = t.verdict.color;
			barWrap.appendChild(bar);
			card.appendChild(barWrap);
		}

		const guide = document.createElement("div");
		guide.classList.add("ai-advisor__ded-guide");
		guide.innerHTML = `<b style="color:${t.color}">${t.advisor}:</b> ${t.guidance}`;
		card.appendChild(guide);

		// concrete action list for in-progress goals
		if (!t.triggered && !t.raceLost && t.actions && t.actions.length) {
			const list = document.createElement("div");
			list.classList.add("ai-advisor__ded-actions-list", "font-body-sm");
			for (const a of t.actions) {
				const row = document.createElement("div");
				row.textContent = "• " + a;
				list.appendChild(row);
			}
			card.appendChild(list);
		}
		return card;
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
