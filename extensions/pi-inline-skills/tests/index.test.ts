import { describe, it, expect } from "vitest"
import factory, { mergeAutocompleteItems } from "../src/index.ts"

describe("extension factory", () => {
  it("导出默认函数", () => {
    expect(typeof factory).toBe("function")
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
