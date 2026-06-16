const content = `
<fxs-frame
	frame-style="f2"
	filigree-class="mt-3"
	top-border-style="b2"
	class="flex items-center flex-col"
	override-styling="pt-5 mt-6 relative flex flex-col pb-10 px-10"
	content-class="w-full"
>
	<fxs-close-button class="top-1 right-1"></fxs-close-button>
	<fxs-header
		title="LOC_AI_ADVISOR_PANEL_TITLE"
		class="font-title-xl self-center"
	></fxs-header>
	<div
		class="ai-advisor__intro font-body-base text-accent-2 text-center max-w-128 my-4"
		data-l10n-id="LOC_AI_ADVISOR_PANEL_INTRO"
	></div>

	<fxs-header
		title="LOC_AI_ADVISOR_SECTION_EMPIRE"
		class="font-title-lg self-center mt-2"
		filigree-style="none"
	></fxs-header>
	<div class="ai-advisor__empire flex flex-col w-128 my-2"></div>

	<fxs-header
		title="LOC_AI_ADVISOR_SECTION_YIELDS"
		class="font-title-lg self-center mt-4"
		filigree-style="none"
	></fxs-header>
	<div class="ai-advisor__yields flex flex-col w-128 my-2"></div>

	<div
		class="ai-advisor__footer font-body-sm text-accent-3 italic text-center mt-6"
		data-l10n-id="LOC_AI_ADVISOR_FOOTER"
	></div>
</fxs-frame>
`;

export { content as default };
