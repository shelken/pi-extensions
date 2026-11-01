import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const readJson = (relativePath) => JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));

// typebox 由宿主提供，根 devDependencies 必须锁宿主自带版本（见 CODING_STANDARDS.md）。
// Renovate 不管 typebox，所以宿主升级后漂移只能靠这条测试发现。
test("根 typebox 与宿主 pi-coding-agent 声明的版本一致", () => {
  const root = readJson("../package.json");
  const host = readJson("../node_modules/@earendil-works/pi-coding-agent/package.json");
  const hostTypebox = host.dependencies?.typebox;

  assert.ok(hostTypebox, "宿主 pi-coding-agent 没有声明 typebox 依赖，请更新本测试");
  assert.equal(
    root.devDependencies.typebox,
    hostTypebox,
    `根 package.json 的 typebox 应锁宿主 pi-coding-agent@${host.version} 声明的 ${hostTypebox}，然后运行 bun install`,
  );
});
