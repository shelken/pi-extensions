/**
 * 按工作目录持久化输入历史，shift+up/down 跨 session 回填。
 * 存储：~/.pi/folder-history/<path-with-dashes>.jsonl
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const HISTORY_DIR = join(homedir(), ".pi", "folder-history");
export const MAX_HISTORY = 500;

export function getHistoryFile(cwd: string): string {
  const name = cwd.replace(/\//g, "-");
  return join(HISTORY_DIR, `${name}.jsonl`);
}

export function loadHistory(cwd: string, historyDir = HISTORY_DIR): string[] {
  const file = join(historyDir, `${cwd.replace(/\//g, "-")}.jsonl`);
  if (!existsSync(file)) return [];

  try {
    const lines = readFileSync(file, "utf-8")
      .split("\n")
      .filter((l) => l.trim());

    const entries: string[] = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as { text?: string; cwd?: string };
        if (entry.text && entry.cwd === cwd) {
          entries.push(entry.text);
        }
      } catch {
        // skip malformed lines
      }
    }

    const seen = new Map<string, number>();
    entries.forEach((text, i) => seen.set(text, i));
    const unique = [...seen.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([text]) => text);

    return unique.slice(-MAX_HISTORY);
  } catch {
    return [];
  }
}

export function appendHistory(
  cwd: string,
  text: string,
  historyDir = HISTORY_DIR,
): void {
  mkdirSync(historyDir, { recursive: true });
  const file = join(historyDir, `${cwd.replace(/\//g, "-")}.jsonl`);
  const entry = JSON.stringify({ cwd, text, ts: Date.now() });
  appendFileSync(file, entry + "\n", "utf-8");
}

export function pushUniqueHistory(history: string[], text: string): string[] {
  const next = history.filter((item) => item !== text);
  next.push(text);
  if (next.length > MAX_HISTORY) next.shift();
  return next;
}

export default function commandHistoryExtension(pi: ExtensionAPI): void {
  let history: string[] = [];
  let historyIndex = -1;
  let savedEditorText = "";
  let currentCwd = "";

  const showPreviousCommand = (ctx: ExtensionContext) => {
    if (history.length === 0) return;

    if (historyIndex === -1) {
      savedEditorText = ctx.ui.getEditorText();
    }

    const nextIndex = historyIndex + 1;
    if (nextIndex >= history.length) return;

    historyIndex = nextIndex;
    ctx.ui.setEditorText(history[history.length - 1 - historyIndex]);
  };

  const showNextCommand = (ctx: ExtensionContext) => {
    if (historyIndex <= -1) return;

    historyIndex--;

    if (historyIndex === -1) {
      ctx.ui.setEditorText(savedEditorText);
    } else {
      ctx.ui.setEditorText(history[history.length - 1 - historyIndex]);
    }
  };

  pi.on("session_start", (_event, ctx) => {
    currentCwd = ctx.cwd;
    history = loadHistory(currentCwd);
    historyIndex = -1;
    savedEditorText = "";

    ctx.ui.setStatus(
      "folder-history",
      history.length > 0 ? `📜 ${history.length} cmds (shift+↑/↓)` : undefined,
    );
  });

  pi.on("input", (event, _ctx) => {
    const text = event.text?.trim();
    if (!text || !currentCwd) return;

    appendHistory(currentCwd, text);
    history = pushUniqueHistory(history, text);
    historyIndex = -1;
    savedEditorText = "";

    return { action: "continue" as const };
  });

  pi.registerShortcut("shift+up", {
    description: "Previous command from folder history",
    handler: showPreviousCommand,
  });

  pi.registerShortcut("shift+down", {
    description: "Next command from folder history",
    handler: showNextCommand,
  });

  // 兼容旧键位
  pi.registerShortcut("ctrl+up", {
    description: "Previous command from folder history (legacy alias)",
    handler: showPreviousCommand,
  });

  pi.registerShortcut("ctrl+down", {
    description: "Next command from folder history (legacy alias)",
    handler: showNextCommand,
  });
}
