const SURROUNDING_QUOTES = /^[\s"'“”‘’「」『』《》]+|[\s"'“”‘’「」『』《》]+$/g;

export const TITLE_SUBCOMMANDS = ["fresh", "history", "config"] as const;
export type TitleSubcommand = (typeof TITLE_SUBCOMMANDS)[number];

export function parseTitleSubcommand(args: string): TitleSubcommand | undefined {
	const value = args.trim().toLowerCase();
	return TITLE_SUBCOMMANDS.find((command) => command === value);
}

/**
 * Clean a raw model reply into a title: trim, strip wrapping quotes/whitespace.
 * Length is left to the prompt — no truncation here.
 */
export function normalizeTitle(raw: string): string {
	return raw.trim().replace(SURROUNDING_QUOTES, "").trim();
}

/** Substitute the {maxTitleLength} placeholder in the user's custom prompt. */
export function buildTitlePrompt(customPrompt: string, maxTitleLength: number): string {
	return customPrompt.replaceAll("{maxTitleLength}", String(maxTitleLength));
}
