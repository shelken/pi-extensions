## 约定

- pi core 依赖使用 `@earendil-works/*`, 版本统一用 `*`, 标为 optional peerDependencies
- 扩展 factory 禁网络请求和同步 IO, 耗时工作移 `session_start`
- 提交前运行 `just verify`
- 使用 justfile 管理开发命令, 新增命令统一放 justfile
- 使用 mise 管理不在系统的 CLI; bun/node 复用系统
- 文档不写绝对路径, 用 `{pi-agent-dir}` 等变量指代
- 如果想要测试pi插件, 先检查模型(使用mini/nano/flash/free等便宜经济的模型),`pi --list-models | grep -Ei '\-flash|\-mini|\-nano|free'`,优先使用free, 然后测试模型`pi --model opencode/deepseek-v4-flash-free --thinking high --no-session --no-context-files --no-approve --no-skills -p "say hi"`
