import { defineConfig } from "vitest/config";

// 冻结（停用不删）的扩展不参与根级测试。重新启用时：移除本清单条目，
// 恢复该子包 package.json 的 test script，并在根 package.json 的
// pi.extensions 去掉 "-" 前缀。
const frozenExcludes = ["extensions/pi-title/**"];

export default defineConfig({
  test: {
    exclude: [
      ...frozenExcludes,
      "**/node_modules/**",
      "**/dist/**",
      "**/.{idea,git,cache,output,temp}/**",
    ],
  },
});