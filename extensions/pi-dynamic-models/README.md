# pi-dynamic-models

从已配置 provider 拉远端模型列表，用 models.dev 补全上下文窗口、输出上限、推理与输入模态；只注册 `models.json` 里还没有的模型，名称带 `(AUTO)`。

## 功能

- 读 `{pi-agent-dir}/models.json` 的 `baseUrl` / `apiKey` / `api`，请求 provider 的 `/models`
- 不覆盖手动模型；registry 缓存 6h，provider 列表缓存 10min
- factory 同步用磁盘 cache 先注册 AUTO 模型（让 session restore 能找到上次的 `provider/id`）；`session_start` 再拉网刷新
- 日志始终写文件；`debug` 时再打 console

运行时文件：

```text
{pi-agent-dir}/cache/models-registry.json
{pi-agent-dir}/cache/provider-models/<provider>.json
{pi-agent-dir}/logs/pi-dynamic-models.log
```

## 安装

```bash
pi install npm:@shelken/pi-dynamic-models
```

装好后写配置并 `/reload`。

## 配置

路径（项目覆盖全局；**无配置文件则直接跳过**）：

```text
.pi/extensions/pi-dynamic-models/config.json
{pi-agent-dir}/extensions/pi-dynamic-models/config.json
```

```json
{
  "enable": true,
  "enableProviders": ["openrouter"],
  "debug": false
}
```

| 字段 | 默认 | 作用 |
|---|---|---|
| `enable` | 无（缺省视为关） | 为 `true` 才跑发现 |
| `enableProviders` | 无（空则跳过） | 要发现的 provider 名，须已在 `models.json` |
| `debug` | `false` | 是否额外打 console 日志 |

## 验证

```bash
bun --filter @shelken/pi-dynamic-models test
```
