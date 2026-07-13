# pi-auto-model-prompts

按模型 ID 注入本地 Markdown 作为额外 system prompt。

## 目录结构

`index.ts`: 扩展入口
`config-paths.test.ts`: 配置路径相关测试（与入口同级）
`package.json` / `README.md` / `CHANGELOG.md` / `LICENSE`: 包元数据与说明

## 开发注意事项

- 配置目录与 prompt 文件目录不是同一路径：配置在 `extensions/pi-auto-model-prompts/`，prompt 在 `auto-model-prompts/`

## 基本约束

（暂无已确认条目。新增须用户确认后再写入。）
