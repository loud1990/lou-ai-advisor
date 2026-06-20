import Panel from '/core/ui/panel-support.js';
import { MustGetElement } from '/core/ui/utilities/utilities-dom.js';
import '/core/ui/components/fxs-scrollable.js';
import content from './ai-advisor-city-panel.html.js';
import {
	safe, recommendForCity, applyBuild, setCityPanelOpen, isCitySelected,
} from './ai-advisor-city-council.js';

/**
 * AI Advisor — City panel (overlay).
 *
 * Auto-opens beside the native production chooser when a City is selected. Shows
 * that city's advisor, its assigned focus, and a ranked build recommendation —
 * the top pick (with a one-click "Build this" button) plus runner-ups — all from
 * the shared city-council module. Closes itself when the city screen is left.
 */

const STYLE_ID = "ai-advisor-city-style";
const STYLE = `
/* Anchor the overlay to the RIGHT edge, vertically centered, so it sits clear of
   the native production chooser + its build queue (both docked on the left) and
   below/above the top-right leader ribbon and bottom-right minimap. */
.ai-city-panel{justify-content:flex-end;align-items:center;}
.ai-city__frame{max-height:70vh;width:22rem;margin-right:1.5rem;}
.ai-city__scroll{height:auto;max-height:52vh;min-height:6rem;}
.ai-city__id{display:flex;flex-direction:row;align-items:center;justify-content:space-between;padding:0.3rem 0;}
.ai-city__id-name{font-weight:700;}
.ai-city__id-origin{font-size:0.78rem;color:#bcb6a8;}
.ai-city__focus{display:flex;flex-direction:row;align-items:center;padding:0.35rem 0.5rem;margin:0.15rem 0 0.35rem 0;background:rgba(0,0,0,0.28);border-radius:0.25rem;}
.ai-city__focus-icon{font-size:1.1rem;margin-right:0.45rem;}
.ai-city__focus-text{font-size:0.85rem;color:#e8e2d4;}
.ai-city__prod{font-size:0.82rem;color:#bcb6a8;margin-bottom:0.4rem;}
.ai-city__sec{margin:0.4rem 0 0.15rem 0;padding-bottom:0.12rem;border-bottom:0.07rem solid rgba(224,192,96,0.35);letter-spacing:0.03em;}
.ai-city__pick{display:flex;flex-direction:column;padding:0.5rem 0.65rem;margin:0.28rem 0;background:rgba(0,0,0,0.3);border-left:0.28rem solid #888;border-radius:0.25rem;}
.ai-city__pick.top{background:rgba(224,192,96,0.12);}
.ai-city__pick-head{display:flex;flex-direction:row;align-items:center;justify-content:space-between;}
.ai-city__pick-name{font-weight:700;}
.ai-city__pick-turns{font-size:0.78rem;color:#bcb6a8;white-space:nowrap;margin-left:0.5rem;}
.ai-city__pick-reason{font-size:0.83rem;color:#d9d2c4;margin-top:0.2rem;}
.ai-city__btn{align-self:flex-start;padding:0.3rem 0.9rem;margin-top:0.4rem;border-radius:0.3rem;background:rgba(224,192,96,0.85);color:#1a1407;font-weight:700;cursor:pointer;border:none;}
.ai-city__btn.disabled{background:rgba(255,255,255,0.14);color:#8c867a;cursor:default;}
.ai-city__empty{font-size:0.85rem;color:#bcb6a8;font-style:italic;text-align:center;margin:0.6rem 0;}
`;

class AiAdvisorCityPanel extends Panel {
	closeButton = null;
	headEl = null;
	bodyEl = null;
	_onSel = null;
	_onProd = null;

	onInitialize() {
		super.onInitialize();
		this.injectStyle();
		this.closeButton = MustGetElement("fxs-close-button", this.Root);
		this.headEl = MustGetElement(".ai-city__head", this.Root);
		this.bodyEl = MustGetElement(".ai-city__body", this.Root);
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
		setCityPanelOpen(true);
		this.closeButton.addEventListener("action-activate", () => this.close());
		// Re-render when the player picks a different city or its production changes;
		// close when the city screen is left.
		this._onSel = () => { if (isCitySelected()) this.render(); else this.close(); };
		this._onProd = () => this.render();
		try { engine.on("CitySelectionChanged", this._onSel); } catch (e) { /* */ }
		try { engine.on("CityProductionChanged", this._onProd); } catch (e) { /* */ }
		this.render();
	}

	onDetach() {
		setCityPanelOpen(false);
		try { engine.off("CitySelectionChanged", this._onSel); } catch (e) { /* */ }
		try { engine.off("CityProductionChanged", this._onProd); } catch (e) { /* */ }
		super.onDetach();
	}

	// --- rendering -----------------------------------------------------------

	render() {
		const cid = safe(() => UI.Player.getHeadSelectedCity(), null);
		const data = cid ? safe(() => recommendForCity(cid), null) : null;
		this.headEl.innerHTML = "";
		this.bodyEl.innerHTML = "";
		if (!data) {
			const e = document.createElement("div");
			e.classList.add("ai-city__empty");
			e.textContent = Locale.compose("LOC_AI_ADVISOR_CITY_NONE");
			this.bodyEl.appendChild(e);
			return;
		}
		this.renderHead(data);
		this.renderBody(data);
	}

	renderHead(data) {
		const ORIGIN = { founded: "Founded as a City", upgraded: "Upgraded from a Town", conquered: "Taken by conquest" };

		const id = document.createElement("div");
		id.classList.add("ai-city__id");
		const left = document.createElement("div");
		left.classList.add("ai-city__id-name", "font-body-base");
		left.textContent = `${data.advisorName} · ${data.cityName}`;
		const origin = document.createElement("div");
		origin.classList.add("ai-city__id-origin");
		origin.textContent = ORIGIN[data.origin] || "";
		id.appendChild(left); id.appendChild(origin);
		this.headEl.appendChild(id);

		const focus = document.createElement("div");
		focus.classList.add("ai-city__focus");
		focus.style.borderLeft = `0.2rem solid ${data.focus.color}`;
		const ic = document.createElement("span");
		ic.classList.add("ai-city__focus-icon");
		ic.textContent = data.focus.icon;
		const txt = document.createElement("span");
		txt.classList.add("ai-city__focus-text");
		txt.innerHTML = `Council focus for this city: <b style="color:${data.focus.color}">${data.focus.label || "balanced"}</b>`;
		focus.appendChild(ic); focus.appendChild(txt);
		this.headEl.appendChild(focus);

		if (data.producing) {
			const prod = document.createElement("div");
			prod.classList.add("ai-city__prod");
			prod.textContent = `Currently building: ${data.producing}`;
			this.headEl.appendChild(prod);
		}
	}

	renderBody(data) {
		const c = this.bodyEl;
		if (!data.top) {
			const e = document.createElement("div");
			e.classList.add("ai-city__empty");
			e.textContent = Locale.compose("LOC_AI_ADVISOR_CITY_NOBUILDS");
			c.appendChild(e);
			return;
		}
		c.appendChild(this.section("Recommended"));
		c.appendChild(this.pickCard(data, data.top, true));
		if (data.runnerUps && data.runnerUps.length) {
			c.appendChild(this.section("Also worth considering"));
			for (const r of data.runnerUps) c.appendChild(this.pickCard(data, r, false));
		}
	}

	section(text) {
		const h = document.createElement("div");
		h.classList.add("ai-city__sec", "font-title-sm", "text-accent-2");
		h.textContent = text;
		return h;
	}

	pickCard(data, scored, isTop) {
		const item = scored.item;
		const card = document.createElement("div");
		card.classList.add("ai-city__pick");
		if (isTop) card.classList.add("top");
		card.style.borderLeftColor = data.focus.color;

		const head = document.createElement("div");
		head.classList.add("ai-city__pick-head");
		const name = document.createElement("div");
		name.classList.add("ai-city__pick-name", "font-body-base");
		name.textContent = (item.recommended ? "★ " : "") + item.name;
		const turns = document.createElement("div");
		turns.classList.add("ai-city__pick-turns");
		turns.textContent = item.turns != null && item.turns > 0 ? `${item.turns} turns` : item.kind;
		head.appendChild(name); head.appendChild(turns);
		card.appendChild(head);

		const reason = document.createElement("div");
		reason.classList.add("ai-city__pick-reason");
		reason.textContent = scored.reason;
		card.appendChild(reason);

		const btn = document.createElement("div");
		btn.classList.add("ai-city__btn", "font-body-sm");
		btn.textContent = Locale.compose("LOC_AI_ADVISOR_CITY_BUILD");
		const apply = () => {
			const cid = safe(() => UI.Player.getHeadSelectedCity(), null);
			if (cid && applyBuild(cid, item)) {
				try { Audio.playSound("data-audio-activate", "city-actions"); } catch (e) { /* */ }
				this.render();
			}
		};
		btn.addEventListener("action-activate", apply);
		btn.addEventListener("click", apply);
		card.appendChild(btn);
		return card;
	}
}

Controls.define("ai-advisor-city-panel", {
	createInstance: AiAdvisorCityPanel,
	description: "Per-city AI Advisor overlay shown on the city screen.",
	classNames: ["ai-city-panel", "absolute", "inset-0", "flex", "items-center", "justify-start"],
	innerHTML: [content],
});

export { AiAdvisorCityPanel };
