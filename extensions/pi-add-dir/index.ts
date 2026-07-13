/**
 * pi-add-dir - 将会话外目录加入当前 pi session。
 *
 * 加载 AGENTS.md / CLAUDE.md，发现 skills，注入 system prompt，并跨重启持久化。
 * 外部 skills 通过 resources_discover 注册为 /skill:name。
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import * as childProcess from "node:child_process";
import * as path from "node:path";
import {
  type AddedDir,
  buildContextInjection,
  collectSkillPaths,
  dirExists,
  invalidateContextCache,
  readTempState,
  removeTempState,
  resolveDir,
  scanDirContext,
  writeTempState,
} from "./helpers.ts";

export default function addDirExtension(pi: ExtensionAPI): void {
  let addedDirs: AddedDir[] = [];
  let currentCwd = "";

  pi.on("resources_discover", (event, _ctx) => {
    const dirs = readTempState(event.cwd);
    if (dirs.length === 0) return;
    const skillPaths = collectSkillPaths(dirs);
    if (skillPaths.length === 0) return;
    return { skillPaths };
  });

  function reconstructState(ctx: ExtensionContext): void {
    addedDirs = [];
    currentCwd = ctx.cwd;

    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type !== "custom") continue;
      if (entry.customType === "add-dir:state") {
        addedDirs = (entry.data as { dirs: AddedDir[] })?.dirs ?? [];
      }
    }

    invalidateContextCache();
    writeTempState(currentCwd, addedDirs);
    updateWidget(ctx);
  }

  function persistState(cwd?: string): void {
    pi.appendEntry("add-dir:state", { dirs: addedDirs });
    const effectiveCwd = cwd || currentCwd;
    if (effectiveCwd) {
      writeTempState(effectiveCwd, addedDirs);
    }
  }

  function updateWidget(ctx: ExtensionContext): void {
    if (!ctx.hasUI) return;

    if (addedDirs.length === 0) {
      ctx.ui.setWidget("add-dir", undefined);
      return;
    }

    ctx.ui.setWidget("add-dir", (_tui, theme) => {
      return {
        dispose() {},
        invalidate() {},
        render(width: number): string[] {
          const prefix = theme.fg("accent", "📂");
          const count = theme.fg(
            "muted",
            ` ${addedDirs.length} external dir${addedDirs.length === 1 ? "" : "s"}`,
          );
          const sep = theme.fg("dim", " | ");
          const suffix = theme.fg("dim", "  (/dirs to manage)");
          const dirLabels = addedDirs.map((d) => theme.fg("text", d.label)).join(theme.fg("dim", ", "));
          const fullLine = ` ${prefix}${count}${sep}${dirLabels}${suffix}`;

          if (visibleWidth(fullLine) <= width) {
            return [fullLine];
          }

          const withoutLabels = ` ${prefix}${count}${sep}`;
          const available = width - visibleWidth(withoutLabels) - visibleWidth(suffix);
          if (available > 5) {
            return [`${withoutLabels}${truncateToWidth(dirLabels, available, "…")}${suffix}`];
          }
          return [truncateToWidth(` ${prefix}${count}`, width, "…")];
        },
      };
    });
  }

  function addDir(
    dirPath: string,
    cwd: string,
    ctx: ExtensionContext,
  ): { ok: boolean; message: string; hasNewSkills: boolean } {
    const absolutePath = resolveDir(dirPath, cwd);

    if (!dirExists(absolutePath)) {
      return { ok: false, message: `Directory does not exist: ${absolutePath}`, hasNewSkills: false };
    }
    if (addedDirs.some((d) => d.absolutePath === absolutePath)) {
      return { ok: false, message: `Already added: ${absolutePath}`, hasNewSkills: false };
    }
    if (absolutePath === resolveDir(cwd, cwd)) {
      return {
        ok: false,
        message: "That's the current working directory - already in scope.",
        hasNewSkills: false,
      };
    }

    const label = path.basename(absolutePath);
    addedDirs.push({ absolutePath, label, addedAt: Date.now() });
    invalidateContextCache();
    persistState(cwd);
    updateWidget(ctx);

    const dirCtx = scanDirContext(absolutePath);
    const found: string[] = [];
    if (dirCtx.agentsMd) found.push("AGENTS.md");
    if (dirCtx.claudeMd) found.push("CLAUDE.md");
    if (dirCtx.skills.size > 0) found.push(`${dirCtx.skills.size} skill(s)`);

    const hasNewSkills = dirCtx.skills.size > 0;
    const foundStr = found.length > 0 ? ` Found: ${found.join(", ")}.` : " No context files found.";
    let message = `Added ${label} (${absolutePath}).${foundStr}`;
    if (hasNewSkills) {
      message += " Reloading to register skills as /skill:name commands...";
    }
    return { ok: true, message, hasNewSkills };
  }

  function removeDir(
    absolutePath: string,
    ctx: ExtensionContext,
  ): { ok: boolean; message: string; hadSkills: boolean } {
    const idx = addedDirs.findIndex((d) => d.absolutePath === absolutePath);
    if (idx === -1) {
      return { ok: false, message: `Not found: ${absolutePath}`, hadSkills: false };
    }

    const hadSkills = scanDirContext(absolutePath).skills.size > 0;
    const removed = addedDirs.splice(idx, 1)[0];
    invalidateContextCache();
    persistState();
    updateWidget(ctx);

    let message = `Removed ${removed.label} (${removed.absolutePath}).`;
    if (hadSkills) {
      message += " Reloading to unregister skills...";
    }
    return { ok: true, message, hadSkills };
  }

  pi.on("session_start", async (_e, ctx) => reconstructState(ctx));
  pi.on("session_tree", async (_e, ctx) => reconstructState(ctx));
  pi.on("session_shutdown", async () => {
    if (currentCwd) removeTempState(currentCwd);
  });

  pi.on("before_agent_start", async (event, _ctx) => {
    if (addedDirs.length === 0) return;
    return {
      systemPrompt: event.systemPrompt + buildContextInjection(addedDirs),
    };
  });

  pi.registerCommand("add-dir", {
    description: "Add an external directory to this session",
    handler: async (args, ctx) => {
      let inputPath = args?.trim();
      if (!inputPath) {
        const prompted = await ctx.ui.input("Directory path:", "");
        if (!prompted) return;
        inputPath = prompted;
      }

      const result = addDir(inputPath, ctx.cwd, ctx);
      ctx.ui.notify(result.message, result.ok ? "info" : "error");
      if (result.ok && result.hasNewSkills) {
        await ctx.reload();
      }
    },
  });

  pi.registerCommand("remove-dir", {
    description: "Remove an external directory from this session",
    getArgumentCompletions(prefix: string) {
      if (addedDirs.length === 0) return null;
      const lower = prefix.toLowerCase();
      return addedDirs
        .filter(
          (d) =>
            d.label.toLowerCase().startsWith(lower) || d.absolutePath.toLowerCase().startsWith(lower),
        )
        .map((d) => ({ label: d.label, value: d.absolutePath, description: d.absolutePath }));
    },
    handler: async (args, ctx) => {
      if (addedDirs.length === 0) {
        ctx.ui.notify("No external directories added.", "info");
        return;
      }

      let absolutePath: string | undefined;
      if (args?.trim()) {
        const input = args.trim();
        const byLabel = addedDirs.find((d) => d.label === input);
        absolutePath = byLabel ? byLabel.absolutePath : resolveDir(input, ctx.cwd);
      } else {
        const choices = addedDirs.map((d) => `${d.label} - ${d.absolutePath}`);
        const selected = await ctx.ui.select("Remove which directory?", choices);
        if (selected === undefined) return;
        const selectedIdx = choices.indexOf(selected);
        absolutePath = selectedIdx >= 0 ? addedDirs[selectedIdx]?.absolutePath : undefined;
      }

      if (!absolutePath) return;
      const result = removeDir(absolutePath, ctx);
      ctx.ui.notify(result.message, result.ok ? "info" : "error");
      if (result.ok && result.hadSkills) {
        await ctx.reload();
      }
    },
  });

  pi.registerCommand("dirs", {
    description: "List all external directories in this session",
    handler: async (_args, ctx) => {
      if (addedDirs.length === 0) {
        ctx.ui.notify("No external directories added. Use /add-dir <path> to add one.", "info");
        return;
      }

      const lines: string[] = [`External directories (${addedDirs.length}):\n`];
      for (const dir of addedDirs) {
        const dirCtx = scanDirContext(dir.absolutePath);
        const badges: string[] = [];
        if (dirCtx.agentsMd) badges.push("AGENTS.md");
        if (dirCtx.claudeMd) badges.push("CLAUDE.md");
        if (dirCtx.skills.size > 0) badges.push(`${dirCtx.skills.size} skill(s)`);

        lines.push(`  📂 ${dir.label}`);
        lines.push(`     ${dir.absolutePath}`);
        if (badges.length > 0) lines.push(`     Found: ${badges.join(", ")}`);
        if (dirCtx.skills.size > 0) {
          lines.push(`     Skills: ${[...dirCtx.skills.keys()].map((s) => `/skill:${s}`).join(", ")}`);
        }
        lines.push("");
      }
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  pi.registerTool({
    name: "add_directory",
    label: "Add Directory",
    description:
      "Add an external directory to this session so its AGENTS.md, CLAUDE.md, and skills are loaded into context. " +
      "Use this when you need to reference or work with code in a directory outside the current working directory.",
    promptSnippet: "Add an external directory to this session (loads its AGENTS.md, skills, etc.)",
    promptGuidelines: [
      "Use add_directory when you need context from another project or directory outside cwd.",
      "The directory's AGENTS.md and CLAUDE.md are injected into the system prompt automatically.",
      "After adding, you can read/edit/write files in that directory using absolute paths.",
    ],
    parameters: Type.Object({
      path: Type.String({
        description: "Absolute or relative path to the directory to add",
      }),
      reason: Type.Optional(
        Type.String({
          description: "Why this directory is being added (shown to user)",
        }),
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const dirPath = params.path.replace(/^@/, "");
      const result = addDir(dirPath, ctx.cwd, ctx);
      if (!result.ok) throw new Error(result.message);

      const absolutePath = resolveDir(dirPath, ctx.cwd);
      const dirCtx = scanDirContext(absolutePath);
      const response: string[] = [result.message];
      if (dirCtx.agentsMd) response.push("\nAGENTS.md content has been injected into system context.");
      if (dirCtx.claudeMd) response.push("CLAUDE.md content has been injected into system context.");
      if (dirCtx.skills.size > 0) {
        response.push(`\nDiscovered skills: ${[...dirCtx.skills.keys()].join(", ")}`);
        response.push("Skills will be registered as /skill:name commands after reload.");
      }
      response.push(`\nYou can now access files at: ${absolutePath}`);

      return {
        content: [{ type: "text", text: response.join("\n") }],
        details: {
          directory: absolutePath,
          hasAgentsMd: !!dirCtx.agentsMd,
          hasClaudeMd: !!dirCtx.claudeMd,
          skillCount: dirCtx.skills.size,
          skillNames: [...dirCtx.skills.keys()],
        },
      };
    },

    renderCall(args, theme, _context) {
      const dirPath = args.path?.replace(/^@/, "") ?? "";
      let text = theme.fg("toolTitle", theme.bold("add_directory "));
      text += theme.fg("accent", dirPath);
      if (args.reason) text += theme.fg("dim", ` (${args.reason})`);
      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded }, theme, _context) {
      const details = result.details as
        | {
            directory?: string;
            hasAgentsMd?: boolean;
            hasClaudeMd?: boolean;
            skillCount?: number;
            skillNames?: string[];
          }
        | undefined;

      if (!details) {
        const content = result.content?.[0];
        const text = content && "text" in content ? content.text : "Done";
        return new Text(theme.fg("success", `✓ ${text}`), 0, 0);
      }

      const parts: string[] = [];
      parts.push(theme.fg("success", `✓ Added ${path.basename(details.directory ?? "")}`));

      const badges: string[] = [];
      if (details.hasAgentsMd) badges.push(theme.fg("accent", "AGENTS.md"));
      if (details.hasClaudeMd) badges.push(theme.fg("accent", "CLAUDE.md"));
      if (details.skillCount && details.skillCount > 0) {
        badges.push(theme.fg("warning", `${details.skillCount} skills`));
      }
      if (badges.length > 0) {
        parts.push(theme.fg("dim", " | ") + badges.join(theme.fg("dim", ", ")));
      }
      if (expanded && details.skillNames && details.skillNames.length > 0) {
        parts.push(
          "\n" +
            theme.fg("muted", "  Skills: ") +
            details.skillNames.map((s) => theme.fg("text", s)).join(", "),
        );
      }
      return new Text(parts.join(""), 0, 0);
    },
  });

  pi.registerTool({
    name: "search_external_files",
    label: "Search External Files",
    description:
      "Search for files across all external directories added to this session. " +
      "Use this when you need to find files in external directories, since the @ file picker " +
      "only searches the current working directory.",
    promptSnippet: "Search for files across all added external directories by name pattern",
    promptGuidelines: [
      "Use search_external_files when you need to find a file in an external directory but don't know its exact path.",
      "Supports glob-style patterns like '*.ts', '**/*.test.js', 'src/**/*.rb'.",
      "Returns matching file paths with their parent directory labels.",
    ],
    parameters: Type.Object({
      pattern: Type.String({
        description: "File name or glob pattern to search for (e.g., '*.ts', 'config/**', 'README.md')",
      }),
      maxResults: Type.Optional(
        Type.Number({
          description: "Maximum number of results to return (default: 50)",
        }),
      ),
    }),

    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      if (addedDirs.length === 0) {
        throw new Error("No external directories added. Use /add-dir or add_directory first.");
      }

      const maxResults = params.maxResults ?? 50;
      const pattern = params.pattern.replace(/^@/, "");
      const results: { dir: string; label: string; files: string[] }[] = [];
      let totalFound = 0;

      for (const dir of addedDirs) {
        if (signal?.aborted) break;
        if (!dirExists(dir.absolutePath)) continue;

        const remaining = maxResults - totalFound;
        if (remaining <= 0) break;

        const hasSlash = pattern.includes("/");
        const findFlag = hasSlash ? "-path" : "-name";
        const findArgs = [
          dir.absolutePath,
          "-not",
          "-path",
          "*/node_modules/*",
          "-not",
          "-path",
          "*/.git/*",
          findFlag,
          pattern,
          "-type",
          "f",
        ];
        const result = childProcess.spawnSync("find", findArgs, {
          encoding: "utf-8",
          timeout: 10_000,
        });
        const output = (result.stdout ?? "").trim();
        const files = (output ? output.split("\n").filter(Boolean) : []).slice(0, remaining);
        if (files.length > 0) {
          results.push({ dir: dir.absolutePath, label: dir.label, files });
          totalFound += files.length;
        }
      }

      if (totalFound === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No files matching "${pattern}" found in ${addedDirs.length} external director${addedDirs.length === 1 ? "y" : "ies"}.`,
            },
          ],
          details: { totalFound: 0, pattern },
        };
      }

      const lines: string[] = [`Found ${totalFound} file(s) matching "${pattern}":\n`];
      for (const r of results) {
        lines.push(`📂 ${r.label} (${r.dir}):`);
        for (const f of r.files) lines.push(`  ${f}`);
        lines.push("");
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: { totalFound, pattern, dirCount: results.length },
      };
    },

    renderCall(args, theme, _context) {
      const pattern = args.pattern?.replace(/^@/, "") ?? "";
      let text = theme.fg("toolTitle", theme.bold("search_external_files "));
      text += theme.fg("accent", `"${pattern}"`);
      text += theme.fg("dim", ` across ${addedDirs.length} dir(s)`);
      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded }, theme, _context) {
      const details = result.details as
        | { totalFound?: number; pattern?: string; dirCount?: number }
        | undefined;

      if (!details || !details.totalFound) {
        const content = result.content?.[0];
        const text = content && "text" in content ? content.text : "No results";
        return new Text(theme.fg("muted", text), 0, 0);
      }

      let text = theme.fg("success", `✓ ${details.totalFound} file(s)`);
      text += theme.fg("dim", ` matching "${details.pattern}" in ${details.dirCount} dir(s)`);
      if (expanded) {
        const content = result.content?.[0];
        if (content && "text" in content) {
          text += "\n" + theme.fg("muted", content.text);
        }
      }
      return new Text(text, 0, 0);
    },
  });
}
