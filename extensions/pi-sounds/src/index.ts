import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

declare const Bun:
  | {
      file(path: string): { text(): Promise<string> };
      YAML?: { parse(text: string): unknown };
    }
  | undefined;

// ============================================================================
// 类型与接口定义 (Types)
// ============================================================================

export interface NormalizedSound {
  path: string;
  volume?: number;
}

export interface Context {
  ui: { notify(message: string, type: "info" | "warning" | "error"): void };
}

export interface ExtensionAPI {
  on(event: string, handler: (event: unknown, ctx: Context) => Promise<void> | void): void;
  exec(command: string, args: string[], options: { timeout: number }): Promise<{ code: number; stderr?: string }>;
  registerCommand(name: string, command: {
    description: string;
    handler(args: string, ctx: Context): Promise<void>;
  }): void;
  getSettings?(): Record<string, unknown>;
}

// ============================================================================
// 扩展主体 (Extension)
// ============================================================================

export default function sounds(pi: ExtensionAPI): void {
  // 子代理会话（如 omp 中的嵌套代理）不重复加载提示音
  if (process.env.OMPCODE === "1") return;

  const isPiHost = typeof pi.getSettings === "function";
  const defaultSoundPath = fileURLToPath(new URL("../sounds/done.mp3", import.meta.url));

  let activeSound: NormalizedSound | false = { path: defaultSoundPath };
  let configSource = "默认内置 (done.mp3)";

  /**
   * 优雅解析配置：
   * - 正常运行时优先读取宿主已解析好的设置（零磁盘 I/O）
   * - 显式 reload 时或 omp 环境下直接读取磁盘文件
   * - 未配置时直接采用默认内置 done.mp3（开箱即用，零配置要求）
   */
  async function resolveSoundConfig(fromDisk = false): Promise<{ source: string; raw: unknown }> {
    // 1. Pi 环境优先读取宿主内存设置（如果不是强制读盘）
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

    // 2. 磁盘文件读取（omp 环境，或 pi 环境下显式 /sounds reload）
    try {
      const dir = typeof getAgentDir === "function" ? getAgentDir() : resolve(homedir(), isPiHost ? ".pi/agent" : ".omp/agent");
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

  /**
   * 规范化音效配置
   */
  async function reload(fromDisk = false): Promise<void> {
    const { source, raw } = await resolveSoundConfig(fromDisk);
    configSource = source;

    // 显式配置为 false，表示关闭提示音
    if (raw === false) {
      activeSound = false;
      return;
    }

    // 未配置时的默认内置音效（开箱即用，原始 100% 音量）
    if (raw === undefined || raw === null) {
      activeSound = {
        path: defaultSoundPath,
      };
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

      activeSound = {
        path: trimmed,
        volume,
      };
      return;
    }

    throw new Error("agent_end 必须是音频路径、{ path, volume? } 或 false");
  }

  /**
   * 播放音效（纯异步非阻塞执行）
   */
  async function play(ctx: Context): Promise<void> {
    if (activeSound === false) return;

    try {
      if (process.platform !== "darwin") {
        throw new Error("提示音目前支持 macOS afplay");
      }

      const { path, volume } = activeSound;
      const baseDir = typeof getAgentDir === "function" ? getAgentDir() : homedir();
      const expandedPath = path.startsWith("~/")
        ? resolve(homedir(), path.slice(2))
        : resolve(baseDir, path);

      const args = volume === undefined ? [expandedPath] : ["-v", String(volume), expandedPath];
      const result = await pi.exec("/usr/bin/afplay", args, { timeout: 5000 });
      if (result.code !== 0) {
        throw new Error(result.stderr?.trim() || `afplay 退出码 ${result.code}`);
      }
    } catch (error) {
      ctx.ui.notify(`提示音播放失败：${String(error)}`, "error");
    }
  }

  async function safeLoad(ctx: Context, fromDisk = false): Promise<void> {
    try {
      await reload(fromDisk);
    } catch (error) {
      activeSound = false;
      ctx.ui.notify(`提示音配置异常：${String(error)}`, "error");
    }
  }

  // --------------------------------------------------------------------------
  // 生命周期事件注册
  // --------------------------------------------------------------------------

  pi.on("session_start", async (_event, ctx) => {
    await safeLoad(ctx, false);
  });

  // 根据宿主精准监听完成事件：
  // 1. Pi 环境监听 agent_settled：重试、压缩和排队消息完全处理完毕后触发
  // 2. OMP 环境监听 agent_end：通过 willContinue 过滤多轮迭代
  if (isPiHost) {
    pi.on("agent_settled", (event: unknown, ctx: Context) => {
      if (typeof event === "object" && event !== null && "aborted" in event && event.aborted === true) {
        return;
      }
      void play(ctx);
    });
  } else {
    pi.on("agent_end", (event: unknown, ctx: Context) => {
      if (typeof event === "object" && event !== null && "willContinue" in event && event.willContinue === true) {
        return;
      }
      void play(ctx);
    });
  }

  // --------------------------------------------------------------------------
  // 斜杠命令支持
  // --------------------------------------------------------------------------

  pi.registerCommand("sounds", {
    description: "提示音：test 试听、list 查看、reload 重载配置",
    async handler(args, ctx) {
      switch (args.trim()) {
        case "":
        case "list":
          ctx.ui.notify(
            `配置来源: ${configSource}\nagent_end: ${activeSound ? JSON.stringify(activeSound) : "已禁用 (false)"}`,
            "info"
          );
          return;
        case "reload":
          await safeLoad(ctx, true);
          ctx.ui.notify(`提示音配置已重新加载 (${configSource})`, "info");
          return;
        case "test":
        case "agent_end":
          void play(ctx);
          return;
        default:
          ctx.ui.notify("用法：/sounds [test | list | reload | agent_end]", "warning");
      }
    },
  });
}
