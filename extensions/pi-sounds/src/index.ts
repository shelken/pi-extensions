import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

declare const Bun:
  | {
      file(path: string): { text(): Promise<string> };
      YAML?: { parse(text: string): unknown };
    }
  | undefined;

export interface NormalizedSound {
  path: string;
  volume?: number;
}

export interface Context {
  hasUI?: boolean;
  ui: { notify(message: string, type: "info" | "warning" | "error"): void };
}

export interface ExtensionAPI {
  on(event: string, handler: (event: unknown, ctx: Context) => Promise<void> | void): void;
  exec(
    command: string,
    args: string[],
    options: { timeout: number }
  ): Promise<{ code: number; stdout?: string; stderr?: string; killed?: boolean }>;
  registerCommand(name: string, command: {
    description: string;
    handler(args: string, ctx: Context): Promise<void>;
  }): void;
  getSettings?(): Record<string, unknown>;
}

// IOKit kIOPMSystemCapabilityAudio
const IOPM_SYSTEM_CAPABILITY_AUDIO = 0x04;

function parseSystemCapabilities(ioregOutput: string): number | undefined {
  const match = /^\s*"System Capabilities"\s*=\s*(\d+)/m.exec(ioregOutput);
  if (!match) return undefined;
  const value = Number.parseInt(match[1], 10);
  return Number.isNaN(value) ? undefined : value;
}

function isSshSession(): boolean {
  return Boolean(process.env.SSH_CONNECTION || process.env.SSH_TTY || process.env.SSH_CLIENT);
}

function ringTerminalBell(): void {
  if (process.stdout.isTTY) {
    process.stdout.write("\x07");
  }
}

function expandHome(inputPath: string): string {
  if (inputPath === "~") return homedir();
  if (inputPath.startsWith("~/")) return resolve(homedir(), inputPath.slice(2));
  return inputPath;
}

function getAgentConfigDir(isPiHost: boolean): string {
  const envDir = isPiHost ? process.env.PI_CODING_AGENT_DIR : process.env.OMP_AGENT_DIR;
  if (envDir && envDir.trim().length > 0) {
    return expandHome(envDir.trim());
  }
  return resolve(homedir(), isPiHost ? ".pi/agent" : ".omp/agent");
}

function safeNotify(ctx: Context, message: string, type: "info" | "warning" | "error"): void {
  try {
    ctx.ui.notify(message, type);
  } catch {
    // 宿主在会话退出/替换/重载后会使旧 ctx 失效，异步回调此时静默忽略通知
  }
}

export default function sounds(pi: ExtensionAPI): void {
  if (process.env.OMPCODE === "1") return;

  const isPiHost = typeof pi.getSettings === "function";
  const defaultSoundPath = fileURLToPath(new URL("../sounds/done.mp3", import.meta.url));

  let activeSound: NormalizedSound | false = { path: defaultSoundPath };
  let configSource = "默认内置 (done.mp3)";

  async function resolveSoundConfig(fromDisk = false): Promise<{ source: string; raw: unknown }> {
    if (isPiHost && !fromDisk) {
      try {
        const settings = pi.getSettings?.();
        if (typeof settings === "object" && settings !== null) {
          if ("sounds" in settings && typeof settings.sounds === "object" && settings.sounds !== null && "agent_end" in settings.sounds) {
            return { source: "pi:settings.json (宿主内存)", raw: settings.sounds.agent_end };
          }
          return { source: "默认内置 (done.mp3)", raw: undefined };
        }
      } catch {
        // 降级走磁盘读取
      }
    }

    try {
      const dir = getAgentConfigDir(isPiHost);
      const configFileName = isPiHost ? "settings.json" : "config.yml";
      const configPath = join(dir, configFileName);

      const text = typeof Bun !== "undefined"
        ? await Bun.file(configPath).text()
        : await readFile(configPath, "utf8");

      const parsed: unknown = !isPiHost && typeof Bun !== "undefined" && Bun.YAML
        ? Bun.YAML.parse(text)
        : JSON.parse(text);

      if (typeof parsed === "object" && parsed !== null && "sounds" in parsed) {
        const soundsObj = parsed.sounds;
        if (typeof soundsObj === "object" && soundsObj !== null && "agent_end" in soundsObj) {
          return { source: `${configPath} (磁盘实时)`, raw: soundsObj.agent_end };
        }
      }

      return {
        source: "默认内置 (done.mp3)",
        raw: undefined,
      };
    } catch {
      return { source: "默认内置 (done.mp3)", raw: undefined };
    }
  }

  async function reload(fromDisk = false): Promise<void> {
    const { source, raw } = await resolveSoundConfig(fromDisk);
    configSource = source;

    if (raw === false) {
      activeSound = false;
      return;
    }

    if (raw === undefined || raw === null) {
      activeSound = { path: defaultSoundPath };
      return;
    }

    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (trimmed.length === 0) {
        throw new Error("agent_end 路径不能为空");
      }
      activeSound = { path: trimmed };
      return;
    }

    if (typeof raw === "object" && raw !== null && "path" in raw && typeof raw.path === "string") {
      const trimmed = raw.path.trim();
      if (trimmed.length === 0) {
        throw new Error("agent_end 路径不能为空");
      }

      let volume: number | undefined;
      if ("volume" in raw && raw.volume !== undefined) {
        if (typeof raw.volume !== "number" || !Number.isFinite(raw.volume) || raw.volume < 0 || raw.volume > 1) {
          throw new Error("volume 必须是 0 到 1 之间的数字");
        }
        volume = raw.volume;
      }

      activeSound = { path: trimmed, volume };
      return;
    }

    throw new Error("agent_end 必须是音频路径、{ path, volume? } 或 false");
  }

  async function hasMacOSAudioCapability(): Promise<boolean> {
    try {
      const result = await pi.exec("/usr/sbin/ioreg", ["-r", "-c", "IOPMrootDomain", "-d", "1"], { timeout: 1000 });
      if (result.code !== 0 || !result.stdout) return true;
      const caps = parseSystemCapabilities(result.stdout);
      if (caps === undefined) return true;
      return (caps & IOPM_SYSTEM_CAPABILITY_AUDIO) !== 0;
    } catch {
      return true;
    }
  }

  async function play(ctx: Context, options?: { interactive?: boolean }): Promise<void> {
    if (activeSound === false) return;

    if (process.platform !== "darwin") {
      if (options?.interactive) {
        safeNotify(ctx, "提示音目前仅支持 macOS afplay", "error");
      }
      return;
    }

    if (isSshSession()) {
      ringTerminalBell();
      if (options?.interactive) {
        safeNotify(ctx, "当前为 SSH 会话，已降级为终端响铃", "info");
      }
      return;
    }

    if (!(await hasMacOSAudioCapability())) {
      ringTerminalBell();
      if (options?.interactive) {
        safeNotify(ctx, "当前系统处于暗唤醒/无音频状态，已降级为终端响铃", "info");
      }
      return;
    }

    try {
      const { path, volume } = activeSound;
      const expandedPath = path.startsWith("~/") || path === "~"
        ? expandHome(path)
        : resolve(getAgentConfigDir(isPiHost), path);

      const args = volume === undefined ? [expandedPath] : ["-v", String(volume), expandedPath];
      const result = await pi.exec("/usr/bin/afplay", args, { timeout: 5000 });
      if (result.code !== 0) {
        const stderr = result.stderr?.trim();
        if (stderr) {
          throw new Error(stderr);
        }
        if (result.killed || result.code === 143) {
          throw new Error(`afplay 播放超时（退出码 ${result.code}）`);
        }
        throw new Error(`afplay 退出码 ${result.code}`);
      }
    } catch (error) {
      safeNotify(ctx, `提示音播放失败：${String(error)}`, "error");
    }
  }

  async function safeLoad(ctx: Context, fromDisk = false): Promise<boolean> {
    try {
      await reload(fromDisk);
      return true;
    } catch (error) {
      activeSound = false;
      safeNotify(ctx, `提示音配置异常：${String(error)}`, "error");
      return false;
    }
  }

  pi.on("session_start", async (_event, ctx) => {
    await safeLoad(ctx, false);
  });

  if (isPiHost) {
    pi.on("agent_settled", (event: unknown, ctx: Context) => {
      if (ctx.hasUI === false) return;
      if (typeof event === "object" && event !== null && "aborted" in event && event.aborted === true) {
        return;
      }
      void play(ctx);
    });
  } else {
    pi.on("agent_end", (event: unknown, ctx: Context) => {
      if (ctx.hasUI === false) return;
      if (typeof event === "object" && event !== null && "willContinue" in event && event.willContinue === true) {
        return;
      }
      void play(ctx);
    });
  }

  pi.registerCommand("sounds", {
    description: "提示音：test 试听、list 查看、reload 重载配置",
    async handler(args, ctx) {
      switch (args.trim()) {
        case "":
        case "list":
          safeNotify(
            ctx,
            `配置来源: ${configSource}\nagent_end: ${activeSound ? JSON.stringify(activeSound) : "已禁用 (false)"}`,
            "info"
          );
          return;
        case "reload": {
          const ok = await safeLoad(ctx, true);
          if (ok) {
            safeNotify(ctx, `提示音配置已重新加载 (${configSource})`, "info");
          }
          return;
        }
        case "test":
        case "agent_end":
          void play(ctx, { interactive: true });
          return;
        default:
          safeNotify(ctx, "用法：/sounds [test | list | reload | agent_end]", "warning");
      }
    },
  });
}
