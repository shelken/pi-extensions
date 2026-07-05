# 版本管理

本项目用 [changesets](https://github.com/changesets/changesets) 管理 monorepo 版本，independent mode（子包各自 semver）。根包不参与版本管理。

## 设计理念

- **根包不版本**：根包 `private: true` 不发布，version 字段对发布链路零作用，去掉以消除同步负担。
- **子包独立 semver**：每个子包有自己的版本号，按 [SemVer](https://semver.org/) 语义 bump。
- **private 子包也版本化**：private 子包不发布到 npm，但保留 version + tag，保证变更可追溯。
- **CHANGELOG 分散到子包**：各子包独立 `CHANGELOG.md`，由 changesets 自动生成（Keep a Changelog 格式 + GitHub PR/commit 链接）。

## 版本规则

| 变更类型 | commit 前缀 | 子包 bump | 说明 |
|---|---|---|---|
| 新功能 | `feat(scope):` | minor | |
| 修复 | `fix(scope):` | patch | |
| 性能 | `perf(scope):` | patch | |
| 破坏性变更 | `feat(scope)!:` 或 `BREAKING CHANGE:` | major | |
| 重构/文档/杂项 | `refactor`/`docs`/`chore` | 不触发发布 | 需要时可手动写 changeset |

`scope` 对应子包名（如 `pi-zed-provider`、`@shelken/pi-dynamic-models`）。无 scope 的提交视为根级变更，不触发任何子包版本变化。

### changeset 写不写的判定

写 changeset 的准则：变更是否影响子包的**行为、配置路径、公开入口或兼容性**。

- `refactor`/`docs`/`chore` 默认不写——但若 refactor 改变了运行时行为或公开入口，按实际影响写（如改了 exports 路径 → patch）。
- 纯内部重构（不改行为/入口/兼容性）不写 changeset，直接提交即可。
- 拿不准时写一个空的：`just changeset` 选「no changeset」或 agent 写 `--- {} ---`。

## 工作流

### 日常开发

```
改代码 → just changeset → git commit → git push
```

1. **写 changeset**：每次有发布意义的变更后运行 `just changeset`，交互式选择受影响子包 + bump 类型 + 描述。生成的 `.changeset/*.md` 随代码一起提交。
2. **提交**：代码和 changeset 文件一起 commit、push 到 main。
3. **CI 自动接管**：push 到 main 后 `Publish` workflow 自动运行——若有待发布 changeset，`changesets/action` 自动开一个 `chore(release)` PR，包含 version bump + CHANGELOG 更新。
4. **发布**：merge 该 release PR 后，workflow 再次运行，无待发布 changeset 时执行 `changeset publish`——发布 public 子包到 npm（带 provenance）、打 tag、建 GitHub Release。private 子包只打 tag 不发布。

### release PR 由谁合并

- **人类**：在 GitHub UI 或 `gh pr merge` 手动 review 后合并。
- **Agent**：可用 `gh pr merge <PR号> --merge --admin` 合并（需有写权限）。合并前应 review release PR 的 diff（version bump + CHANGELOG 是否符合预期）。

> release PR 合并是整个流程唯一需要人工/agent 介入的点，其余 CI 自动。

### 关键命令

| 命令 | 作用 |
|---|---|
| `just changeset` | 添加 changeset 声明（交互式，人用） |
| `just changeset-status` | 查看待发布的 changeset，检查是否漏写 |
| `just changeset-version` | 本地预览 version 应用结果（bump + CHANGELOG），预览后 `git checkout .` 撤销 |
| `just verify` | 提交前校验（类型检查 + 测试） |

> 永远不需要手动改 `package.json` 的 version 或写 CHANGELOG——changesets 全部自动处理。

### Agent 非交互写法

Agent 无需交互式 CLI，直接用文件写入工具创建 `.changeset/<描述性名称>.md`：

```markdown
---
"@shelken/pi-dynamic-models": minor
"pi-zed-provider": patch
---

变更描述（会写进子包 CHANGELOG）
```

- **frontmatter**：`"包名": bump类型`（`major` / `minor` / `patch`），多包多行
- **正文**：变更描述，会成为子包 CHANGELOG 条目
- **文件名**：任意，建议描述性（如 `pi-zed-provider-types.md`）

无发布意义的变更（纯 docs/chore）写空 changeset：`--- {} ---`，或直接不写。

## 工具链

| 工具 | 管理范围 | 配置 |
|---|---|---|
| [mise](https://mise.jdx.dev/) | node、bun 版本 | `.mise.toml` |
| [bun](https://bun.sh/) | node 依赖安装、运行、测试 | `package.json` workspaces |
| [npm](https://www.npmjs.com/) | 子包发布（CI 内，changesets 调用） | `NPM_TOKEN` secret |

本地开发无需配置 npm token——发布只在 CI 内完成。

## 发布流程（CI 自动）

`Publish` workflow（`.github/workflows/publish.yml`）监听 push 到 main：

1. `bun install --frozen-lockfile`
2. `changesets/action` 检测待发布 changeset：
   - **有** → 开 `chore(release)` PR（version bump + CHANGELOG 生成），等待人工 merge
   - **无** → 执行 `changeset publish`，发布 public 子包 + 打 tag + 建 GitHub Release

权限：`id-token: write`（npm provenance）、`contents: write`（tag/release）、`pull-requests: write`（release PR）。

### 无需构建步骤

pi 扩展以 `.ts` 源文件直接发布（`pi.extensions` 数组指向各子包的 `index.ts`），运行时由 pi 加载。CI 不跑 `tsc`/`build`，`changeset publish` 直接发包。子包无需 `build` 脚本。

### 当前子包发布状态

- **public（会发 npm）**：`@shelken/pi-dynamic-models`
- **private（只打 tag）**：`pi-add-dir`、`pi-auto-model-prompts`、`pi-co-authored-by`、`pi-command-history`、`pi-debug-cache`、`pi-zed-provider`、`simple-plannotator`

子包从 private 转 public：去掉 `package.json` 的 `private: true`，加 `"@shelken/"` scope 和 `publishConfig.access: public`（详见 `AGENTS.md`）。

### NPM_TOKEN

CI 所需 `NPM_TOKEN` 已配置于 repo secrets（本地开发无需）。若发布失败并提示鉴权错误，检查 `gh secret list` 是否仍有 `NPM_TOKEN`。

### 发布后检查

merge release PR 后确认发布闭环：

- `npm view @shelken/pi-dynamic-models version` —— 版本号已更新
- `gh release list` —— GitHub Release 已建
- `git tag --list '@shelken/*'` —— tag 已打

任一缺失说明 workflow 失败，去 Actions 页查日志；无需手动补发，修复后重跑 workflow（`workflow_dispatch`）即可。

## 配置参考

- changesets 配置：`.changeset/config.json`
- independent mode（`fixed: []`）
- `privatePackages: { version: true, tag: true }`：private 子包也版本化 + 打 tag
- changelog 格式：`@changesets/changelog-github`（带 PR/commit 链接）
