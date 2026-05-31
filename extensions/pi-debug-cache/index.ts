import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

interface Config {
  enabled: boolean;
}

interface PromptRecord {
  sequence: number;
  event: "agent_end";
  timestamp: string;
  hash: string;
  changed: boolean;
  promptPath: string;
  diffPath: string | null;
}

interface SessionIndex {
  sessionId: string;
  cwd: string | null;
  sessionName: string | null;
  createdAt: string;
  updatedAt: string;
  latestPromptHash: string;
  records: PromptRecord[];
}

interface UsageTotals {
  assistantMessages: number;
  provider: string | null;
  model: string | null;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
}

const DEBUG_DIR = join(homedir(), ".pi", "agent", "debug-cache");
const SESSIONS_DIR = join(DEBUG_DIR, "sessions");
const LATEST_PATH = join(DEBUG_DIR, "latest.json");

function loadConfig(cwd: string): Config {
  const paths = [
    join(homedir(), ".pi", "agent", "debug-cache.json"),
    join(cwd, ".pi", "debug-cache.json"),
  ];
  const config: Config = { enabled: false };

  for (const path of paths) {
    if (!existsSync(path)) continue;
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    if (typeof parsed.enabled === "boolean") config.enabled = parsed.enabled;
  }

  return config;
}

function sanitize(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function sha256(content: string): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function shortHash(hash: string): string {
  return hash.replace(/^sha256:/, "").slice(0, 12);
}

function padSequence(sequence: number): string {
  return String(sequence).padStart(4, "0");
}

function sessionDir(sessionId: string): string {
  return join(SESSIONS_DIR, sanitize(sessionId));
}

function relativeToSession(path: string, dir: string): string {
  return path.slice(dir.length + 1);
}

function readIndex(dir: string): SessionIndex | undefined {
  const path = join(dir, "index.json");
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf-8")) as SessionIndex;
}

function writeIndex(dir: string, index: SessionIndex): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "index.json"),
    JSON.stringify(index, null, 2),
    "utf-8",
  );
}

function appendJsonLine(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value)}\n`, {
    encoding: "utf-8",
    flag: "a",
  });
}

function splitLines(content: string): string[] {
  if (content.length === 0) return [];
  return content.endsWith("\n")
    ? content.slice(0, -1).split("\n")
    : content.split("\n");
}

function createDiff(
  previous: string,
  current: string,
  previousHash: string,
  currentHash: string,
): string {
  const oldLines = splitLines(previous);
  const newLines = splitLines(current);
  let prefix = 0;
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  ) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] ===
      newLines[newLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const removed = oldLines.slice(prefix, oldLines.length - suffix);
  const added = newLines.slice(prefix, newLines.length - suffix);
  const contextBefore = oldLines.slice(Math.max(0, prefix - 3), prefix);
  const contextAfter = oldLines.slice(
    oldLines.length - suffix,
    Math.min(oldLines.length, oldLines.length - suffix + 3),
  );
  const oldStart = Math.max(1, prefix - contextBefore.length + 1);
  const oldCount = contextBefore.length + removed.length + contextAfter.length;
  const newCount = contextBefore.length + added.length + contextAfter.length;

  const lines = [
    `--- previous ${previousHash}`,
    `+++ current ${currentHash}`,
    `@@ -${oldStart},${oldCount} +${oldStart},${newCount} @@`,
    ...contextBefore.map((line) => ` ${line}`),
    ...removed.map((line) => `-${line}`),
    ...added.map((line) => `+${line}`),
    ...contextAfter.map((line) => ` ${line}`),
    "",
  ];

  return lines.join("\n");
}

function computeCacheHitPercent(
  input: number,
  cacheRead: number,
  cacheWrite: number,
): number {
  const denominator = input + cacheRead + cacheWrite;
  if (denominator <= 0) return 0;
  return (cacheRead / denominator) * 100;
}

function collectUsage(messages: any[]): UsageTotals {
  const totals: UsageTotals = {
    assistantMessages: 0,
    provider: null,
    model: null,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
  };

  for (const message of messages) {
    if (message?.role !== "assistant" || !message.usage) continue;
    totals.assistantMessages += 1;
    if (totals.provider === null && typeof message.provider === "string")
      totals.provider = message.provider;
    if (totals.model === null && typeof message.model === "string")
      totals.model = message.model;
    totals.input += message.usage.input ?? 0;
    totals.output += message.usage.output ?? 0;
    totals.cacheRead += message.usage.cacheRead ?? 0;
    totals.cacheWrite += message.usage.cacheWrite ?? 0;
    totals.totalTokens += message.usage.totalTokens ?? 0;
  }

  return totals;
}

function getSessionId(ctx: any): string | undefined {
  const id = ctx.sessionManager?.getSessionId?.();
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

function getSessionName(ctx: any): string | null {
  const name = ctx.sessionManager?.getSessionName?.();
  return typeof name === "string" && name.length > 0 ? name : null;
}

function getCwd(ctx: any): string | null {
  const cwd = ctx.sessionManager?.getCwd?.() ?? ctx.cwd;
  return typeof cwd === "string" && cwd.length > 0 ? cwd : null;
}

function writeLatest(
  sessionId: string,
  dir: string,
  index: SessionIndex,
): void {
  mkdirSync(DEBUG_DIR, { recursive: true });
  writeFileSync(
    LATEST_PATH,
    JSON.stringify(
      {
        sessionId,
        dir,
        latestPromptHash: index.latestPromptHash,
        updatedAt: index.updatedAt,
      },
      null,
      2,
    ),
    "utf-8",
  );
}

function nextSequence(existing: SessionIndex | undefined): number {
  if (!existing || existing.records.length === 0) return 0;
  return existing.records.length;
}

function recordPrompt(ctx: any): PromptRecord | undefined {
  const sessionId = getSessionId(ctx);
  if (!sessionId) return undefined;

  const dir = sessionDir(sessionId);
  const promptDir = join(dir, "prompts");
  const diffDir = join(dir, "diffs");
  mkdirSync(promptDir, { recursive: true });
  mkdirSync(diffDir, { recursive: true });

  const prompt = ctx.getSystemPrompt();
  const hash = sha256(prompt);
  const now = new Date().toISOString();
  const existing = readIndex(dir);
  // 变更原因：扩展 reload 会重置内存计数，必须从持久化记录推导序号，避免覆盖 diff/prompt 文件。
  const sequence = nextSequence(existing);
  const previous = existing?.records.at(-1);
  const changed = !previous || previous.hash !== hash;

  let promptPath = previous?.promptPath ?? "";
  let diffPath: string | null = null;

  if (changed) {
    const promptFile = join(
      promptDir,
      `${padSequence(sequence)}-agent_end-${shortHash(hash)}.txt`,
    );
    writeFileSync(promptFile, prompt, "utf-8");
    promptPath = relativeToSession(promptFile, dir);

    if (previous) {
      const previousFullPath = join(dir, previous.promptPath);
      const previousPrompt = readFileSync(previousFullPath, "utf-8");
      const diffFile = join(
        diffDir,
        `${padSequence(sequence)}-agent_end.diff`,
      );
      writeFileSync(
        diffFile,
        createDiff(previousPrompt, prompt, previous.hash, hash),
        "utf-8",
      );
      diffPath = relativeToSession(diffFile, dir);
    }
  }

  const record: PromptRecord = {
    sequence,
    event: "agent_end",
    timestamp: now,
    hash,
    changed,
    promptPath,
    diffPath,
  };
  const index: SessionIndex = existing ?? {
    sessionId,
    cwd: getCwd(ctx),
    sessionName: getSessionName(ctx),
    createdAt: now,
    updatedAt: now,
    latestPromptHash: hash,
    records: [],
  };

  index.cwd = getCwd(ctx);
  index.sessionName = getSessionName(ctx);
  index.updatedAt = now;
  index.latestPromptHash = hash;
  index.records.push(record);
  writeIndex(dir, index);
  writeLatest(sessionId, dir, index);
  return record;
}

export default function piDebugCache(pi: ExtensionAPI) {
  let config: Config | undefined;
  let latestRecord: PromptRecord | undefined;
  let latestCacheHitPercent: number | undefined;
  let currentSessionId: string | undefined;

  pi.on("session_start", (_event, ctx) => {
    config = loadConfig(ctx.cwd);
    if (!config.enabled) return;

    currentSessionId = getSessionId(ctx);
    latestRecord = undefined;
    latestCacheHitPercent = undefined;
  });

  pi.on("agent_end", (event, ctx) => {
    if (config?.enabled !== true) return;

    const record = recordPrompt(ctx);
    if (!record) return;
    latestRecord = record;

    const sessionId = getSessionId(ctx);
    if (!sessionId) return;

    const usage = collectUsage(event.messages ?? []);
    const cacheHitPercent = computeCacheHitPercent(
      usage.input,
      usage.cacheRead,
      usage.cacheWrite,
    );
    latestCacheHitPercent = cacheHitPercent;

    const dir = sessionDir(sessionId);
    mkdirSync(dir, { recursive: true });
    appendJsonLine(join(dir, "turns.jsonl"), {
      sequence: record.sequence,
      timestamp: new Date().toISOString(),
      event: "agent_end",
      systemPromptHash: record.hash,
      systemPromptChanged: record.changed,
      promptPath: record.promptPath,
      diffPath: record.diffPath,
      assistantMessages: usage.assistantMessages,
      provider: usage.provider,
      model: usage.model,
      input: usage.input,
      output: usage.output,
      cacheRead: usage.cacheRead,
      cacheWrite: usage.cacheWrite,
      totalTokens: usage.totalTokens,
      cacheHitPercent,
    });
  });

  pi.registerCommand("debug-cache", {
    description: "Inspect pi-debug-cache records: status | latest | path",
    getArgumentCompletions(prefix) {
      return ["status", "latest", "path"]
        .filter((value) => value.startsWith(prefix.trim().toLowerCase()))
        .map((value) => ({ value, label: value }));
    },
    handler: async (args, ctx) => {
      const command = args.trim().toLowerCase() || "status";
      const sessionId = getSessionId(ctx) ?? currentSessionId;
      if (!sessionId) {
        ctx.ui.notify("pi-debug-cache: no active session id", "error");
        return;
      }

      const dir = sessionDir(sessionId);
      const index = readIndex(dir);
      if (command === "path") {
        ctx.ui.notify(dir, "info");
        return;
      }

      if (!index) {
        ctx.ui.notify(`pi-debug-cache: no records yet\n${dir}`, "info");
        return;
      }

      if (command === "latest") {
        const latestChanged = [...index.records]
          .reverse()
          .find((record) => record.changed);
        if (!latestChanged) {
          ctx.ui.notify("pi-debug-cache: no prompt changes recorded", "info");
          return;
        }
        ctx.ui.notify(
          [
            `hash: ${latestChanged.hash}`,
            `prompt: ${join(dir, latestChanged.promptPath)}`,
            `diff: ${latestChanged.diffPath ? join(dir, latestChanged.diffPath) : "(initial snapshot)"}`,
          ].join("\n"),
          "info",
        );
        return;
      }

      if (command !== "status") {
        ctx.ui.notify("Usage: /debug-cache status | latest | path", "info");
        return;
      }

      const changes = index.records.filter((record) => record.changed).length;
      const hit =
        latestCacheHitPercent === undefined
          ? "n/a"
          : `${latestCacheHitPercent.toFixed(2)}%`;
      ctx.ui.notify(
        [
          `dir: ${dir}`,
          `latest hash: ${index.latestPromptHash}`,
          `prompt snapshots: ${changes}`,
          `records: ${index.records.length}`,
          `latest cache hit: ${hit}`,
        ].join("\n"),
        "info",
      );
    },
  });
}
