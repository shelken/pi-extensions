# changeset 指向私有根包导致发布 CI 全线失败

**日期**: 2026-08-14
**影响**: pi-extensions 的 Publish workflow(changesets/action)自 2026-08-13 起所有运行在 version 步骤失败,release PR #41 停更,pi-co-authored-by 双写修复(0.2.11)等所有新 changeset 都无法进入发布流程,阻塞约 1 天。
**发现人**: shelken

## 问题

`.changeset/deprecate-pi-title.md` 的包名写成了 `@shelken/pi-extensions`(根 package.json 的 name,`private: true`)。changesets 的 workspace 只包含 `extensions/*` 子包,不包含私有根包,导致 `changeset version` 在 `getRelevantChangesets` 阶段抛 `mapGetOrThrow` 异常,整个 workflow 失败。一个坏 changeset 阻塞了所有包的发布。

## 现象

Publish workflow 失败日志:

```text
🦋 error Error: Found changeset deprecate-pi-title for package @shelken/pi-extensions which is not in the workspace
🦋     at mapGetOrThrow (.../changesets-assemble-release-plan/...)
🦋     at getRelevantChangesets (...)
🦋     at Object.assembleReleasePlan [as default] (...)
```

release PR #41 停留在 2026-08-11 的 stale 状态(created 8/10、updated 8/11),之后 push 到 main 的 changeset 全部不再出现在 PR 里。

## 根因

**错误假设**:认为根包的 `name`(`@shelken/pi-extensions`)可以在 changeset 中引用并参与版本发布。

**实际约束**:
- changesets 只识别 workspace 成员包(`extensions/*`),根包 `private: true` 且不在 workspace 包集合内,引用它必然在 assemble-release-plan 阶段抛错
- changesets/action 失败是**整个 workflow 失败**,不存在"跳过坏 changeset"的容错,一个坏文件阻塞所有包

**缺失检查点**:
- 提交 changeset 后没有立即验证(本地 `changeset version --dry-run` 或观察 CI)
- 8/13 之后 push 时未检查 Publish workflow 是否成功,坏 changeset 静默累积

## 修复

把 `.changeset/deprecate-pi-title.md` 的包名从 `@shelken/pi-extensions` 改为实际受影响的包 `@shelken/pi-title`(弃用动作的真实载体),提交 1cf702f 后 push,CI 恢复,PR #41 更新并 merge,三个包一次发布(pi-title 0.3.0、pi-dynamic-models 0.2.3、pi-co-authored-by 0.2.11)。

## 预防

- 提交任何 changeset 后立即本地验证:在仓库根跑 `bunx changeset version --dry-run`,报错当场修,不留给 CI
- changeset 的包名只能写 workspace 成员包(`extensions/*`),禁止写私有根包
- push 到 main 后观察当次 Publish workflow 结果,失败立刻处理;release PR 超过 1 天未更新视为发布链路故障信号
