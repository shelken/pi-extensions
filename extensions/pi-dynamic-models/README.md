# pi-dynamic-models

自动发现已配置 provider 的远端模型，并用 models.dev registry 补全上下文窗口、输出上限、推理能力和输入模态。

## 安装

本插件作为 `pi-extensions` mono repo 的子包维护。通常只需要把仓库根目录作为 Pi package 加到 `settings.json` 的 `packages`，由根 `package.json` 的 `pi.extensions` 加载本插件入口。

```json
{
  "packages": ["/path/to/pi-extensions"]
}
```

修改 `settings.json` 后，在 Pi 中 `/reload` 即可加载。

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

- 启动时读取 Pi 的 `models.json`，只处理 `enableProviders` 中列出的 provider。
- 远端模型列表来自 provider 的 `baseUrl + /models`，provider 域名、API key 和 API 类型都来自 `models.json`。不在插件内硬编码 provider 地址。
- 只新增 `models.json` 中未手动定义的模型，不覆盖已有模型。
- 自动发现的模型名统一追加 `(AUTO)`。
- registry 和远端模型列表只缓存 raw 数据，不缓存最终匹配结果。
- registry 缓存 6 小时内直接使用本地文件，避免启动时等待网络 ETag 请求。
- provider 远端模型列表缓存 10 分钟内直接复用，跳过启动时的网络请求；多 provider 并发请求。
- 匹配算法先归一化模型名，再统一收集候选，最后按模型家族偏好、路由提示和完整对齐程度选最优。

## 运行时文件

```text
~/.pi/agent/cache/models-registry.json          # models.dev registry 缓存
~/.pi/agent/cache/provider-models/<provider>.json # provider 远端模型 ID 列表缓存
~/.pi/agent/logs/pi-dynamic-models.log          # 扩展日志
```

`debug=false` 时日志仍写入文件，但不会输出到 console。
