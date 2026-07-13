/**
 * 按工作目录持久化输入历史，shift+up/down 跨 session 回填。
 * 存储：~/.pi/folder-history/<path-with-dashes>.jsonl
 *
 * 文件名把 `/` 换成 `-`，`/a-b` 与 `/a/b` 会撞同一文件；
 * 因此每行必须带 cwd，读写都按 cwd 过滤。
 *
 * 写入用 append（并发更安全）；超过上限时在 load 时压缩回写。
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const HISTORY_DIR = join(homedir(), ".pi", "folder-history");
export const MAX_HISTORY = 500;

interface HistoryRow {
  cwd: string;
  text: string;
}

function historyFile(cwd: string, historyDir: string): string {
  return join(historyDir, `${cwd.replace(/\//g, "-")}.jsonl`);
}

function readRows(file: string): HistoryRow[] {
  if (!existsSync(file)) return [];
  try {
    const rows: HistoryRow[] = [];
    for (const line of readFileSync(file, "utf-8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as { text?: string; cwd?: string };
        if (!entry.text || !entry.cwd) continue;
        rows.push({ cwd: entry.cwd, text: entry.text });
      } catch {
        // skip malformed lines
      }
    }
    return rows;
  } catch {
    return [];
  }
}

function uniqueTexts(texts: string[]): string[] {
  const seen = new Map<string, number>();
  texts.forEach((text, i) => seen.set(text, i));
  return [...seen.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([text]) => text);
}

function writeRows(file: string, rows: HistoryRow[]): void {
  const body =
    rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length > 0 ? "\n" : "");
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, body, "utf-8");
  renameSync(tmp, file);
}

/** 压缩：各 cwd 只保留最近 MAX_HISTORY 条唯一记录。 */
function compactFile(file: string): void {
  const rows = readRows(file);
  const byCwd = new Map<string, string[]>();
  for (const row of rows) {
    const list = byCwd.get(row.cwd) ?? [];
    list.push(row.text);
    byCwd.set(row.cwd, list);
  }

  const compacted: HistoryRow[] = [];
  for (const [cwd, texts] of byCwd) {
    for (const text of uniqueTexts(texts).slice(-MAX_HISTORY)) {
      compacted.push({ cwd, text });
    }
  }

  // 只有确实变短才回写，避免无意义 IO
  if (compacted.length < rows.length) {
    writeRows(file, compacted);
  }
}

export function loadHistory(cwd: string, historyDir = HISTORY_DIR): string[] {
  const file = historyFile(cwd, historyDir);
  const rows = readRows(file);
  const oursRaw = rows.filter((r) => r.cwd === cwd).map((r) => r.text);
  const unique = uniqueTexts(oursRaw);

  // 文件膨胀时在 load 路径压缩（session_start 触发一次即可）
  if (rows.length > MAX_HISTORY || unique.length > MAX_HISTORY) {
    compactFile(file);
  }

  return unique.slice(-MAX_HISTORY);
}

/** append 新输入；截断在下次 load/compact 时完成。 */
export function appendHistory(
  cwd: string,
  text: string,
  historyDir = HISTORY_DIR,
): void {
  mkdirSync(historyDir, { recursive: true });
  const file = historyFile(cwd, historyDir);
  appendFileSync(file, `${JSON.stringify({ cwd, text })}\n`, "utf-8");
}

export function pushUniqueHistory(history: string[], text: string): string[] {
  const next = history.filter((item) => item !== text);
  next.push(text);
  if (next.length > MAX_HISTORY) {
    return next.slice(-MAX_HISTORY);
  }
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
}
