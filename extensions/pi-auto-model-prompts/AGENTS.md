# pi-auto-model-prompts

按模型 ID 注入本地 Markdown 作为额外 system prompt。

## 目录结构

`index.ts`: 扩展入口
`config-paths.test.ts`: 配置路径相关测试（与入口同级）
`package.json` / `README.md` / `CHANGELOG.md` / `LICENSE`: 包元数据与说明

## 开发注意事项

- 运行期不读宿主配置目录：配置在 `{cwd}/.agents/pi-auto-model-prompts/config.json`（项目覆盖全局）与 `~/.agents/pi-auto-model-prompts/config.json`，prompt 是同目录下的 `AGENTS.<matcher>.md`。此路径与本仓 `{pi-agent-dir}/extensions/` 惯例不同，改动前先确认

## 基本约束

（暂无已确认条目。新增须用户确认后再写入。）
