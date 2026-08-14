import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface AddedDir {
  absolutePath: string;
  label: string;
  addedAt: number;
}

export interface DirContext {
  dir: string;
  agentsMd: string | null;
  claudeMd: string | null;
  skillPaths: Map<string, string>;
  skills: Map<string, string>;
}

const CONTEXT_FILES = ["AGENTS.md", "CLAUDE.md"] as const;

const SKILL_DIRS = [".pi/skills", ".agents/skills", ".claude/skills"] as const;

export function expandUserPath(input: string): string {
  if (input === "~") return os.homedir();
  if (input.startsWith("~/")) return path.join(os.homedir(), input.slice(2));
  return input;
}

export function resolveDir(input: string, cwd: string): string {
  const expanded = expandUserPath(input);
  const resolved = path.isAbsolute(expanded) ? expanded : path.resolve(cwd, expanded);
  try {
    return fs.realpathSync(resolved);
  } catch {
    return path.resolve(resolved);
  }
}

export function dirExists(dir: string): boolean {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

export function readFileSafe(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

export function cwdHash(cwd: string): string {
  return crypto.createHash("sha256").update(cwd).digest("hex").slice(0, 12);
}

export function getTempStatePath(cwd: string): string {
  return path.join(os.tmpdir(), `pi-add-dir-${cwdHash(cwd)}.json`);
}

export function writeTempState(cwd: string, dirs: AddedDir[]): void {
  try {
    fs.writeFileSync(getTempStatePath(cwd), JSON.stringify({ dirs }), "utf-8");
  } catch {
    // temp state is only a bridge for resources_discover
  }
}

export function readTempState(cwd: string): AddedDir[] {
  try {
    const content = fs.readFileSync(getTempStatePath(cwd), "utf-8");
    const data = JSON.parse(content) as { dirs?: AddedDir[] };
    return data.dirs ?? [];
  } catch {
    return [];
  }
}

export function removeTempState(cwd: string): void {
  try {
    fs.unlinkSync(getTempStatePath(cwd));
  } catch {
    // already gone
  }
}

export function scanDirContext(dir: string): DirContext {
  const ctx: DirContext = {
    dir,
    agentsMd: null,
    claudeMd: null,
    skillPaths: new Map(),
    skills: new Map(),
  };

  for (const name of CONTEXT_FILES) {
    const content = readFileSafe(path.join(dir, name));
    if (name === "AGENTS.md") ctx.agentsMd = content;
    if (name === "CLAUDE.md") ctx.claudeMd = content;
  }

  for (const name of CONTEXT_FILES) {
    const piContent = readFileSafe(path.join(dir, ".pi", name));
    if (!piContent) continue;
    if (name === "AGENTS.md") ctx.agentsMd = (ctx.agentsMd ?? "") + "\n\n" + piContent;
    if (name === "CLAUDE.md") ctx.claudeMd = (ctx.claudeMd ?? "") + "\n\n" + piContent;
  }

  for (const skillDir of SKILL_DIRS) {
    const fullSkillDir = path.join(dir, skillDir);
    if (!dirExists(fullSkillDir)) continue;
    try {
      for (const entry of fs.readdirSync(fullSkillDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const skillMdPath = path.join(fullSkillDir, entry.name, "SKILL.md");
        const skillMd = readFileSafe(skillMdPath);
        if (skillMd) {
          ctx.skillPaths.set(entry.name, skillMdPath);
          ctx.skills.set(entry.name, skillMd);
        }
      }
    } catch {
      // skip unreadable skill dirs
    }
  }

  return ctx;
}

export function collectSkillPaths(dirs: AddedDir[]): string[] {
  const skillPaths: string[] = [];
  for (const dir of dirs) {
    if (!dirExists(dir.absolutePath)) continue;
    for (const skillDir of SKILL_DIRS) {
      const fullSkillDir = path.join(dir.absolutePath, skillDir);
      if (!dirExists(fullSkillDir)) continue;
      try {
        for (const entry of fs.readdirSync(fullSkillDir, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue;
          const skillMdPath = path.join(fullSkillDir, entry.name, "SKILL.md");
          if (readFileSafe(skillMdPath) !== null) {
            skillPaths.push(skillMdPath);
          }
        }
      } catch {
        // skip unreadable skill dirs
      }
    }
  }
  return skillPaths;
}

let contextCache: { dirs: string; injection: string } | null = null;

export function invalidateContextCache(): void {
  contextCache = null;
}

export function buildContextInjection(dirs: AddedDir[]): string {
  if (dirs.length === 0) return "";

  const cacheKey = dirs
    .map((d) => d.absolutePath)
    .sort()
    .join("\0");
  if (contextCache && contextCache.dirs === cacheKey) {
    return contextCache.injection;
  }

  const sections: string[] = [];
  sections.push("\n\n## External Directories (added via pi-add-dir)");
  sections.push(
    `\nThe following ${dirs.length} external director${dirs.length === 1 ? "y is" : "ies are"} included in this session. You can read, edit, and write files in these directories using absolute paths.\n`,
  );

  for (const dir of dirs) {
    const ctx = scanDirContext(dir.absolutePath);
    sections.push(`### ${dir.label} - \`${dir.absolutePath}\``);

    if (ctx.agentsMd) {
      sections.push(`\n#### AGENTS.md (from ${dir.label})\n${ctx.agentsMd}`);
    }
    if (ctx.claudeMd) {
      sections.push(`\n#### CLAUDE.md (from ${dir.label})\n${ctx.claudeMd}`);
    }

    if (ctx.skills.size > 0) {
      sections.push(`\n#### Skills from ${dir.label} (registered as /skill:name commands):`);
      for (const [name, content] of ctx.skills) {
        const descMatch = content.match(/^---\n[\s\S]*?description:\s*>?\s*\n?\s*(.*?)(?:\n---|\n\w)/m);
        const desc = descMatch?.[1]?.trim() ?? "No description";
        sections.push(
          `- **${name}**: ${desc} - use \`/skill:${name}\` or read \`${ctx.skillPaths.get(name)}\``,
        );
      }
    }
    // 顶层目录列表会随文件创建/删除变化，放入 system prompt 会破坏 prompt cache。
  }

  const injection = sections.join("\n");
  contextCache = { dirs: cacheKey, injection };
  return injection;
}
