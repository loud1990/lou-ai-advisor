import Panel from '/core/ui/panel-support.js';
import { MustGetElement } from '/core/ui/utilities/utilities-dom.js';
import content from './ai-advisor-panel.html.js';

/**
 * AI Advisor panel.
 *
 * A simple framed screen pushed by the AI Advisor dock button. For now it shows
 * a greeting plus live information pulled from the local player. This is the
 * foundation that the actual AI advisor features will be built on top of.
 */
class AiAdvisorPanel extends Panel {
	closeButton = null;
	empireContainer = null;
	yieldsContainer = null;

	onInitialize() {
		super.onInitialize();
		this.closeButton = MustGetElement("fxs-close-button", this.Root);
		this.empireContainer = MustGetElement(".ai-advisor__empire", this.Root);
		this.yieldsContainer = MustGetElement(".ai-advisor__yields", this.Root);
		this.enableOpenSound = true;
		this.enableCloseSound = true;
	}

	onAttach() {
		super.onAttach();
		this.closeButton.addEventListener("action-activate", () => {
			this.close();
		});
		this.buildEmpireInfo();
		this.buildYieldInfo();
	}

	/** Append a simple "Label: value" row to a container. */
	addRow(container, label, value) {
		const row = document.createElement("div");
		row.classList.add("flex", "justify-between", "items-center", "py-1");

		const labelEl = document.createElement("div");
		labelEl.classList.add("font-body-base", "text-accent-2");
		labelEl.textContent = label;

		const valueEl = document.createElement("div");
		valueEl.classList.add("font-body-base", "text-accent-1");
		valueEl.textContent = value;

		row.appendChild(labelEl);
		row.appendChild(valueEl);
		container.appendChild(row);
	}

	getLocalPlayer() {
		try {
			return Players.get(GameContext.localPlayerID);
		} catch (e) {
			console.error("ai-advisor-panel: failed to get local player", e);
			return null;
		}
	}

	buildEmpireInfo() {
		const player = this.getLocalPlayer();

		// Turn number is always available.
		try {
			this.addRow(this.empireContainer, "Turn", Game.turn.toString());
		} catch (e) {
			console.error("ai-advisor-panel: failed to read turn", e);
		}

		// Current age.
		try {
			const ageName = GameInfo.Ages.lookup(Game.age)?.Name;
			if (ageName) {
				this.addRow(this.empireContainer, "Age", Locale.compose(ageName));
			}
		} catch (e) {
			console.error("ai-advisor-panel: failed to read age", e);
		}

		if (!player) {
			this.addRow(this.empireContainer, "Player", "Unavailable");
			return;
		}

		try {
			if (player.leaderName) {
				this.addRow(this.empireContainer, "Leader", Locale.compose(player.leaderName));
			}
		} catch (e) {
			console.error("ai-advisor-panel: failed to read leader name", e);
		}

		try {
			if (player.civilizationFullName) {
				this.addRow(this.empireContainer, "Civilization", Locale.compose(player.civilizationFullName));
			}
		} catch (e) {
			console.error("ai-advisor-panel: failed to read civ name", e);
		}

		try {
			const cities = player.Cities?.getCities() ?? [];
			this.addRow(this.empireContainer, "Settlements", cities.length.toString());
		} catch (e) {
			console.error("ai-advisor-panel: failed to read cities", e);
		}
	}

	buildYieldInfo() {
		const player = this.getLocalPlayer();
		const stats = player?.Stats;
		if (!stats) {
			this.addRow(this.yieldsContainer, "Yields", "Unavailable");
			return;
		}

		const yields = [
			["Gold", YieldTypes.YIELD_GOLD],
			["Science", YieldTypes.YIELD_SCIENCE],
			["Culture", YieldTypes.YIELD_CULTURE],
			["Happiness", YieldTypes.YIELD_HAPPINESS],
			["Production", YieldTypes.YIELD_PRODUCTION],
			["Food", YieldTypes.YIELD_FOOD],
		];

		for (const [label, yieldType] of yields) {
			try {
				if (yieldType == undefined) {
					continue;
				}
				const net = stats.getNetYield(yieldType);
				if (net == undefined) {
					continue;
				}
				const rounded = Math.round(net * 10) / 10;
				const sign = rounded > 0 ? "+" : "";
				this.addRow(this.yieldsContainer, label, `${sign}${rounded}`);
			} catch (e) {
				console.error(`ai-advisor-panel: failed to read yield ${label}`, e);
			}
		}
	}
}

Controls.define("ai-advisor-panel", {
	createInstance: AiAdvisorPanel,
	description: "AI Advisor panel with live game information.",
	classNames: ["ai-advisor-panel", "absolute", "inset-0", "flex", "items-center", "justify-center"],
	innerHTML: [content],
});

export { AiAdvisorPanel };
