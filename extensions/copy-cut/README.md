# copy-cut

`alt+shift+x` 把当前输入框文本剪切到系统剪贴板。

## 功能

| 类型 | 名称 | 作用 |
|---|---|---|
| 快捷键 | `alt+shift+x` | 剪切输入框全文到剪贴板并清空输入框 |

空输入时无操作、无提示。

除 `registerShortcut` 外，还用 `onTerminalInput` 兼容：

- Kitty CSI-u / modifyOtherKeys
- legacy `ESC`+`X`
- macOS Option+Shift+x 字符 `˛`

## 安装

```bash
pi install npm:@shelken/copy-cut
```

或把 monorepo 根目录加到 `{pi-agent-dir}/settings.json` 的 `packages`（见根 README）。

## 配置

无配置文件。快捷键写死为 `alt+shift+x`。

若同时装了 powerline-footer，建议关掉其 cut，避免抢键：

```json
{
  "powerlineShortcuts": {
    "cutEditor": null
  }
}
```
