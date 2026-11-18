import { describe, it, expect, vi } from "vitest"
import factory, { mergeAutocompleteItems } from "../src/index.ts"

describe("extension factory", () => {
  it("导出默认函数", () => {
    expect(factory).toBeTypeOf("function")
  })
})

describe("mergeAutocompleteItems", () => {
  it("行首时同一 skill 保留 pi 原生项(value 不带斜杠), 补全插入 /skill:name", () => {
    const merged = mergeAutocompleteItems({
      current: {
        prefix: "/wayfi",
        items: [
          {
            label: "skill:wayfinder",
            value: "skill:wayfinder",
            description: "[u] Plan a huge chunk of work",
          },
        ],
      },
      skillItems: [
        {
          label: "skill:wayfinder",
          value: "/wayfinder",
          description: "[u] Plan a huge chunk of work",
        },
      ],
      preferCommands: true,
      prefix: "/wayfi",
    })
    expect(merged.items).toHaveLength(1)
    expect(merged.items[0]).toEqual({
      label: "skill:wayfinder",
      value: "skill:wayfinder",
      description: "[u] Plan a huge chunk of work",
    })
  })

  it("mid-line 时同一 skill 保留插件项(value 带斜杠), 供 inline 展开", () => {
    const merged = mergeAutocompleteItems({
      current: {
        prefix: "wayfi",
        items: [
          {
            label: "skill:wayfinder",
            value: "skill:wayfinder",
            description: "[u] Plan a huge chunk of work",
          },
        ],
      },
      skillItems: [
        {
          label: "skill:wayfinder",
          value: "/wayfinder",
          description: "[u] Plan a huge chunk of work",
        },
      ],
      preferCommands: false,
      prefix: "wayfi",
    })
    expect(merged.items).toHaveLength(1)
    expect(merged.items[0]).toEqual({
      label: "skill:wayfinder",
      value: "/wayfinder",
      description: "[u] Plan a huge chunk of work",
    })
  })

  it("非 skill 补全项互不干扰", () => {
    const merged = mergeAutocompleteItems({
      current: null,
      skillItems: [
        { label: "a", value: "x" },
        { label: "b", value: "y" },
      ],
      preferCommands: false,
      prefix: "",
    })
    expect(merged.items).toHaveLength(2)
  })
})

describe("inline-skill message renderer", () => {
  it("没有 skills 详情时的回退渲染使用宿主 keyHint 与主题 bold", () => {
    const renderers = new Map<string, (...args: any[]) => any>()
    const pi = {
      registerMessageRenderer: (type: string, fn: (...args: any[]) => any) => {
        renderers.set(type, fn)
      },
      registerCommand: vi.fn(),
      on: vi.fn(),
      appendEntry: vi.fn(),
      getCommands: vi.fn(() => []),
    }
    factory(pi as any)

    const render = renderers.get("inline-skill")!
    const component = render(
      { details: { names: ["demo"] } },
      {
        expanded: false,
        outputPad: 0,
        keyText: () => "K",
        keyHint: (id: string, d: string) => `<${id}> ${d}`,
      },
      {
        fg: (_c: string, t: string) => t,
        bg: (_c: string, t: string) => t,
        bold: (t: string) => `*${t}*`,
      },
    )
    const text = component.render(120).join("\n")

    expect(text).toContain("*[inline-skill]*")
    expect(text).toContain("<app.tools.expand> to expand")
    expect(text).not.toContain("ctrl+o")
    expect(text).not.toContain("\x1b[1m")
  })
})
