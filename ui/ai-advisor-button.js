import ContextManager from '/core/ui/context-manager/context-manager.js';
import { FxsActivatable } from '/core/ui/components/fxs-activatable.js';
import { ModdingRegistry } from '/core/ui/modding-registry-handler/modding-registry-handler.js';

const BUTTON_TAG = "ai-advisor-button";
const DOCK_ID = "panel-sub-system-dock";
const MOD_SLOT_ID = "panel-sub-system-dock-mod-slot";

/**
 * AI Advisor dock button.
 *
 * Lives in the sub-system dock (the row at the top-left with the Age/Tech/Culture
 * rings, Religion, Advisors, etc.) and opens the AI Advisor panel. It reuses the
 * dock's own button classes so it matches the native buttons, and the base-game
 * "advisors" icon for a fitting look.
 */
class AiAdvisorButton extends FxsActivatable {
	onInitialize() {
		super.onInitialize();
		this.Root.classList.add("ssb__element", "ssb__button", "ai-advisor");
		this.Root.setAttribute("data-tooltip-content", Locale.compose("LOC_AI_ADVISOR_BUTTON_TOOLTIP"));

		// Background circle layers (idle / hover / active), mirroring the dock's
		// own small buttons.
		for (const variant of ["", "--hover", "--active"]) {
			const bg = document.createElement("div");
			bg.classList.add(`ssb__button-iconbg${variant}`);
			this.Root.appendChild(bg);
		}
		// Foreground icon (reuses the base-game advisors icon).
		const icon = document.createElement("div");
		icon.classList.add("ssb__button-icon", "advisors");
		this.Root.appendChild(icon);
	}

	onAttach() {
		super.onAttach();
		this.Root.addEventListener("action-activate", this.onActivate);
	}

	onDetach() {
		this.Root.removeEventListener("action-activate", this.onActivate);
		super.onDetach();
	}

	onActivate = () => {
		ContextManager.push("ai-advisor-panel", { singleton: true, createMouseGuard: true });
	};
}

Controls.define(BUTTON_TAG, {
	createInstance: AiAdvisorButton,
	description: "AI Advisor button for the sub-system dock.",
	styles: ["fs://game/base-standard/ui/sub-system-dock/panel-sub-system-dock.css"],
});

// Primary mechanism: register with the dock's official modding slot. The dock
// creates our element via ModdingRegistry.attachModElements() during its onAttach.
ModdingRegistry.add({
	parentID: DOCK_ID,
	modSlot: MOD_SLOT_ID,
	componentTag: BUTTON_TAG,
});

// Fallback: poll for the dock and inject the button directly if it isn't already
// present. Handles a different load order or the dock being rebuilt (e.g. on age
// transition). Stops once the button exists or the dock can't be found.
let tries = 0;
const injectInterval = setInterval(() => {
	tries++;
	const dock = document.getElementById(DOCK_ID) || document.querySelector(DOCK_ID);
	const slot = document.getElementById(MOD_SLOT_ID);
	const container = slot || dock?.querySelector(".sub-system-dock--button-container") || dock;
	if (container) {
		if (!container.querySelector(BUTTON_TAG)) {
			container.appendChild(document.createElement(BUTTON_TAG));
		}
		clearInterval(injectInterval);
	} else if (tries >= 60) {
		clearInterval(injectInterval);
	}
}, 500);
