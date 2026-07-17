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

- **public（会发 npm）**：`@shelken/copy-cut`、`@shelken/pi-add-dir`、`@shelken/pi-auto-model-prompts`、`@shelken/pi-co-authored-by`、`@shelken/pi-command-history`、`@shelken/pi-dynamic-models`、`@shelken/pi-guard`、`@shelken/simple-plannotator`
- **private（只打 tag）**：当前无（新建子包默认可先 `private: true`，见根 `AGENTS.md`）

### 首次公开：人工边界与脚本边界

| 事项 | Agent / 脚本 | 人工 |
|---|---|---|
| scope、manifest、README、smoke test | 可完成 | review |
| npm 名称归属、fork 许可证和版权声明 | 提供证据 | 最终确认 |
| 测试、Gitleaks、tarball 门禁 | `just package-audit` | — |
| npm 登录 + 首发（publish+trust+baseline） | 发起一条命令 | 浏览器：login 一次；publish 写操作 OTP 一次（勾选 5 分钟免 2FA） |
| 之后所有版本 | CI OIDC | 只 merge release PR |

`package-audit` 强制检查 scoped 名称、`private`、LICENSE、`files`、repository、public access、Pi 入口、安装文档、测试和 tarball。规则在 `scripts/public-package.mjs`。

#### 为什么 npm 强制要有「人工首发」

Trusted Publisher **只能绑到已存在的包**。新包第一版无法走 CI OIDC，必须本地 auth publish 一次，再绑 `publish.yml`。这是 npm 的限制，不是本仓多此一举。

#### 正确顺序（只应 2 次浏览器：login + 一次写 OTP）

`<slug>` = 目录名 `extensions/<slug>`。manifest `version` 即首发版本（通常 `0.1.0`）。

```bash
# 1) 代码就绪 —— 此时不要写该包的 changeset
just install
just package-audit <slug>
git commit && git push && # merge 到 main

# 2) 人工 / 本机（凭据默认留在 /tmp/.npmrc-user，不要 auth-clean）
just package-login                          # 浏览器 #1：登录
just package-first-publish <slug> <commit>  # publish + trust + baseline
# 浏览器 #2：publish 的写操作 OTP；务必勾选 skip 2FA for 5 minutes
# → trust 应不再弹 OTP；baseline 不需要 npm OTP

just package-status <slug>
```

**禁止**再拆成 `package-bootstrap` → `package-trust` → `package-baseline` 当常规路径（三次敏感操作 = 三次 OTP 体验的来源）。`bootstrap`/`trust`/`baseline` 只保留给排障。

**禁止**首发前给该包写 changeset：

- 旧错误路径：`0.1.0` 人工发 + 初始 minor changeset → release PR 再发 `0.2.0`（双版本、双次发布）。
- 正确：首发不写 changeset；下一笔真实变更再 `just changeset`，只走 CI。

注意：

- 不要从 monorepo 根裸 `npm publish`；始终 workspace / 脚本。
- 新包未首发时 CI `PUT E404` 正常；先 `package-first-publish`，不要指望 release PR  alone 建包。
- 已上架包禁止再 `package-first-publish` / `package-bootstrap`。
- `E409` on trust：绑定已在；用 `npm trust list <name>` 核对，坏了再 `revoke` + `trust`（排障），不要重复 first-publish。
- registry 传播延迟：`first-publish` 会轮询；不要因此重复 publish。
- 每个包独立 Trusted Publisher：`shelken/pi-extensions` + `publish.yml`；CI 无 `NPM_TOKEN`。
- **默认不要** `just package-auth-clean`。只在你明确要删本机临时登录时再跑。

### 日常发包

首发完成后，**只**走 changeset + CI，不要再 login/bootstrap/trust/手动 tag：

```bash
just changeset
just release-ready
git commit && git push
# review 并 merge chore(release) PR
just package-status <slug>   # 可选核对
```

OIDC 成功的标志：`npm view <name> dist.attestations` 有 provenance。若 CI `ENEEDAUTH` / 已上架包 `E404`：查 Trusted Publisher 是否仍绑本仓 `publish.yml`，必要时 `revoke` 后重绑；不要回退长期 token，不要每次人工 publish。

### CI 发布失败排查

`changeset publish` 按包依次发布；**中间某个失败时，前面已成功的包不会回滚**。处理前先对照 npm 与本地 version：

```bash
# 各子包 local vs npm
for d in extensions/*/; do
  name=$(jq -r .name "$d/package.json")
  echo "$name local=$(jq -r .version "$d/package.json") npm=$(npm view "$name" version 2>&1 | tail -1)"
done
gh run list --workflow=publish.yml --limit 5
```

| 现象 | 常见含义 | 处理 |
|---|---|---|
| 新包 `PUT` / `E404` | 尚未人工首发，或 Trusted Publisher 未绑定 | 走上文「首次公开」；不要指望 release PR  alone 首发 |
| **已上架包** `PUT ... E404` | npm 常把 **OIDC/Trusted Publisher 鉴权失败** 伪装成 404，不等于包不存在 | 核对该包 Trusted Publisher 是否仍绑 `shelken/pi-extensions` + `publish.yml`；不要 bootstrap |
| 同 job 多数成功、单包失败 | 按包独立鉴权，只补失败包 | 见下「补发」 |
| `E409` on trust | 绑定已存在 | 改 npm 控制台现有绑定，勿重复创建 |
| CI 已发 npm、无 tag/Release | publish 中断在 tag 步骤，或只人工补了 npm | `just package-baseline <slug> <publish-commit>` |

**补发已上架但 CI 漏掉的版本**（仅止血；先修 Trusted Publisher）：

```bash
# 若 login 文件还在可跳过 login
just package-login   # 仅当 /tmp/.npmrc-user 不存在
npm publish --workspace=@shelken/<name> --access public --userconfig /tmp/.npmrc-user
just package-baseline <slug> <publish-commit>
# 不要默认 auth-clean
```

- 补发前确认 npm 尚无该 version。
- 补发不替代修 OIDC：`npm trust list` → 坏则 `revoke` + `package-trust`；验证下次 CI 带 provenance。
- 成功包有 `dist.attestations.provenance`；从未有 provenance 的包 = OIDC 一直没通。

## 配置参考

- changesets 配置：`.changeset/config.json`
- independent mode（`fixed: []`）
- `privatePackages: { version: true, tag: true }`：private 子包也版本化 + 打 tag
- changelog 格式：`@changesets/changelog-github`（带 PR/commit 链接）
