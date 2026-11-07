// 配色沿用 pi-powerline-footer 的 catppuccin 用户主题，图标为 Nerd Font 码位
const HEX = {
	model: "#c6a0f6",
	path: "#8bd5ca",
	gitClean: "#a6da95",
	gitDirty: "#eed49f",
	thinking: "#a5adcb",
	context: "#939ab7",
	contextWarn: "#eed49f",
	contextError: "#ed8796",
	tokens: "#a5adcb",
	cost: "#cad3f5",
	staged: "#a6da95",
	unstaged: "#eed49f",
	untracked: "#939ab7",
} as const;

const RAINBOW = ["#b281d6", "#d787af", "#febc38", "#e4c00f", "#89d281", "#00afaf", "#178fb9", "#b281d6"];
const SEP_ANSI = "\x1b[38;5;244m";
const RESET = "\x1b[0m";

const ICON = {
	model: "\uEC19",
	folder: "\uF115",
	branch: "\uF126",
	context: "\uF1C0",
	cache: "\uF1C0",
	input: "\uF090",
	separator: "\uE0B1",
} as const;

type HexTone = keyof typeof HEX;
type ThemeTone = "thinkingMinimal" | "thinkingLow" | "thinkingMedium";
export type Tone = HexTone | ThemeTone | "rainbow";
export type Paint = (tone: Tone, text: string) => string;

export interface GitCounts {
	staged: number;
	unstaged: number;
	untracked: number;
}

export interface BarData {
	model?: string;
	thinking?: string;
	dir: string;
	branch?: string | null;
	git?: GitCounts;
	context?: { tokens: number | null; window: number; percent: number | null };
	cacheRead: number;
	cost: number;
}

function fgHex(hex: string): string {
	const n = Number.parseInt(hex.slice(1), 16);
	return `\x1b[38;2;${n >> 16};${(n >> 8) & 255};${n & 255}m`;
}

function rainbow(text: string): string {
	let out = "";
	let i = 0;
	for (const char of text) {
		if (char === " " || char === ":") out += char;
		else out += fgHex(RAINBOW[i++ % RAINBOW.length]) + char;
	}
	return out + RESET;
}

function isHexTone(tone: Tone): tone is HexTone {
	return tone in HEX;
}

/** 具名 hex 直接上色；rainbow 逐字渐变；其余交给 pi 主题（thinkingLow 等） */
export function createPaint(themeFg: (color: ThemeTone, text: string) => string): Paint {
	return (tone, text) => {
		if (isHexTone(tone)) return `${fgHex(HEX[tone])}${text}${RESET}`;
		if (tone === "rainbow") return rainbow(text);
		return themeFg(tone, text);
	};
}

export function formatTokens(n: number): string {
	if (n < 1_000) return String(n);
	if (n < 10_000) return `${(n / 1_000).toFixed(1)}k`;
	if (n < 1_000_000) return `${Math.round(n / 1_000)}k`;
	if (n < 10_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	return `${Math.round(n / 1_000_000)}M`;
}

export function basename(path: string): string {
	return path.replace(/\/+$/, "").split("/").pop() || path;
}

/** `git status --porcelain=v1` 逐行：?? 为未跟踪，X 列有改动为已暂存，Y 列有改动为未暂存 */
export function parseGitStatus(porcelain: string): GitCounts {
	const counts: GitCounts = { staged: 0, unstaged: 0, untracked: 0 };
	for (const line of porcelain.split("\n")) {
		if (line.length < 2) continue;
		if (line.startsWith("??")) counts.untracked++;
		else {
			if (line[0] !== " ") counts.staged++;
			if (line[1] !== " ") counts.unstaged++;
		}
	}
	return counts;
}

const THINKING_LABEL = new Map([["minimal", "min"], ["medium", "med"]]);
const THINKING_TONE = new Map<string, Tone>([
	["minimal", "thinkingMinimal"],
	["low", "thinkingLow"],
	["medium", "thinkingMedium"],
	["high", "rainbow"],
	["xhigh", "rainbow"],
	["max", "rainbow"],
]);

function thinkingSegment(level: string, paint: Paint): string {
	return paint(THINKING_TONE.get(level) ?? "thinking", `think:${THINKING_LABEL.get(level) ?? level}`);
}

function gitSegment(branch: string, git: GitCounts | undefined, paint: Paint): string {
	const dirty = !!git && git.staged + git.unstaged + git.untracked > 0;
	const parts = [paint(dirty ? "gitDirty" : "gitClean", `${ICON.branch} ${branch}`)];
	if (git?.unstaged) parts.push(paint("unstaged", `*${git.unstaged}`));
	if (git?.staged) parts.push(paint("staged", `+${git.staged}`));
	if (git?.untracked) parts.push(paint("untracked", `?${git.untracked}`));
	return parts.join(" ");
}

function contextSegment(context: NonNullable<BarData["context"]>, paint: Paint): string {
	const window = formatTokens(context.window);
	const known = context.tokens !== null && context.percent !== null;
	const text = known ? `${formatTokens(context.tokens!)}/${window} (${context.percent!.toFixed(1)}%)` : `?/${window}`;
	const tone = known && context.percent! > 90 ? "contextError" : known && context.percent! > 70 ? "contextWarn" : "context";
	return `${ICON.context} ${paint(tone, text)}`;
}

export function renderBar(data: BarData, paint: Paint): string {
	const segments: string[] = [];
	if (data.model) segments.push(paint("model", `${ICON.model} ${data.model.replace(/^Claude /, "")}`));
	if (data.thinking) segments.push(thinkingSegment(data.thinking, paint));
	segments.push(paint("path", `${ICON.folder} ${data.dir}`));
	if (data.branch) segments.push(gitSegment(data.branch, data.git, paint));
	if (data.context) segments.push(contextSegment(data.context, paint));
	if (data.cacheRead > 0) segments.push(paint("tokens", `${ICON.cache} ${ICON.input} ${formatTokens(data.cacheRead)}`));
	if (data.cost > 0) segments.push(paint("cost", `$${data.cost.toFixed(2)}`));
	const sep = ` ${SEP_ANSI}${ICON.separator}${RESET} `;
	return ` ${segments.join(sep)}${RESET}`;
}

export type PromptContent = string | { type: string; text?: string }[];

export function promptText(content: PromptContent): string {
	if (!Array.isArray(content)) return content;
	return content.map((part) => (part.type === "text" ? (part.text ?? "") : "")).join(" ");
}

export function renderLastPrompt(prompt: string, width: number, truncate: (s: string, w: number) => string): string[] {
	const compact = prompt.replace(/\s+/g, " ").trim();
	if (!compact || width < 12) return [];
	return [truncate(` ${SEP_ANSI}↳ ${compact}${RESET}`, width)];
}
