const content = `
<fxs-frame
	frame-style="f2"
	filigree-class="mt-2"
	top-border-style="b2"
	class="ai-advisor__frame flex flex-col"
	override-styling="pt-4 mt-4 relative flex flex-col pb-6 px-8"
	content-class="w-full flex flex-col"
>
	<fxs-close-button class="top-1 right-1"></fxs-close-button>
	<fxs-header
		title="LOC_AI_ADVISOR_PANEL_TITLE"
		class="font-title-lg self-center"
	></fxs-header>

	<!-- Tab bar: switches between the Council and Empire views. -->
	<fxs-tab-bar
		class="ai-advisor__tabs self-center mt-1 mb-2 w-128"
		tab-style="flat"
	></fxs-tab-bar>

	<!-- ===================== COUNCIL TAB ===================== -->
	<div class="ai-advisor__tab ai-advisor__tab-council flex flex-col w-128">
		<div
			class="ai-advisor__intro font-body-sm text-accent-2 text-center max-w-128 mb-2"
			data-l10n-id="LOC_AI_ADVISOR_PANEL_INTRO"
		></div>

		<fxs-scrollable class="ai-advisor__scroll" handle-gamepad-pan="true">
			<!-- Deliberation indicator (shown first, then replaced by advice). -->
			<div class="ai-advisor__thinking flex flex-col items-center justify-center w-full my-6">
				<div class="ai-advisor__spinner"></div>
				<div class="ai-advisor__thinking-text font-body-base text-accent-3 italic mt-3"></div>
			</div>

			<!-- Advisor advice cards (filled in after deliberation). -->
			<div class="ai-advisor__council flex flex-col w-full pr-2"></div>
		</fxs-scrollable>
	</div>

	<!-- ===================== TRIUMPHS TAB ===================== -->
	<div class="ai-advisor__tab ai-advisor__tab-triumphs flex flex-col w-128" style="display:none">
		<div
			class="ai-advisor__intro font-body-sm text-accent-2 text-center max-w-128 mb-2"
			data-l10n-id="LOC_AI_ADVISOR_TRIUMPHS_INTRO"
		></div>
		<fxs-scrollable class="ai-advisor__scroll" handle-gamepad-pan="true">
			<div class="ai-advisor__triumphs flex flex-col w-full pr-2"></div>
		</fxs-scrollable>
	</div>

	<!-- ===================== EMPIRE TAB ===================== -->
	<div class="ai-advisor__tab ai-advisor__tab-empire flex flex-col w-128" style="display:none">
		<fxs-scrollable class="ai-advisor__scroll" handle-gamepad-pan="true">
			<div class="ai-advisor__empire-wrap flex flex-col w-full pr-2">
				<fxs-header
					title="LOC_AI_ADVISOR_SECTION_EMPIRE"
					class="font-title-base self-center"
					filigree-style="none"
				></fxs-header>
				<div class="ai-advisor__empire flex flex-col w-full mb-3"></div>

				<fxs-header
					title="LOC_AI_ADVISOR_SECTION_YIELDS"
					class="font-title-base self-center mt-2"
					filigree-style="none"
				></fxs-header>
				<div class="ai-advisor__yields flex flex-col w-full"></div>
			</div>
		</fxs-scrollable>
	</div>

	<div
		class="ai-advisor__footer font-body-sm text-accent-3 italic text-center mt-3"
		data-l10n-id="LOC_AI_ADVISOR_FOOTER"
	></div>
</fxs-frame>
`;

export { content as default };
