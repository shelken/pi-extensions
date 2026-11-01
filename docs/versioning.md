# 版本管理

**依据：** [changesets](https://github.com/changesets/changesets) independent mode；根包不发布；子包独立 semver + 各包 `CHANGELOG.md`；public 经 CI OIDC（Trusted Publisher），无 `NPM_TOKEN`。

**清单：** public = 有 `publishConfig.access: public` 的 `@shelken/*`；private = 其余（只 version/tag，不发 npm）。

---

## 日常（已上架包）

```bash
# 改代码后
just changeset          # 选包 + major/minor/patch
just release-ready      # 可选
git commit && git push  # merge 到 main
# review 并 merge chore(release) PR
just package-status <slug>   # 可选
```

**依据：** release PR merge 后 `publish.yml` 用 OIDC 发 npm、provenance、tag、GitHub Release。

**changeset：** 行为 / 配置路径 / 公开入口 / 兼容性有变才写；纯 docs/refactor/chore 不写。

| commit | bump |
|---|---|
| `feat` | minor |
| `fix` / `perf` | patch |
| `!` / `BREAKING CHANGE` | major |

---

## 首次公开（新 public 包）

**依据：** npm 要求包先存在才能绑 Trusted Publisher → 第一版只能本地 auth；之后只走 CI。

```bash
# 1) 代码：version=0.1.0，此时不要写该包 changeset
just install
just package-audit <slug>
git commit && git push   # merge main

# 2) 本机（/tmp/.npmrc-user 默认保留）
just package-login
just package-first-publish <slug> <publish-commit>
# 浏览器：login 一次；publish 写 OTP 一次并勾选 skip 2FA for 5 minutes

just package-status <slug>
```

**禁止：** 拆 `bootstrap`/`trust`/`baseline` 当常规路径；首发前写 changeset（会再顶一版）；默认 `package-auth-clean`。

**排障子命令：** `package-bootstrap` / `package-trust` / `package-baseline` / `package-auth-clean` 仅手动排障用。

---

## 发布失败

```bash
# 状态
npm view @shelken/<name> version
npm view @shelken/<name> dist.attestations   # 有值 = OIDC 成功
export NPM_CONFIG_USERCONFIG=/tmp/.npmrc-user
npm trust list @shelken/<name>
gh run list --workflow=publish.yml --limit 5
```

| 现象 | 处理 |
|---|---|
| 新包 `E404` | 走「首次公开」 |
| 已上架 `E404` | OIDC 鉴权失败伪装；`trust list` → 必要时 `npm trust revoke` + `just package-trust <slug>`，不要 bootstrap |
| 同 job 单包失败 | 只处理失败包 |
| trust `E409` | 绑定已在，改现有配置勿重复创建 |
| npm 有版、无 tag/Release | `just package-baseline <slug> <commit>` |

**补发（仅止血，先修 trust）：**

```bash
# 无 /tmp/.npmrc-user 时才 login
just package-login
npm publish --workspace=@shelken/<name> --access public --userconfig /tmp/.npmrc-user
just package-baseline <slug> <publish-commit>
```

---

## 踩坑

- changeset 已被 release 消费却仍在 feature 分支 → 合 main 时对冲突文件接受删除。
- 同 job 多包有的成功有的失败 → 只处理失败包，已成功的不用重发。
- 已上架包 CI `E404` → 修 Trusted Publisher（必要时 revoke 重绑），不要 bootstrap。
- `trust list` 看着对但 OIDC 仍挂 → revoke 后重绑，用 provenance 验收。
- 无 `dist.attestations` → 当人工/非 OIDC 发布处理，下版靠修好的 CI。
- 首发 OTP 弹多次 → 只用 `package-first-publish`，publish 时勾 5 分钟免 2FA。
- 首发前写了 changeset → 删掉或等首发完成后再写，避免双版本。
- 登录后又被 auth-clean → 默认保留 `/tmp/.npmrc-user`，除非主动要清。
- baseline 报版本不存在 / Release 超时 → 等 registry 传播后重试，勿重复 publish。

---

## 配置

- `.changeset/config.json`：independent、`privatePackages` version+tag、`@changesets/changelog-github`
- `.github/workflows/ci.yml`：PR 与 push 门禁，经 `jdx/mise-action` 还原 `.mise.toml` 执行 `just verify`；支持 `workflow_dispatch`，供 `GITHUB_TOKEN` 产生的提交补跑
- `.github/workflows/publish.yml`：OIDC 发包，经 `jdx/mise-action` 还原工具链，`changesets/action` 驱动发布；release PR 创建或更新后派发一次 CI
- `.github/workflows/renovate-changeset.yml`：Renovate PR 自动生成补齐依赖 changeset，补完后派发 CI
- `renovate.json`：依赖升级规则，见下「依赖更新」
- `scripts/public-package.mjs` / `just package-*`：首发与门禁

## 依赖更新

- 工具链版本只写在 `.mise.toml`：bun 精确版本由 Renovate 升级；node 保持 `"24"`，只在出现新 major 时提 PR（minor/patch 被禁用，否则 Renovate 会把 `"24"` 改写成精确版本）。`publish.yml` 的 `setup-node` 读同一个文件
- 通常每周一只有 2 个非 major 分组 PR 并自动合并：`renovate/infra`（Actions、mise 工具链、devDependencies，含 pi-core）与 `renovate/runtime`（发布到 npm 的 runtime 依赖）。major 单独成 PR，人工合并；同一 monorepo 的 major（如 oxlint 与 `@oxlint/plugins`）由预设放进同一个 PR，因为它们必须一起升
- runtime 依赖自动合并后会生成 changeset 并累积到 `chore(release)` PR；该 PR 保持人工合并，合并即发布 npm
- 自动合并由 Renovate 自己等检查通过后执行。不给 main 设「必过检查」的 ruleset：`workflow_dispatch` 产生的检查不出现在 PR 检查区，也满足不了 ruleset 的必过检查，会让 runtime 组和 release PR 永远被挡住。`GITHUB_TOKEN` 推送的提交和创建的 PR 不触发 `pull_request` CI，所以补 changeset 与创建 release PR 后用 `workflow_dispatch` 补跑，让 head 上有 Renovate 能读到的检查
- Action 引用写 `SHA # vN`（只写 major），摘要由 Renovate 维护
- `typebox` 不交给 Renovate：根版本必须等于宿主 `pi-coding-agent` 声明的版本，由 `scripts/host-typebox.node-test.mjs` 校验；宿主升级导致它失败时手动同步
