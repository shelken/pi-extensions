# pi-background-lean（弃用）

**此包已弃用、不再维护，入口已从根 `package.json` 的 `pi.extensions` 移除，请直接用 [pi-background](https://github.com/pringled/pi-extensions/tree/main/packages/pi-background)。** 压短后的规则缺了「可以结束回合等通知」「输出已在任务日志里」，模型改成自己重定向日志、`sleep` 后再读。用 `claude-sonnet-5-5` 复测，每次请求只省 795 tokens（上游 +1417，本包 +622），按缓存读价不到 $0.0001。一个 203 次请求的会话共省 $0.016，而多出的 9 次 sleep 往返花了 $0.20。

[pi-background](https://github.com/pringled/pi-extensions/tree/main/packages/pi-background) 的 lean 包装。执行、投递、UI、`/bg` 命令全部沿用上游，只精简模型每次请求都会看到的工具描述、参数描述和规则。

| | 每次请求固定占用 |
|---|---:|
| `pi-background@0.4.4` | +965 tokens |
| `@shelken/pi-background-lean` | +417 tokens |

测量：仓库根 `just pi-context ext`，相对只有 read/bash/edit/write 的空载。

## 安装

```bash
pi install npm:@shelken/pi-background-lean
```

不要与 `pi-background` 同时加载：两者注册同名工具。

## 做法

用 `Proxy` 包住传给上游工厂的 `pi`，在 `registerTool` 时按工具名替换模型可见文字：

- `bg_run`：描述、参数描述，10 条规则合成 1 条
- `bg_status` / `bg_kill`：只缩参数描述
- `bash`：只替换上游追加的「超过 120 秒自动转后台」那条规则，内置 bash 规则原样保留

## 升级上游

上游锁定精确版本。升级时：

1. 对照上游 `extensions/background.ts` 的 `registerTool`，确认工具名、参数与行为没变；变了就同步 `src/index.ts` 里的文字
2. 跑子包测试，再用 `just pi-context ext` 复测占用，更新上表
