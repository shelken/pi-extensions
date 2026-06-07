# co-authored-by 与 pi-rtk-optimizer 交互导致 trailers 丢失

**日期**: 2026-06-08
**影响**: pi-co-authored-by 插件在 pi-rtk-optimizer 启用时完全失效，所有 git commit 均无 Co-Authored-By/Generated-By trailer
**发现人**: shelken

## 问题

pi-co-authored-by 插件通过注入 `git()` shell 函数拦截 `git commit` 并追加 trailer。pi-rtk-optimizer 会把 `git commit` 改写为 `rtk git commit`，`rtk` 是外部二进制，`git()` wrapper 拦截不到，导致 trailer 丢失。

## 现象

```bash
# pi-rtk-optimizer 启用时
git commit -m "test"
# 实际执行: rtk git commit -m "test"
# 结果: 无 trailer

# pi-rtk-optimizer 禁用时
git commit -m "test"
# 结果: 有 trailer ✅
```

## 根因

1. RTK 改写复合命令时会给**所有** `git` 调用加 `rtk` 前缀（`rtk git add . && rtk git commit`），不只是 `git commit`
2. 最初修复用 `cmd.replace(regex, replacement)` 只替换第一个匹配，漏掉了后续的 `rtk git commit`
3. 调试过程中反复加/删 debug 日志、要求用户重启，浪费大量时间；应该一开始就用隔离测试复现完整链路

## 修复

1. `containsGitCommit` regex 增加 `(?:rtk\s+)?` 可选前缀，匹配 `rtk git commit`
2. `wrapGitWithTrailers` 用 `cmd.replaceAll(/(^|[;&|\n\s])rtk\s+git\b/g, "$1git")` 去掉所有 `rtk git` 前缀
3. 新增 26 个测试覆盖 RTK 重写、复合命令、heredoc 等场景

## 隔离复现命令

```bash
cd {repo-root} && bun -e "
const {execFileSync} = require('child_process');
const {wrapGitWithTrailers, containsGitCommit} = require('./extensions/pi-co-authored-by/lib/commit.ts');

const llmCmd = 'cd /tmp/test-fix && echo t >> a.txt && git add a.txt && git commit -m \"test\"';
let rtkCmd;
try { rtkCmd = execFileSync('rtk', ['rewrite', llmCmd], {encoding:'utf8'}).trim(); } catch(e) { rtkCmd = e.stdout?.trim() || llmCmd; }
const wrapped = wrapGitWithTrailers(rtkCmd, 'TEST', '0.0.0');
execFileSync('bash', ['-c', wrapped], {cwd:'/tmp/test-fix', stdio:'ignore'});
const msg = execFileSync('git', ['log', '-1', '--format=%B'], {cwd:'/tmp/test-fix', encoding:'utf8'});
console.log(msg.includes('Co-Authored-By') ? 'YES' : 'NO');
"
```

## 预防

- 涉及 shell 命令字符串替换时，用 `replaceAll` 而非 `replace`，除非明确只需要替换第一个
- 调试插件交互问题时，先用 `bun -e` 模拟完整链路（RTK 改写 → 插件包装 → bash 执行），不要反复要求用户重启 pi 加 debug 日志
- `execFileSync` 遇到非零 exit code 会 throw，需要 catch 后从 `e.stdout` 读取输出（exit 3 = RTK 改写成功）
