const content = `
<fxs-frame
	frame-style="f2"
	filigree-class="mt-2"
	top-border-style="b2"
	class="ai-city__frame flex flex-col"
	override-styling="pt-4 mt-4 relative flex flex-col pb-5 px-6"
	content-class="w-full flex flex-col"
>
	<fxs-close-button class="top-1 right-1"></fxs-close-button>
	<fxs-header
		title="LOC_AI_ADVISOR_CITY_PANEL_TITLE"
		class="font-title-base self-center"
	></fxs-header>

	<!-- City advisor identity + assigned focus. -->
	<div class="ai-city__head flex flex-col w-full mb-1"></div>

	<fxs-scrollable class="ai-city__scroll" handle-gamepad-pan="true">
		<div class="ai-city__body flex flex-col w-full pr-2"></div>
	</fxs-scrollable>

	<div
		class="ai-city__footer font-body-sm text-accent-3 italic text-center mt-2"
		data-l10n-id="LOC_AI_ADVISOR_CITY_FOOTER"
	></div>
</fxs-frame>
`;

export { content as default };
