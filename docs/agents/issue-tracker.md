# Issue tracker: GitHub

Issues 和 PRD（spec）本仓都作为 GitHub issue 管理。所有操作用 `gh` CLI。

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. 多行 body 用 heredoc。
- **Read an issue**: `gh issue view <number> --comments`，按需 `jq` 过滤评论，并取 labels。
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`，按 `--label` / `--state` 过滤。
- **Comment**: `gh issue comment <number> --body "..."`
- **Labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

仓库从 `git remote -v` 推断——`gh` 在 clone 内自动识别。

## Pull requests as a triage surface

**PRs as a request surface: no.**

## When a skill says "publish to the issue tracker"

Create a GitHub issue（spec 加 `ready-for-agent` label）。spec 仅作为 issue 存在，不落本地文件。

## When a skill says "fetch the relevant ticket"

`gh issue view <number> --comments`。

## Wayfinding operations

供 `/wayfinder`。**Map** 是单条 issue（label `wayfinder:map`），子 ticket 为其 child issue。

- **Map**: `gh issue create --label wayfinder:map`。
- **Child ticket**: GitHub sub-issue 关联到 map（`gh api` sub-issues 端点）；不可用时挂 map body 的 task list + child 顶部 `Part of #<map>`。Label: `wayfinder:<type>`（`research`/`prototype`/`grilling`/`task`）。claim 后 assignee 指向 driving dev。
- **Blocking**: GitHub 原生 issue dependencies。加边: `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`，其中 `<blocker-db-id>` 是 blocker 的 **数据库 id**（`gh api repos/<owner>/<repo>/issues/<n> --jq .id`，非 `#number`/`node_id`）。GitHub 报 `issue_dependencies_summary.blocked_by`（仅 open blocker——live gate）。不可用时退回 child body 顶部 `Blocked by: #<n>, #<n>`。
- **Frontier query**: map 的 open children（`gh issue list --state open`，scope 到 sub-issues / task list），剔除有 open blocker 或有 assignee 的；map 顺序优先。
- **Claim**: `gh issue edit <n> --add-assignee @me`——session 第一笔写。
- **Resolve**: `gh issue comment <n> --body "<answer>"` → `gh issue close <n>` → 在 map 的 Decisions-so-far 追加 context pointer（gist + link）。
