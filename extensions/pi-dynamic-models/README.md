# pi-dynamic-models

自动发现已配置 provider 的远端模型，并用 models.dev registry 补全上下文窗口、输出上限、推理能力和输入模态。

## 配置

配置文件位置：

- 全局：`~/.pi/agent/extensions/pi-dynamic-models/config.json`
- 项目级：`.pi/extensions/pi-dynamic-models/config.json`

项目级配置会覆盖全局配置中的同名字段。

配置内容：

```json
{
  "enable": true,
  "enableProviders": ["provider-name"],
  "debug": false
}
```

字段说明：

- `enable`：是否启用扩展。
- `enableProviders`：要自动发现模型的 provider 名称，必须已经存在于 Pi 的 `models.json`。
- `debug`：是否同时输出调试日志到 console；日志文件始终写入。

## 行为

- 只新增 `models.json` 中未手动定义的模型，不覆盖已有模型。
- 自动发现的模型名统一追加 `(AUTO)`。
- registry 和远端模型列表只缓存 raw 数据，不缓存最终匹配结果。
- registry 缓存 6 小时内直接使用本地文件，避免启动时等待网络 ETag 请求。
- 匹配算法先归一化模型名，再统一收集候选，最后按模型家族偏好、路由提示和完整对齐程度选最优。
