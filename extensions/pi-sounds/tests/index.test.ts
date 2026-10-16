import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
});
