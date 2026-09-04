import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const DEFAULT_CO_AUTHOR_EMAIL = "noreply@pi.dev";

export function resolveGeneratorName(configDirName?: string | null): "omp" | "pi" {
	return configDirName === ".omp" ? "omp" : "pi";
}

/**
 * 从宿主 agent 目录读取配置邮箱。
 * agentDir 由宿主 API（getAgentDir()）注入，绝不自行拼接硬编码宿主路径。
 * 任何缺失或解析失败均平滑回退默认邮箱，不抛错。
 */
export function resolveCoAuthorEmail(
	configDirName: string | null | undefined,
	agentDir: string,
): string {
	const envEmail = process.env.PI_CO_AUTHORED_BY_EMAIL || process.env.CO_AUTHORED_BY_EMAIL;
	if (envEmail?.trim()) return envEmail.trim();

	const filename =
		configDirName === ".omp" ? "config.yml" : configDirName === ".pi" ? "settings.json" : null;
	if (!filename) return DEFAULT_CO_AUTHOR_EMAIL;

	try {
		const text = readFileSync(join(agentDir, filename), "utf8");
		const match = text.match(/coAuthor[\s\S]*?email["':\s]+([^\s"',}]+)/);
		return match?.[1]?.trim() || DEFAULT_CO_AUTHOR_EMAIL;
	} catch {
		return DEFAULT_CO_AUTHOR_EMAIL;
	}
}

export function resolveHostVersion(
	generatorName: "omp" | "pi",
	fallbackVersion: string,
	execFn?: (cmd: string) => string,
): string {
	try {
		const raw = execFn
			? execFn(generatorName)
			: execFileSync(generatorName, ["--version"], {
					encoding: "utf8",
					timeout: 1500,
					stdio: ["ignore", "pipe", "ignore"],
				});
		const match = raw.match(/([0-9]+\.[0-9]+(?:\.[0-9]+[^\s]*)?)/);
		return match?.[1] || fallbackVersion;
	} catch {
		return fallbackVersion;
	}
}
