# pi-inline-skills

输入 `/` 时内联补全 skill（`/wayfinder` → `skill:wayfinder`），并把已加载 skill 的内容直接展开进用户消息，无需额外依赖文件引用。

## Fork 来源

Fork 自 [`@tifan/pi-inline-skills` v1.0.5](https://github.com/tifandotme/pi-extensions/tree/master/packages/pi-inline-skills)（MIT），移入本 monorepo 自行维护。

相对上游的改动：

- 修复行首补全重复：pi 内置对行首 slash 命令也出 skill 补全（`value` 不带斜杠），与插件自带项（`value` 带斜杠）叠加显示两行；`mergeAutocompleteItems` 改为对 skill 补全项按 `label` 去重。
- `toSorted` → `sort`（ES2022 兼容，跟随根 tsconfig）。

## 功能

- `/skill` 补全：输入 `/` 后按前缀模糊匹配已注册 skill，显示来源标签（`[u]` 用户 / `[p]` 项目）。
- 内联展开：消息里的 `/skill-name` 会被展开为对应 skill 内容并注入 agent 上下文；已加载过的 skill 不重复注入。
- `/loaded-skills` 命令：列出当前会话已加载的 skill。

## 配置

无配置项。

## 开发

```bash
bun install
just verify
```
