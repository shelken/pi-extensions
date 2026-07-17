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
- `.github/workflows/publish.yml`：OIDC，`id-token: write`，无 token
- `scripts/public-package.mjs` / `just package-*`：首发与门禁
