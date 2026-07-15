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
改代码 → just changeset → just release-ready → git commit → git push
```

1. **写 changeset**：每次有发布意义的变更后运行 `just changeset`，交互式选择受影响子包 + bump 类型 + 描述。生成的 `.changeset/*.md` 随代码一起提交。
2. **提交**：代码和 changeset 文件一起 commit、push 到 main。
3. **CI 自动接管**：push 到 main 后 `Publish` workflow 自动运行——若有待发布 changeset，`changesets/action` 自动开一个 `chore(release)` PR，包含 version bump + CHANGELOG 更新。
4. **发布**：merge 该 release PR 后，workflow 再次运行，无待发布 changeset 时执行 `changeset publish`——发布 public 子包到 npm（带 provenance）、打 tag、建 GitHub Release。private 子包只打 tag 不发布。

### release PR 由谁合并

- **人类**：在 GitHub UI 或 `gh pr merge` 手动 review 后合并。
- **Agent**：可用 `gh pr merge <PR号> --merge --admin` 合并（需有写权限）。合并前应 review release PR 的 diff（version bump + CHANGELOG 是否符合预期）。

> 日常发包只有 release PR 合并需要人工/agent 介入；新包首次公开还需要 npm 浏览器 2FA，见下文。

### 关键命令

| 命令 | 作用 |
|---|---|
| `just changeset` | 添加 changeset 声明（交互式，人用） |
| `just changeset-status` | 查看待发布的 changeset，检查是否漏写 |
| `just changeset-version` | 本地预览 version 应用结果（bump + CHANGELOG），预览后 `git checkout .` 撤销 |
| `just verify` | 提交前校验（类型检查 + 测试） |
| `just secrets` | 用 Gitleaks 扫描完整 Git 历史中的密钥 |
| `just release-ready` | 日常发包门禁：verify + secrets + changeset status |
| `just package-audit <slug>` | 首次公开门禁：manifest + 子包测试 + tarball + 全仓门禁 |
| `just package-login` | 登录临时 npmrc（人工浏览器 2FA） |
| `just package-bootstrap <slug>` | 人工首发当前 workspace version |
| `just package-trust <slug>` | 为已存在的 npm 包绑定 GitHub OIDC |
| `just package-baseline <slug> <commit>` | 幂等补齐首发 tag 和 GitHub Release |
| `just package-status <slug>` | 查看 npm 元数据和公开状态 |
| `just package-auth-clean` | 删除临时 npm 登录凭据 |

> 永远不需要手动改 `package.json` 的 version 或写 CHANGELOG——changesets 全部自动处理。

### Agent 非交互写法

Agent 无需交互式 CLI，直接用文件写入工具创建 `.changeset/<描述性名称>.md`：

```markdown
---
"@shelken/pi-dynamic-models": minor
"@shelken/pi-command-history": patch
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

- **public（会发 npm）**：`@shelken/pi-add-dir`、`@shelken/pi-co-authored-by`、`@shelken/pi-command-history`、`@shelken/pi-dynamic-models`、`@shelken/pi-guard`、`@shelken/simple-plannotator`
- **private（只打 tag）**：`pi-auto-model-prompts`

### 首次公开：人工边界与脚本边界

| 事项 | Agent / 脚本 | 人工 |
|---|---|---|
| scope、manifest、README、smoke test、changeset | 可完成 | review |
| npm 名称归属、fork 许可证和版权声明 | 提供证据 | 最终确认 |
| 测试、Gitleaks、tarball 门禁 | `just package-audit` | — |
| npm 登录、首次 publish、Trusted Publisher | 发起命令 | 浏览器 2FA |
| baseline tag / GitHub Release | `just package-baseline` 幂等完成 | — |
| release PR | review diff | 合并或授权 Agent 合并 |

`package-audit` 强制检查 scoped 名称、`private`、LICENSE、`files`、repository、public access、Pi 入口、安装文档、测试和 tarball。具体规则维护在 `scripts/public-package.mjs`，文档不重复 manifest 模板。

首次公开按以下顺序执行，`<slug>` 使用目录名（例如 `pi-auto-model-prompts`）：

```bash
# Agent：修改包并写 changeset 后
just install
just package-audit <slug>
git commit && git push

# 人工：release PR 此时不要 merge
just package-login
just package-bootstrap <slug>
just package-trust <slug>

# Agent：commit 必须是人工 publish 时的源码 commit
just package-baseline <slug> <publish-commit>
just package-status <slug>

# 人工 review 后 merge release PR，验证首个 OIDC patch
just package-status <slug>
just package-auth-clean
```

注意：

- 不要从 monorepo 根运行裸 `npm publish`；脚本始终显式指定 workspace。
- 新包未人工首发时无法绑定 Trusted Publisher，npm 会返回 `E404`。
- `E409` 表示已有唯一绑定，核对现有配置，不要重复创建。
- `npm access get status` 已显示 `public`、但 `npm view` 暂时 404 时，等待 registry 传播，不要重复 publish。
- 每个 npm 包独立绑定 `shelken/pi-extensions` 的 `publish.yml`；CI 不使用 `NPM_TOKEN`。

### 日常发包

首次公开完成后，不再运行 `package-login`、`package-bootstrap`、`package-trust` 或手动创建 tag/Release：

```bash
just changeset
just release-ready
git commit && git push
```

随后 review 并合并 Changesets release PR。workflow 通过 OIDC 自动发布 npm、生成 provenance、打 tag 和建 GitHub Release。发布后可运行：

```bash
just package-status <slug>
```

若 CI 报 `ENEEDAUTH`，检查 `registry-url`、`id-token: write`、npm CLI 版本、Trusted Publisher 和 manifest repository；不要回退到长期 token。

## 配置参考

- changesets 配置：`.changeset/config.json`
- independent mode（`fixed: []`）
- `privatePackages: { version: true, tag: true }`：private 子包也版本化 + 打 tag
- changelog 格式：`@changesets/changelog-github`（带 PR/commit 链接）
