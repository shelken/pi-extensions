const SURROUNDING_QUOTES = /^[\s"'“”‘’「」『』《》]+|[\s"'“”‘’「」『』《》]+$/g;

/**
 * Clean a raw model reply into a title: trim, strip wrapping quotes/whitespace,
 * truncate to maxTitleLength code points (CJK-safe).
 */
export function normalizeTitle(raw: string, maxTitleLength: number): string {
	const stripped = raw.trim().replace(SURROUNDING_QUOTES, "").trim();
	const codePoints = [...stripped];
	if (codePoints.length <= maxTitleLength) return stripped;
	return codePoints.slice(0, maxTitleLength).join("");
}

/** Substitute the {maxTitleLength} placeholder in the user's custom prompt. */
export function buildTitlePrompt(customPrompt: string, maxTitleLength: number): string {
	return customPrompt.replaceAll("{maxTitleLength}", String(maxTitleLength));
}
