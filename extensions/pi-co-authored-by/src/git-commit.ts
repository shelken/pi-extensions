/**
 * 判断一条 bash 命令是否包含"直接执行的 git commit"。
 *
 * 只识别当前命令语法树中的直接命令节点，不展开：
 * - 脚本内容（bash -c / eval / ./release.sh / make / npm run）
 * - alias / 变量（g commit / $cmd commit / git alias）
 * - 外部程序参数（xargs / find -exec / parallel）
 *
 * 注释按 shell 语法跳过（词首 # 到行尾），花括号块、子 shell、$( ) 内的直接命令节点照常识别。
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

	// 跳过环境变量赋值、透明包装器与裸分组括号（可交替出现，如 env FOO=bar git commit、x=$(git commit)）
	while (i < argv.length) {
		const name = argv[i];
		if (isEnvAssignment(name) || TRANSPARENT_WRAPPERS.has(name) || name === "(" || name === ")") {
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

const CONTROL_KEYWORDS = new Set([
	"if",
	"then",
	"else",
	"elif",
	"while",
	"until",
	"do",
	"done",
	"fi",
	"!",
	"(",
	")",
	"{",
	"}",
]);

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

/** 按控制操作符切分，忽略引号内的内容与注释。 */
export function splitSegments(command: string): string[] {
	const segments: string[] = [];
	let current = "";
	let quote: "'" | '"' | null = null;
	let escaped = false;
	let comment = false;
	// 上一个字符是否由转义引入（转义空白保持同一个词，# 不因此开注释）
	let literal = false;
	// ${...} 嵌套深度：其中 # 是参数展开运算符，括号也不是词边界
	let expansion = 0;

	for (const char of command) {
		// 注释到行尾；注释内的引号与反斜杠都是普通字符
		if (comment) {
			if (char !== "\n") continue;
			comment = false;
			if (current.trim()) segments.push(current.trim());
			current = "";
			literal = false;
			continue;
		}
		if (escaped) {
			current += char;
			escaped = false;
			literal = true;
			continue;
		}
		if (char === "\\") {
			current += char;
			escaped = true;
			literal = false;
			continue;
		}
		if (quote) {
			current += char;
			if (char === quote) quote = null;
			literal = false;
			continue;
		}
		if (char === "'" || char === '"') {
			quote = char;
			current += char;
			literal = false;
			continue;
		}
		// 控制操作符开始新段：段内状态（转义词边界、未闭合的 ${...} 深度）随之重置
		if (char === "&" || char === "|" || char === ";" || char === "\n") {
			if (current.trim()) segments.push(current.trim());
			current = "";
			literal = false;
			expansion = 0;
			continue;
		}
		if (expansion > 0) {
			// ${...} 内只有嵌套的 ${ 增加深度，普通的 { 是模式里的字面字符
			if (char === "{" && !literal && current.endsWith("$")) expansion++;
			else if (char === "}") expansion--;
		} else if (char === "{" && !literal && current.endsWith("$")) {
			expansion = 1;
		} else if (
			// 词首的 # 开始注释：词首指段首、空白或括号之后（${#x}、x#y、foo\ #bar 中的 # 是普通字符）
			char === "#" &&
			!literal &&
			(current === "" || /[\s()]/.test(current[current.length - 1]))
		) {
			comment = true;
			continue;
		}
		current += char;
		literal = false;
	}
	if (current.trim()) segments.push(current.trim());
	return segments;
}

/** 极简 shell 分词：保留引号组为整体，去掉空白；裸括号各自成词（(git commit) / $(git commit)）。 */
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
		if (char === "(" || char === ")") {
			// $ 与 ( 同属一个词时是命令替换（$(git commit)），丢掉 $ 让 ( 成为独立词
			if (current.endsWith("$")) current = current.slice(0, -1);
			flush();
			argv.push(char);
			continue;
		}
		current += char;
	}
	flush();
	return argv;
}
