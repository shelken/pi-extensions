# Repository Guidelines

## 必做维护

- 新增、移除或改名子 package 时，同步更新根 `README.md` 表格、根 `package.json` 的 `pi.extensions`。
- 每次有发布意义的变更写 changeset 声明（`.changeset/*.md`）：子包行为、配置路径、公开入口或兼容性发生变化时；只改测试/文档且不影响发布内容时写空 changeset 或不写。详见 `docs/versioning.md`。
- 子 package 如果来自 fork，必须在该子包 `README.md` 标明原始仓库链接。
- 更新文档时，优先只关注自管插件；fork 插件只更新本仓库自己修改过的行为、兼容性或安装差异，不重写上游通用文档。
- 从独立仓库迁入后，验证通过再归档旧 GitHub 仓库；不要先归档。
- 只迁移当前 `{pi-agent-dir}/settings.json` 中启用且明确决定继续使用的扩展；待议项目保持独立。

## 迁移流程

1. 复制当前已审阅的源仓库内容到 `extensions/<package>`，排除 `.git`、`node_modules`、`dist`、lockfile 和临时文件。
2. 修正 pi 运行所需入口、依赖包名和根 `package.json` 的 `pi.extensions`。
3. 从 pi settings 移除旧 package/extension 入口，保留 mono repo 入口。
4. 运行精准验证；通过后提交、推送，再归档旧仓库。

## 统一规范

- 所有子包默认 `private: true`；准备发布到 npm 时去掉该字段，加上 `@shelken/` scope 和 `publishConfig.access: public`。
- 发布通过 changesets 管理（`.changeset/`）：push 到 main 后 workflow（`.github/workflows/publish.yml`）自动开 release PR，merge 后发布 public 子包到 npm（带 provenance）并打 tag。
- 所有插件配置文件没有特殊原因时，统一读取全局 `{pi-agent-dir}/extensions/<package>/config.json` 和项目级 `.pi/extensions/<package>/config.json`；项目级同名字段覆盖全局字段。
- 保持修改范围小；不做顺手重构。
- 扩展 factory 禁网络请求和同步 IO，耗时工作移 `session_start`。
- 文档不写本机绝对路径,用变量指代例如`{pi-agent-dir}`、账号、token 或隐私信息。
- pi core 依赖使用 `@earendil-works/*` 和 `typebox`，不要重新引入旧 `@mariozechner/*` 或 `@sinclair/typebox`。
- pi core/typebox 运行依赖只写在子包 `peerDependencies`，版本统一用 `*`，并在 `peerDependenciesMeta` 标为 optional。
- pi core/typebox、TypeScript、Vitest、ESLint 等开发依赖统一放根 `devDependencies`，使用精确版本；子包不重复声明 devDeps。
- 子包如有真实运行依赖，保留在该子包 `dependencies`，不要提升到根目录伪共享。
- 更新依赖使用根脚本 justfile
- fork 子包尽量保留原结构；只做当前 pi 版本兼容和本人需要的行为改动。
- 提交前至少运行 `just verify`；只改单个子包时可追加对应 `bun --filter <package> test`。
- CHANGELOG 分散到各子包，由 changesets 自动生成；每项禁止长文本解释内容, 保持简洁
- 使用justfile统一流程, 所有新增的开发命令/测试命令, 全部放justfile; 同样的命令使用参数控制并注释简洁说明
- 使用mise管理所有**不在系统**的cli/tools
- python相关用uv(禁止pip); node/ts 相关用bun
- 跟特定子包相关的justfile放在特定子包目录下
- 新建新的插件时 使用 `nix flake new extensions/{new-extension} -t github:shelken/nix-templates#pi-extension`
- 如果想要测试pi插件, 先检查模型(使用mini/nano/flash/free等便宜经济的模型),`pi --list-models | grep -Ei '\-flash|\-mini|\-nano|free'`,优先使用free, 然后测试模型`pi --model opencode/deepseek-v4-flash-free --thinking high --no-session --no-context-files --no-approve --no-extensions --no-skills -p "say hi"`
