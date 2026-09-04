import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	DEFAULT_CO_AUTHOR_EMAIL,
	resolveCoAuthorEmail,
	resolveGeneratorName,
	resolveHostVersion,
} from "../src/config.ts";

let tempAgentDir: string;

beforeEach(() => {
	tempAgentDir = mkdtempSync(join(tmpdir(), "pi-co-authored-by-agent-"));
	delete process.env.PI_CO_AUTHORED_BY_EMAIL;
	delete process.env.CO_AUTHORED_BY_EMAIL;
});

afterEach(() => {
	rmSync(tempAgentDir, { recursive: true, force: true });
});

describe("resolveGeneratorName", () => {
	it("returns 'omp' when configDirName is .omp", () => {
		expect(resolveGeneratorName(".omp")).toBe("omp");
	});

	it("returns 'pi' when configDirName is .pi or undefined without throwing", () => {
		expect(resolveGeneratorName(".pi")).toBe("pi");
		expect(resolveGeneratorName(undefined)).toBe("pi");
		expect(resolveGeneratorName("")).toBe("pi");
	});
});

describe("resolveCoAuthorEmail", () => {
	function writeConfig(filename: string, email: string): void {
		writeFileSync(join(tempAgentDir, filename), `coAuthor:\n  email: ${email}\n`);
	}

	it("prioritizes PI_CO_AUTHORED_BY_EMAIL environment variable over config file", () => {
		writeConfig("config.yml", "file@example.com");
		process.env.PI_CO_AUTHORED_BY_EMAIL = "env1@example.com";
		expect(resolveCoAuthorEmail(".omp", tempAgentDir)).toBe("env1@example.com");
	});

	it("prioritizes CO_AUTHORED_BY_EMAIL environment variable over config file", () => {
		writeConfig("settings.json", "file@example.com");
		process.env.CO_AUTHORED_BY_EMAIL = "env2@example.com";
		expect(resolveCoAuthorEmail(".pi", tempAgentDir)).toBe("env2@example.com");
	});

	it("reads email from config.yml when host is omp", () => {
		writeConfig("config.yml", "agent@example.com");
		expect(resolveCoAuthorEmail(".omp", tempAgentDir)).toBe("agent@example.com");
	});

	it("reads email from settings.json when host is pi", () => {
		writeConfig("settings.json", "agent@example.com");
		expect(resolveCoAuthorEmail(".pi", tempAgentDir)).toBe("agent@example.com");
	});

	it("falls back to default email when host is unknown or config missing without throwing", () => {
		expect(resolveCoAuthorEmail("unknown-host", tempAgentDir)).toBe(DEFAULT_CO_AUTHOR_EMAIL);
		expect(resolveCoAuthorEmail(".omp", tempAgentDir)).toBe(DEFAULT_CO_AUTHOR_EMAIL);
		expect(resolveCoAuthorEmail(".pi", tempAgentDir)).toBe(DEFAULT_CO_AUTHOR_EMAIL);
	});
});

describe("resolveHostVersion", () => {
	it("extracts clean semver from command output", () => {
		expect(resolveHostVersion("omp", "0.0.0", () => "omp/18.1.3\n")).toBe("18.1.3");
		expect(resolveHostVersion("pi", "0.0.0", () => "0.84.4\n")).toBe("0.84.4");
	});

	it("falls back safely to fallbackVersion on error or unmatched output without throwing", () => {
		expect(
			resolveHostVersion("omp", "1.0.0", () => {
				throw new Error("command not found");
			}),
		).toBe("1.0.0");
		expect(resolveHostVersion("pi", "1.0.0", () => "unmatched text")).toBe("1.0.0");
	});
});
