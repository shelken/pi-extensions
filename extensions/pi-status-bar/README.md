# pi-status-bar

编辑器上方一行状态条，下方一行上一条提示。不替换编辑器，编辑器边框行首没有多余空格。

```text
  Sonnet 5.5  think:high   pi-extensions   main *2 ?1   169k/1.0M (16.9%)    8.4M  $1.93
────────────────────────────────────────────────────────
> 编辑器
────────────────────────────────────────────────────────
 ↳ 上一条提示
```

## 安装

```bash
pi install npm:@shelken/pi-status-bar
```

装好后 `/reload`。图标是 Nerd Font 码位，终端字体需带 Nerd Font。

## 上游

外观参照 [nicobailon/pi-powerline-footer](https://github.com/nicobailon/pi-powerline-footer)（MIT，作者 Nico Bailon）。本包只覆盖状态条与上一条提示两部分，代码为重写，配色值、图标码位等数据取自上游。

### 相对上游保留

- 段的顺序：模型、思考档、目录名、git、上下文、缓存读、费用
- 图标与分隔：Nerd Font 码位，段间用 powerline 细分隔符
- 配色：沿用上游 `theme.json` 里的 catppuccin 配色
- 思考档：`high`、`xhigh`、`max` 逐字彩虹，`min`、`low`、`med` 用 pi 主题色
- 上下文：显示 `已用/窗口 (百分比)`，超过 70% 转黄，超过 90% 转红
- git：干净为绿，有改动为黄，后缀 `*未暂存 +已暂存 ?未跟踪`
- 模型名去掉 `Claude ` 前缀；缓存读与费用为 0 时不显示
- 编辑器下方的 `↳ 上一条提示`：压缩空白、单行截断、灰色

### 相对上游修改

- 不接管编辑器：状态条是编辑器上方的 widget，上一条提示是编辑器下方的 widget。上游自定义编辑器会在边框行首硬编码一个空格，导致按行首匹配边框的外部工具（如 herdr 的 pi 屏幕规则）失效
- 内置 footer 的 pwd 与 token 行与状态条重复，改为只显示其他扩展通过 `setStatus` 写入的状态，并借 footer 数据取 git 分支
- 上一条提示取自会话分支与 `message_start`，切换会话或分支后自动对应
- git 状态由 `git status --porcelain=v1` 异步刷新：启动、每轮结束、分支变化时各一次
- 费用固定显示美元，不做汇率换算
- 配色与图标写死在代码里，没有 `theme.json`、预设和分隔符选项
- 没有上下文后面的自动压缩图标

## 配置

无配置文件。要改配色或图标，编辑 `src/format.ts` 顶部的常量。

## 验证

```bash
bun --filter @shelken/pi-status-bar test
```
