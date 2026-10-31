# pi-co-authored-by

agent 用 bash 跑 `git commit` 时，自动追加 trailer：

```text
Co-Authored-By: <model> <noreply@pi.dev>
Generated-By: pi <version>
```

实现：识别 bash 命令中直接执行的 `git commit`（支持常见前缀与组合，脚本内间接 commit 不算），把整条命令交给外部 runner；runner 用环境变量 `GIT_CONFIG_COUNT/KEY_n/VALUE_n` 把 `core.hooksPath` 指向会话临时目录，目录里每个 Git hook 都是转发器：`prepare-commit-msg` 先写 trailer，转发器再把指向插件临时目录的 `core.hooksPath` 槽位中性化，据此解析出用户真实的 hooks 目录并执行同名原 hook。`git` 在哪个仓库、经哪种形态（`-C`、`--git-dir`、`command git`、绝对路径、`exec`、shell 分组）执行都读到同一份配置，且不向用户仓库安装或修改任何东西。非 commit 命令原样放行，不影响其他扩展。

初始 fork 自 [bruno-garcia/pi-co-authored-by](https://github.com/bruno-garcia/pi-co-authored-by)。

## 功能

- 只挂钩 `bash` 工具调用
- 只处理直接执行的 `git commit`；`printf`、`git status`、脚本内 commit 等一律不改
- 模型名取当前 session；没有则 `unknown`
- 与仓库已有 hook 兼容：先写 trailer，再转发执行原 hook（`pre-commit`、`commit-msg`、`pre-push` 等都会照常运行）

## 已知限制

- 作用范围是按进程树，不按仓库：被识别为 commit 的命令里所有子进程都会继承配置，例如同一条命令中在临时仓库提交也会带上 trailer
- 命令里自带 `-c core.hooksPath=<dir>` 时，按 Git 配置优先级会覆盖本插件的设置：此时只运行该目录的用户 hook，不写 trailer
- `GIT_CONFIG_COUNT` 不是规范值（前导空格、位数过多、非数字等）时不做任何注入，交给 git 自己处理，此时不写 trailer
- 命令识别器不展开参数，`${x:-; #}` 这类展开内含 `;`/换行的少见写法可能漏判

## 安装

```bash
pi install npm:@shelken/pi-co-authored-by
```

装好后 `/reload`。之后 agent 提交即可，无需额外命令。

## 配置

无配置文件。

## 验证

```bash
bun --filter @shelken/pi-co-authored-by test
```
