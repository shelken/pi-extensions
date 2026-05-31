# Repository Guidelines

## 必做维护

- 新增、移除或改名子 package 时，同步更新根 `README.md` 表格和根 `package.json` 的 `pi.extensions`。
- 子 package 如果来自 fork，必须在该子包 `README.md` 标明原始仓库链接。
- 从独立仓库迁入后，验证通过再归档旧 GitHub 仓库；不要先归档。
- 只迁移当前 `settings.json` 中启用且明确决定继续使用的扩展；待议项目保持独立。

## 迁移流程

1. 复制当前已审阅的源仓库内容到 `extensions/<package>`，排除 `.git`、`node_modules`、`dist`、lockfile 和临时文件。
2. 修正 pi 运行所需入口、依赖包名和根 `package.json` 的 `pi.extensions`。
3. 从 pi settings 移除旧 package/extension 入口，保留 mono repo 入口。
4. 运行精准验证；通过后提交、推送，再归档旧仓库。

## 统一规范

- 保持修改范围小；不做顺手重构。
- 文档不写本机绝对路径、账号、token 或隐私信息。
- pi core 依赖使用 `@earendil-works/*` 和 `typebox`，不要重新引入旧 `@mariozechner/*` 或 `@sinclair/typebox`。
- pi core/typebox 运行依赖只写在子包 `peerDependencies`，版本统一用 `*`，并在 `peerDependenciesMeta` 标为 optional。
- pi core/typebox、TypeScript、Vitest、ESLint 等开发依赖统一放根 `devDependencies`，使用精确版本；子包不重复声明 devDeps。
- 子包如有真实运行依赖，保留在该子包 `dependencies`，不要提升到根目录伪共享。
- 更新依赖使用根脚本 `bun run deps:update`；想先检查时用 `bun run deps:update:dry`，不要手写一串包名逐个升级。
- fork 子包尽量保留原结构；只做当前 pi 版本兼容和本人需要的行为改动。
- 提交前至少运行 `bun run verify`；只改单个子包时可追加对应 `bun --filter <package> test`。
