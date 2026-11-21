import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import factory from "../src/index.ts";

describe("pi-sounds 扩展", () => {
  const originalOmpCode = process.env.OMPCODE;

  beforeEach(() => {
    delete process.env.OMPCODE;
  });

  afterEach(() => {
    if (originalOmpCode !== undefined) {
      process.env.OMPCODE = originalOmpCode;
    } else {
      delete process.env.OMPCODE;
    }
  });

  it("导出默认工厂函数", () => {
    expect(factory).toBeTypeOf("function");
  });

  it("在 OMPCODE=1 的子代理环境下跳过注册", () => {
    process.env.OMPCODE = "1";
    const handlers: Record<string, Function> = {};
    const piMock = {
      on: (event: string, handler: Function) => {
        handlers[event] = handler;
      },
      registerCommand: vi.fn(),
    };

    factory(piMock as any);
    expect(Object.keys(handlers)).toHaveLength(0);
  });

  it("在 Pi 宿主下正确注册生命周期与 agent_settled", async () => {
    const handlers: Record<string, Function> = {};
    let commandDef: any = null;

    const piMock = {
      on: (event: string, handler: Function) => {
        handlers[event] = handler;
      },
      registerCommand: (_name: string, def: any) => {
        commandDef = def;
      },
      exec: vi.fn().mockResolvedValue({ code: 0, stderr: "" }),
      getSettings: () => ({}),
    };

    factory(piMock as any);

    expect(handlers.session_start).toBeDefined();
    expect(handlers.agent_settled).toBeDefined();
    expect(handlers.agent_end).toBeUndefined();
    expect(commandDef).not.toBeNull();

    const notices: string[] = [];
    const ctx = { ui: { notify: (msg: string) => notices.push(msg) } };

    await handlers.session_start({}, ctx);
    await commandDef.handler("list", ctx);
    expect(notices[0]).toContain("done.mp3");
  });

  it("在 OMP 宿主下正确注册生命周期与 agent_end", async () => {
    const handlers: Record<string, Function> = {};
    let commandDef: any = null;

    const ompMock = {
      on: (event: string, handler: Function) => {
        handlers[event] = handler;
      },
      registerCommand: (_name: string, def: any) => {
        commandDef = def;
      },
      exec: vi.fn().mockResolvedValue({ code: 0, stderr: "" }),
    };

    factory(ompMock as any);

    expect(handlers.session_start).toBeDefined();
    expect(handlers.agent_end).toBeDefined();
    expect(handlers.agent_settled).toBeUndefined();

    const notices: string[] = [];
    const ctx = { ui: { notify: (msg: string) => notices.push(msg) } };

    await handlers.session_start({}, ctx);
    await commandDef.handler("list", ctx);
    expect(notices[0]).toContain("done.mp3");
  });

  it("OMP 下过滤 willContinue 事件不触发播放", async () => {
    const handlers: Record<string, Function> = {};
    const execMock = vi.fn().mockResolvedValue({ code: 0, stderr: "" });

    const ompMock = {
      on: (event: string, handler: Function) => {
        handlers[event] = handler;
      },
      registerCommand: vi.fn(),
      exec: execMock,
    };

    factory(ompMock as any);
    const ctx = { ui: { notify: vi.fn() } };

    await handlers.session_start({}, ctx);
    handlers.agent_end({ willContinue: true }, ctx);

    expect(execMock).not.toHaveBeenCalled();
  });

  it("Pi 下过滤 aborted 事件不触发播放", async () => {
    const handlers: Record<string, Function> = {};
    const execMock = vi.fn().mockResolvedValue({ code: 0, stderr: "" });

    const piMock = {
      on: (event: string, handler: Function) => {
        handlers[event] = handler;
      },
      registerCommand: vi.fn(),
      exec: execMock,
      getSettings: () => ({}),
    };

    factory(piMock as any);
    const ctx = { ui: { notify: vi.fn() } };

    await handlers.session_start({}, ctx);
    handlers.agent_settled({ aborted: true }, ctx);

    expect(execMock).not.toHaveBeenCalled();
  });

  it("在无 UI 模式 (hasUI=false，如 pi -p) 下跳过自动提示音", async () => {
    const handlers: Record<string, Function> = {};
    const execMock = vi.fn().mockResolvedValue({ code: 0, stderr: "" });

    const piMock = {
      on: (event: string, handler: Function) => {
        handlers[event] = handler;
      },
      registerCommand: vi.fn(),
      exec: execMock,
      getSettings: () => ({}),
    };

    factory(piMock as any);
    const ctx = { hasUI: false, ui: { notify: vi.fn() } };

    await handlers.session_start({}, ctx);
    handlers.agent_settled({}, ctx);
    await new Promise((r) => setTimeout(r, 10));

    expect(execMock).not.toHaveBeenCalled();
  });

  it("异步播放失败且 ctx.ui 已 stale 时不抛出未捕获异常", async () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")!;
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    const handlers: Record<string, Function> = {};
    let rejectExec!: (err: Error) => void;
    const execMock = vi.fn((command: string) => {
      if (command === "/usr/sbin/ioreg") {
        return Promise.resolve({ code: 0, stdout: '      "System Capabilities" = 15\n', stderr: "" });
      }
      return new Promise<{ code: number; stderr?: string }>((_resolve, reject) => {
        rejectExec = reject;
      });
    });

    const piMock = {
      on: (event: string, handler: Function) => {
        handlers[event] = handler;
      },
      registerCommand: vi.fn(),
      exec: execMock,
      getSettings: () => ({}),
    };

    factory(piMock as any);
    let stale = false;
    const ctx = {
      hasUI: true,
      get ui() {
        if (stale) {
          throw new Error("This extension ctx is stale after session replacement or reload.");
        }
        return { notify: vi.fn() };
      },
    };

    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      await handlers.session_start({}, ctx);
      handlers.agent_settled({}, ctx);
      await new Promise((r) => setTimeout(r, 10));
      stale = true;
      rejectExec(new Error("afplay terminated"));
      await new Promise((r) => setTimeout(r, 20));
      expect(unhandled).toHaveLength(0);
    } finally {
      process.off("unhandledRejection", onUnhandled);
      Object.defineProperty(process, "platform", originalPlatform);
    }
  });

  it("OMP 环境下从 OMP_AGENT_DIR/config.yml 读取配置而非 PI_CODING_AGENT_DIR", async () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")!;
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    const prevOmpDir = process.env.OMP_AGENT_DIR;
    const prevPiDir = process.env.PI_CODING_AGENT_DIR;
    const ompDir = mkdtempSync(join(tmpdir(), "pi-sounds-omp-"));
    const piDir = mkdtempSync(join(tmpdir(), "pi-sounds-pi-"));

    try {
      writeFileSync(join(ompDir, "config.yml"), JSON.stringify({ sounds: { agent_end: false } }));
      writeFileSync(join(piDir, "config.yml"), JSON.stringify({ sounds: { agent_end: "/wrong.mp3" } }));
      process.env.OMP_AGENT_DIR = ompDir;
      process.env.PI_CODING_AGENT_DIR = piDir;

      const handlers: Record<string, Function> = {};
      const execMock = vi.fn().mockResolvedValue({ code: 0, stderr: "" });
      const ompMock = {
        on: (event: string, handler: Function) => {
          handlers[event] = handler;
        },
        registerCommand: vi.fn(),
        exec: execMock,
      };

      factory(ompMock as any);
      const ctx = { ui: { notify: vi.fn() } };
      await handlers.session_start({}, ctx);
      handlers.agent_end({}, ctx);
      await new Promise((r) => setTimeout(r, 10));

      expect(execMock).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(process, "platform", originalPlatform);
      if (prevOmpDir === undefined) delete process.env.OMP_AGENT_DIR;
      else process.env.OMP_AGENT_DIR = prevOmpDir;
      if (prevPiDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = prevPiDir;
      rmSync(ompDir, { recursive: true, force: true });
      rmSync(piDir, { recursive: true, force: true });
    }
  });

  it("非 macOS 平台下自动触发静默跳过，手动 /sounds test 才提示不支持", async () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")!;
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    try {
      const handlers: Record<string, Function> = {};
      let commandDef: any = null;
      const execMock = vi.fn();

      const piMock = {
        on: (event: string, handler: Function) => {
          handlers[event] = handler;
        },
        registerCommand: (_name: string, def: any) => {
          commandDef = def;
        },
        exec: execMock,
        getSettings: () => ({}),
      };

      factory(piMock as any);
      const notify = vi.fn();
      const ctx = { hasUI: true, ui: { notify } };

      await handlers.session_start({}, ctx);
      handlers.agent_settled({}, ctx);
      await new Promise((r) => setTimeout(r, 10));
      expect(notify).not.toHaveBeenCalled();
      expect(execMock).not.toHaveBeenCalled();

      await commandDef.handler("test", ctx);
      await new Promise((r) => setTimeout(r, 10));
      expect(notify).toHaveBeenCalledWith(expect.stringContaining("macOS"), "error");
    } finally {
      Object.defineProperty(process, "platform", originalPlatform);
    }
  });

  it("/sounds reload 配置非法时仅报异常，不再误报重载成功", async () => {
    const prevPiDir = process.env.PI_CODING_AGENT_DIR;
    const piDir = mkdtempSync(join(tmpdir(), "pi-sounds-reload-"));
    try {
      writeFileSync(join(piDir, "settings.json"), JSON.stringify({ sounds: { agent_end: { path: "   " } } }));
      process.env.PI_CODING_AGENT_DIR = piDir;

      const handlers: Record<string, Function> = {};
      let commandDef: any = null;
      const piMock = {
        on: (event: string, handler: Function) => {
          handlers[event] = handler;
        },
        registerCommand: (_name: string, def: any) => {
          commandDef = def;
        },
        exec: vi.fn(),
        getSettings: () => ({}),
      };

      factory(piMock as any);
      const notices: Array<{ msg: string; type: string }> = [];
      const ctx = {
        hasUI: true,
        ui: { notify: (msg: string, type: string) => notices.push({ msg, type }) },
      };

      await commandDef.handler("reload", ctx);
      expect(notices).toHaveLength(1);
      expect(notices[0].type).toBe("error");
    } finally {
      if (prevPiDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = prevPiDir;
      rmSync(piDir, { recursive: true, force: true });
    }
  });

  it("macOS 暗唤醒无音频能力位时跳过 afplay 并降级终端响铃", async () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")!;
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    const originalIsTTY = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    try {
      const handlers: Record<string, Function> = {};
      let commandDef: any = null;
      const execMock = vi.fn((command: string) => {
        if (command === "/usr/sbin/ioreg") {
          return Promise.resolve({ code: 0, stdout: '      "System Capabilities" = 9\n', stderr: "" });
        }
        return Promise.resolve({ code: 0, stderr: "" });
      });

      const piMock = {
        on: (event: string, handler: Function) => {
          handlers[event] = handler;
        },
        registerCommand: (_name: string, def: any) => {
          commandDef = def;
        },
        exec: execMock,
        getSettings: () => ({}),
      };

      factory(piMock as any);
      const notify = vi.fn();
      const ctx = { hasUI: true, ui: { notify } };

      await handlers.session_start({}, ctx);
      handlers.agent_settled({}, ctx);
      await new Promise((r) => setTimeout(r, 15));

      expect(execMock).toHaveBeenCalledWith("/usr/sbin/ioreg", ["-r", "-c", "IOPMrootDomain", "-d", "1"], { timeout: 1000 });
      expect(execMock).not.toHaveBeenCalledWith("/usr/bin/afplay", expect.anything(), expect.anything());
      expect(writeSpy).toHaveBeenCalledWith("\x07");
      expect(notify).not.toHaveBeenCalled();

      await commandDef.handler("test", ctx);
      await new Promise((r) => setTimeout(r, 15));
      expect(notify).toHaveBeenCalledWith(expect.stringContaining("暗唤醒"), "info");
    } finally {
      writeSpy.mockRestore();
      if (originalIsTTY) Object.defineProperty(process.stdout, "isTTY", originalIsTTY);
      else Reflect.deleteProperty(process.stdout, "isTTY");
      Object.defineProperty(process, "platform", originalPlatform);
    }
  });

  it("macOS 具备音频能力位（含合盖外接亮屏）时正常调用 afplay", async () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")!;
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    const prevSsh = process.env.SSH_CONNECTION;
    delete process.env.SSH_CONNECTION;

    try {
      const handlers: Record<string, Function> = {};
      const execMock = vi.fn((command: string) => {
        if (command === "/usr/sbin/ioreg") {
          return Promise.resolve({ code: 0, stdout: '      "System Capabilities" = 15\n', stderr: "" });
        }
        return Promise.resolve({ code: 0, stderr: "" });
      });

      const piMock = {
        on: (event: string, handler: Function) => {
          handlers[event] = handler;
        },
        registerCommand: vi.fn(),
        exec: execMock,
        getSettings: () => ({}),
      };

      factory(piMock as any);
      const ctx = { hasUI: true, ui: { notify: vi.fn() } };

      await handlers.session_start({}, ctx);
      handlers.agent_settled({}, ctx);
      await new Promise((r) => setTimeout(r, 15));

      expect(execMock).toHaveBeenCalledWith("/usr/bin/afplay", [expect.stringContaining("done.mp3")], { timeout: 5000 });
    } finally {
      if (prevSsh !== undefined) process.env.SSH_CONNECTION = prevSsh;
      Object.defineProperty(process, "platform", originalPlatform);
    }
  });

  it("SSH 会话下跳过远端 afplay 并降级终端响铃", async () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")!;
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    const originalIsTTY = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const prevSsh = process.env.SSH_CONNECTION;
    process.env.SSH_CONNECTION = "10.0.0.2 54321 10.0.0.1 22";

    try {
      const handlers: Record<string, Function> = {};
      const execMock = vi.fn();
      const piMock = {
        on: (event: string, handler: Function) => {
          handlers[event] = handler;
        },
        registerCommand: vi.fn(),
        exec: execMock,
        getSettings: () => ({}),
      };

      factory(piMock as any);
      const notify = vi.fn();
      const ctx = { hasUI: true, ui: { notify } };

      await handlers.session_start({}, ctx);
      handlers.agent_settled({}, ctx);
      await new Promise((r) => setTimeout(r, 15));

      expect(execMock).not.toHaveBeenCalled();
      expect(writeSpy).toHaveBeenCalledWith("\x07");
      expect(notify).not.toHaveBeenCalled();
    } finally {
      writeSpy.mockRestore();
      if (originalIsTTY) Object.defineProperty(process.stdout, "isTTY", originalIsTTY);
      else Reflect.deleteProperty(process.stdout, "isTTY");
      if (prevSsh === undefined) delete process.env.SSH_CONNECTION;
      else process.env.SSH_CONNECTION = prevSsh;
      Object.defineProperty(process, "platform", originalPlatform);
    }
  });

  it("afplay 超时被终止（退出码 143）时给出明确的超时提示", async () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")!;
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    const prevSsh = process.env.SSH_CONNECTION;
    delete process.env.SSH_CONNECTION;

    try {
      const handlers: Record<string, Function> = {};
      const execMock = vi.fn((command: string) => {
        if (command === "/usr/sbin/ioreg") {
          return Promise.resolve({ code: 0, stdout: '      "System Capabilities" = 15\n', stderr: "" });
        }
        return Promise.resolve({ code: 143, stderr: "", killed: true });
      });

      const piMock = {
        on: (event: string, handler: Function) => {
          handlers[event] = handler;
        },
        registerCommand: vi.fn(),
        exec: execMock,
        getSettings: () => ({}),
      };

      factory(piMock as any);
      const notify = vi.fn();
      const ctx = { hasUI: true, ui: { notify } };

      await handlers.session_start({}, ctx);
      handlers.agent_settled({}, ctx);
      await new Promise((r) => setTimeout(r, 15));

      expect(notify).toHaveBeenCalledWith(expect.stringContaining("播放超时"), "error");
    } finally {
      if (prevSsh !== undefined) process.env.SSH_CONNECTION = prevSsh;
      Object.defineProperty(process, "platform", originalPlatform);
    }
  });
});
