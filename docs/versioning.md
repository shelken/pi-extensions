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

`scope` 对应子包名（如 `pi-command-history`、`@shelken/pi-dynamic-models`）。无 scope 的提交视为根级变更，不触发任何子包版本变化。

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
| `just secrets` | 用 Gitleaks 扫描完整 Git 历史中的密钥 |

> 永远不需要手动改 `package.json` 的 version 或写 CHANGELOG——changesets 全部自动处理。

### Agent 非交互写法

Agent 无需交互式 CLI，直接用文件写入工具创建 `.changeset/<描述性名称>.md`：

```markdown
---
"@shelken/pi-dynamic-models": minor
"pi-command-history": patch
---

变更描述（会写进子包 CHANGELOG）
```

- **frontmatter**：`"包名": bump类型`（`major` / `minor` / `patch`），多包多行
- **正文**：变更描述，会成为子包 CHANGELOG 条目
- **文件名**：任意，建议描述性（如 `pi-command-history-fix.md`）

无发布意义的变更（纯 docs/chore）写空 changeset：`--- {} ---`，或直接不写。

## 工具链

| 工具 | 管理范围 | 配置 |
|---|---|---|
| [mise](https://mise.jdx.dev/) | node、bun、gitleaks 版本 | `.mise.toml` |
| [bun](https://bun.sh/) | node 依赖安装、运行、测试 | `package.json` workspaces |
| [npm](https://www.npmjs.com/) | 子包发布（CI 内，changesets 调用） | Trusted Publishing（OIDC） |

本地开发和 CI 都不保存长期 npm token。发布时 GitHub Actions 通过 OIDC 获取短期凭据。

## 发布流程（CI 自动）

`Publish` workflow（`.github/workflows/publish.yml`）监听 push 到 main：

1. `bun install --frozen-lockfile`
2. `changesets/action` 检测待发布 changeset：
   - **有** → 开 `chore(release)` PR（version bump + CHANGELOG 生成），等待人工 merge
   - **无** → 执行 `changeset publish`，发布 public 子包 + 打 tag + 建 GitHub Release

权限：`id-token: write`（npm Trusted Publishing + provenance）、`contents: write`（tag/release）、`pull-requests: write`（release PR）。

### 无需构建步骤

pi 扩展以 `.ts` 源文件直接发布（`pi.extensions` 数组指向各子包的 `index.ts`），运行时由 pi 加载。CI 不跑 `tsc`/`build`，`changeset publish` 直接发包。子包无需 `build` 脚本。

### 当前子包发布状态

- **public（会发 npm）**：`@shelken/pi-add-dir`、`@shelken/pi-co-authored-by`、`@shelken/pi-command-history`、`@shelken/pi-dynamic-models`、`@shelken/simple-plannotator`
- **private（只打 tag）**：`pi-auto-model-prompts`

### 子包从 private 转 public

按以下顺序执行，不要只删除 `private: true`：

1. **确认包名**：检查 npm 上的名称和维护者；自管包统一使用 `@shelken/` scope，不覆盖无发布权限的上游包名。
2. **确认许可证**：自管代码声明许可证；fork 必须保留上游 LICENSE 和版权声明，README 标明原始仓库。
3. **修改 manifest**：
   - `name` 改为 `@shelken/<package>`；
   - 删除 `private: true`；
   - 添加 `license`；
   - 添加指向本仓库及子目录的 `repository`；
   - 添加 `publishConfig.access: public`；
   - 用 `files` 限制 tarball，只包含运行文件和必要文档。
4. **更新文档**：子包 README 增加 npm 安装方式；同步更新根 README 的 npm 包名。
5. **同步 lockfile**：修改 workspace 包名后运行 `just install`，确认 `bun.lock` 已记录 scoped 名称。
6. **检查 tarball**：从 monorepo 根运行 `npm pack --workspace='@shelken/<package>' --dry-run --json`，确认没有测试、fixture、临时文件、凭据或不应公开的源码。
7. **运行验证**：至少运行子包测试、入口 smoke test、`just verify` 和 `just secrets`。仅测试 helper 不算覆盖发布入口。
8. **写 changeset**：scope、公开入口和发布方式变化属于发布意义变更，必须声明 bump。若 private 阶段已经生成错误 tag/Release，先删除；不要让 tag 指向未实际发布的版本。
9. **提交并推送准备改动**：等待 Changesets 创建 release PR，但新包人工首发和 Trusted Publisher 配置完成前不要 merge。
10. **完成一次人工首发并绑定 OIDC**：严格按下方 runbook 操作。已有 npm 包可以跳过人工首发，直接配置 Trusted Publisher。
11. **合并 release PR**：review 包名、version、CHANGELOG 和 tarball 后再合并，触发首个 OIDC patch 发布。
12. **验证发布闭环**：确认 npm 版本、provenance、GitHub Release 和 tag 一致。

### 新 scoped 包人工首发 runbook

以下命令都从 monorepo 根执行。不要直接运行裸 `npm publish`：根 `package.json` 没有 `version`，npm 11 会报 `Cannot read properties of null (reading 'prerelease')`。

1. 登录到临时 npmrc，避免修改由 Nix 管理的用户配置：

   ```bash
   npm login --userconfig /tmp/.npmrc-user
   ```

2. 用当前 package version 人工发布 baseline；显式指定 workspace：

   ```bash
   NPM_CONFIG_USERCONFIG=/tmp/.npmrc-user \
   npm publish --workspace='@shelken/<package>' --access public
   ```

3. 验证包状态。新包发布后 registry 元数据可能短暂延迟；`npm access get status` 已显示 `public` 时不要重复 publish，等待 `npm view` 可见：

   ```bash
   NPM_CONFIG_USERCONFIG=/tmp/.npmrc-user \
   npm access get status '@shelken/<package>'

   npm view '@shelken/<package>' version
   ```

4. 立即绑定 Trusted Publisher。该操作需要浏览器 2FA：

   ```bash
   NPM_CONFIG_USERCONFIG=/tmp/.npmrc-user \
   npm trust github '@shelken/<package>' \
     --file publish.yml \
     --repo shelken/pi-extensions \
     --allow-publish \
     --yes
   ```

   - `E404`：包尚未创建或 registry 仍未完成传播，等待后重试。
   - `E409`：该包已有唯一绑定；运行 `npm trust list '@shelken/<package>' --json` 核对，不要重复创建。

5. 为人工发布的 baseline 补 scoped tag 和 GitHub Release，tag 必须指向实际打包源码所在 commit：

   ```bash
   git tag '@shelken/<package>@<version>' <publish-commit>
   git push origin '@shelken/<package>@<version>'
   gh release create '@shelken/<package>@<version>' --generate-notes
   ```

6. 合并 Changesets release PR，等待 workflow 用 OIDC 发布下一 patch。随后确认 npm 页面有 provenance，且来源为 `shelken/pi-extensions` 的 `publish.yml`。

7. 全部完成后删除临时凭据：

   ```bash
   rm -f /tmp/.npmrc-user
   ```

manifest 示例：

```json
{
  "name": "@shelken/<package>",
  "license": "MIT",
  "files": ["index.ts"],
  "repository": {
    "type": "git",
    "url": "git+https://github.com/shelken/pi-extensions.git",
    "directory": "extensions/<package>"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

### Trusted Publishing（OIDC）

- workflow 必须有 `id-token: write`，并通过 `actions/setup-node` 配置 npm registry；不要注入 `NPM_TOKEN` 或 `NODE_AUTH_TOKEN`。
- npm CLI 必须为 11.5.1 或更高版本。
- npm Trusted Publisher 中的 owner、repository 和 workflow 文件名必须与 GitHub 完全一致。
- `package.json` 的 `repository` 必须指向当前 GitHub 仓库；monorepo 子包同时填写 `directory`。
- Trusted Publisher 每个 npm 包单独配置。新增 public 子包时不能复用其他包的绑定。

若发布报 `ENEEDAUTH`，依次检查 workflow 的 `registry-url`、`id-token: write`、npm CLI 版本、Trusted Publisher 绑定和 manifest 的 `repository`，不要回退到长期 token。

### 发布后检查

merge release PR 后确认发布闭环：

- `npm view @shelken/<package> version` —— 版本号已更新
- npm 包页面的 provenance —— 指向本仓库和对应 workflow
- `gh release list` —— GitHub Release 已建
- `git tag --list '@shelken/*'` —— tag 已打

任一缺失说明 workflow 失败，去 Actions 页查日志；不要手动补发，修复后重跑 workflow（`workflow_dispatch`）即可。

## 配置参考

- changesets 配置：`.changeset/config.json`
- independent mode（`fixed: []`）
- `privatePackages: { version: true, tag: true }`：private 子包也版本化 + 打 tag
- changelog 格式：`@changesets/changelog-github`（带 PR/commit 链接）
