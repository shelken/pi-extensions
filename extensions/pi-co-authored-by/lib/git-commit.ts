/**
 * 判断一条 bash 命令是否包含"直接执行的 git commit"。
 *
 * 只识别当前命令语法树中的直接命令节点，不展开：
 * - 脚本内容（bash -c / eval / ./release.sh / make / npm run）
 * - alias / 变量（g commit / $cmd commit / git alias）
 * - 外部程序参数（xargs / find -exec / parallel）
 */

const TRANSPARENT_WRAPPERS = new Set([
	"command",
	"env",
	"sudo",
	"doas",
	"nohup",
	"exec",
	"rtk",
]);

// 带一个参数的前缀：timeout 30 git commit
const WRAPPERS_WITH_ARG = new Set(["timeout"]);

function isEnvAssignment(arg: string): boolean {
	return /^[A-Za-z_][A-Za-z0-9_]*=/.test(arg);
}

function isGitCommitArgv(argv: string[]): boolean {
	let i = 0;

	// 跳过环境变量赋值与透明包装器（可交替出现，如 env FOO=bar git commit）
	while (i < argv.length) {
		const name = argv[i];
		if (isEnvAssignment(name) || TRANSPARENT_WRAPPERS.has(name)) {
			i++;
			continue;
		}
		if (WRAPPERS_WITH_ARG.has(name)) {
			i += 2;
			continue;
		}
		break;
	}

	if (i >= argv.length) return false;

	const executable = argv[i].split("/").pop() ?? argv[i];
	if (executable !== "git") return false;
	i++;

	// 跳过 git 全局选项（-C repo / -c k=v 带参数，--key=value 与 --flag 单 token）
	while (i < argv.length) {
		const arg = argv[i];
		if (arg === "-C" || arg === "-c" || arg === "--git-dir" || arg === "--work-tree") {
		i += 2;
			continue;
		}
		if (/^--[a-z0-9-]+=/.test(arg) || (arg.startsWith("-") && arg !== "--")) {
			i += 1;
			continue;
		}
		break;
	}

	return i < argv.length && argv[i] === "commit";
}

const CONTROL_KEYWORDS = new Set(["if", "then", "else", "elif", "do", "done", "fi", "(" , ")"]);

/**
 * 判断命令是否包含直接执行的 git commit。
 * 控制操作符（&& || ; | & 换行）分割成多个命令段，任一命中即 true。
 */
export function isGitCommitCommand(command: string): boolean {
	for (const segment of splitSegments(command)) {
		if (isGitCommitSegment(segment)) return true;
	}
	return false;
}

function isGitCommitSegment(segment: string): boolean {
	const argv = tokenize(segment);
	let i = 0;
	while (i < argv.length && CONTROL_KEYWORDS.has(argv[i])) i++;
	return isGitCommitArgv(argv.slice(i));
}

/** 按控制操作符切分，忽略引号内的内容。 */
export function splitSegments(command: string): string[] {
	const segments: string[] = [];
	let current = "";
	let quote: "'" | '"' | null = null;
	let escaped = false;

	for (const char of command) {
		if (escaped) {
			current += char;
			escaped = false;
			continue;
		}
		if (char === "\\") {
			current += char;
			escaped = true;
			continue;
		}
		if (quote) {
			current += char;
			if (char === quote) quote = null;
			continue;
		}
		if (char === "'" || char === '"') {
			quote = char;
			current += char;
			continue;
		}
		if (char === "&" || char === "|" || char === ";" || char === "\n") {
			if (current.trim()) segments.push(current.trim());
			current = "";
			continue;
		}
		current += char;
	}
	if (current.trim()) segments.push(current.trim());
	return segments;
}

/** 极简 shell 分词：保留引号组为整体，去掉空白。 */
export function tokenize(segment: string): string[] {
	const argv: string[] = [];
	let current = "";
	let quote: "'" | '"' | null = null;
	let escaped = false;

	const flush = () => {
		if (current) {
			argv.push(current);
			current = "";
		}
	};

	for (const char of segment) {
		if (escaped) {
			current += char;
			escaped = false;
			continue;
		}
		if (char === "\\") {
			escaped = true;
			continue;
		}
		if (quote) {
			if (char === quote) {
				quote = null;
				continue;
			}
			current += char;
			continue;
		}
		if (char === "'" || char === '"') {
			quote = char;
			continue;
		}
		if (/\s/.test(char)) {
			flush();
			continue;
		}
		current += char;
	}
	flush();
	return argv;
}
