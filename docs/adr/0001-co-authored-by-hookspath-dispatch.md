---
status: accepted
date: 2026-11-01
---

# pi-co-authored-by 用进程级 hooksPath + 全量转发 hook 注入 trailer

pi-co-authored-by 只给被识别为提交的 bash 命令加环境变量：`GIT_CONFIG_COUNT/KEY_n/VALUE_n` 把 `core.hooksPath` 指到会话临时目录。目录里每个 Git hook 都是转发器：`prepare-commit-msg` 先写 trailer，转发器再把指向插件临时目录的 `core.hooksPath` 槽位改成无害的 key（保持顺序与计数，其它条目不动），据此解析出用户真实的 hooks 目录并执行同名 hook。这样，git 在哪个仓库、经哪种调用形态（`-C`、`--git-dir`、`command git`、绝对路径、`exec`、shell 分组）执行，都会读到同一份配置，插件不用猜，也不改用户仓库。

## Considered Options

- **解析命令并注入 `git()` shell 函数**（0.2.5 及以前；0.2.9–0.2.16 仍靠它补装 hook）：`rtk`、绝对路径、`command git`、`git -C` 等形态会持续绕过函数，只能逐个补丁（#96）。
- **临时把 `prepare-commit-msg` 装进真实 hooks 目录**（0.2.9–0.2.16）：安装位置靠 runner 按当前目录猜测，和 git 实际使用的仓库可能不同；还需要 pid 引用计数处理并发 shell，`exec` 会跳过 EXIT 清理，留下 hook。
- **进程级 hooksPath，临时目录只放 `prepare-commit-msg`**（0.2.6–0.2.8）：仓库原有的 `pre-commit`、`commit-msg`、`pre-push` 等 hook 全部被跳过。0.2.9 当时为此放弃 hooksPath，本决定用全量转发修掉这个问题，没有放弃 hooksPath。

## Consequences

- 作用范围按**进程树**，不按仓库。被识别为提交的命令里，所有子进程都会继承这些变量，例如同一条命令里的测试在临时仓库提交，也会带上 trailer。
- 同一条命令里执行 `git config --get core.hooksPath`，读到的是临时目录。转发器会把插件自己的槽位中性化后再执行用户 hook，所以用户 hook 及其子进程读到的是真实值。
- 命令里自带 `-c core.hooksPath=X` 时，按 Git 配置优先级，`-c` 会覆盖本插件的设置。此时只执行用户 hook，不写 trailer。
- `GIT_CONFIG_COUNT` 不是规范值（前导空格、位数过多、非数字）时不注入配置，因此不写 trailer，交给 git 自己处理。
- 不生成 `push-to-checkout` 和 `proc-receive` 两个转发器。这两个 hook 一旦存在，就会改变接收端行为。
