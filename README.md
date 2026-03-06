# OpenCode iMean

OpenCode iMean is a local-first workflow plugin scaffold for OpenCode, oh-my-opencode, and Claude Code compatible loaders.

`OpenCode iMean` is not an official OpenCode project. It is a community-maintained workflow plugin with local-first defaults. The internal slug remains `oh-imean` for compatibility with existing commands, artifact paths, and hook scripts.

## Structure

- `.claude-plugin/plugin.json` plugin manifest
- `.opencode/opencode.json` native OpenCode config entry
- `.opencode/plugins/` native OpenCode plugin wrapper
- `commands/` namespaced slash commands
- `skills/` plugin-local skills
- `agents/` plugin-local agents
- `hooks/hooks.json` hook mapping
- `scripts/lib/` shared runtime and hook helpers
- `scripts/hooks/` lifecycle hooks and quality gate scripts
- `.mcp.json` plugin MCP config (disabled template)

## Included Skills

This repository only tracks skills that are self-contained inside `skills/`.

Current checked-in skills:

- `frontend-ui-ux`
- `git-master`
- `playwright`
- `repo-guard`

The current native OpenCode wrapper does not auto-inject `skills/` into `config.skills`. If you want these skills in native OpenCode, wire them in explicitly from your own project setup or keep using a compatible loader that already understands this directory.

If you use a larger private/community skill pack locally, keep those skills outside this repository instead of committing machine-specific symlinks.

## Bundled MCPs

Project MCP config lives in [`.mcp.json`](.mcp.json). Right now this file is a template/reference file, not an auto-loaded native OpenCode MCP registry. Current entries:

- `websearch`: Exa-backed web search
- `context7`: library and framework documentation lookup
- `grep_app`: GitHub code search

## MCP Setup

The bundled MCP definitions are optional. Configure credentials locally before enabling them.

### Required environment variables

- `EXA_API_KEY`: required for `websearch`
- `CONTEXT7_API_KEY`: required for `context7` if your Context7 deployment expects an API key
- `GITHUB_TOKEN`: required for `grep_app` / GitHub code search

### Setup steps

1. Export the required variables in your shell profile, secret manager, or local OpenCode runtime environment.
2. Keep [`.mcp.json`](.mcp.json) free of hardcoded secrets.
3. Enable only the MCPs you actually use.
4. Verify each MCP from your local OpenCode setup after credentials are in place.

### Security notes

- Never commit real API keys or tokens to this repository.
- Do not paste real credentials into README examples, `.mcp.json`, or tracked config files.
- Prefer environment-variable substitution or local-only secret files outside version control.

## Workflow (v3)

- `standardized`: `/dispatch -> /plan -> /kickoff -> /review -> /verify`
- `quick-fix`: `/dispatch -> /kickoff -> /review -> /verify`
- `/dispatch <需求>`: 统一入口。两种模式都创建或复用 `task-slug`，并初始化 `state.json`、`handoff.md`、`runtime/tasks/<task-slug>.json`。
- `/plan <需求>`: 仅标准化流程可用。先做 `spec mode` 的理解锁，再进入 `plan mode` 生成 `P1/P2/P3` 并让用户单选；选定后同时落盘 `requirements.md`、`plan.md`、`handoff.md`。
- `/kickoff <task-slug>`: 两种模式都只负责实现。完成后统一推进到 `phase=review`，下一步固定是 `/review <task-slug>`。
- `/review [task-slug|scope]`: 两种模式都强制经过。独立审查实现结果，输出 `review.md`；通过则推进到 `verify`，失败则退回 `implement`。
- `/resume [task-slug]`: 恢复最近一次活跃任务，输出 phase、selected option、active step 和推荐下一命令。
- `/status [task-slug]`: 汇总当前任务的 phase、最近 review/verify 状态、最近阻塞原因与 replan 风险。
- `/verify [task-slug]`: 两种模式都强制经过。独立执行验证并写入 `verification.md`、`state.json` 和 runtime task。
- `/quality-gate [path|.] [--fix] [--strict]`: 手动执行与 hooks 同一套轻量质量检查。

## Agent Roles

- `oh-imean:dispatcher`: 只做模式分流、阶段推进和回退决策，不改代码。
- `oh-imean:spec-planner`: 标准化流程角色，先 `spec`，再 `plan`，先做理解锁再出候选方案。
- `oh-imean:implementer`: 严格按需求或已确认计划修改代码；发现计划不可执行时提交 `replan request`。
- `oh-imean:reviewer`: 独立审查实现质量、回归风险和测试缺口。
- `oh-imean:verifier`: 独立运行测试与检查，并输出 `pass/fail/pass_with_risk` 与需求覆盖结论。

在当前 OpenCode 原生 wrapper 中，角色结构分两层：

- `OpenCode iMean`: 唯一 `primary` 总调度角色，供 OpenCode 角色切换器直接选择
- `oh-imean:dispatcher / spec-planner / implementer / reviewer / verifier`: 内部子角色链，继续服务 `dispatch/plan/kickoff/review/verify` 等流程入口

也就是说：

- 对外暴露的是一个总调度主角色
- 对内仍保留原来的阶段角色拆分
- slash commands 依然可用，但它们调用的是内部子角色，而不是额外暴露多组主角色

## Prompt Governance

- `agents/*.md` 是阶段行为的真相源（source of truth）。
- `commands/*.md` 保持薄层：只定义阶段入口、输入输出、交互协议和最小门禁。
- 发生冲突时，以状态机与对应 agent 规则为准，避免 command/agent 漂移。

## Task Artifacts

所有任务都使用 `.oh-imean/specs/<task-slug>/` 目录；两种模式都至少维护：

- `.oh-imean/specs/<task-slug>/state.json`
- `.oh-imean/specs/<task-slug>/handoff.md`
- `.oh-imean/specs/<task-slug>/review.md`
- `.oh-imean/specs/<task-slug>/verification.md`

当流程选择 `standardized` 时，额外维护：

- `.oh-imean/specs/<task-slug>/requirements.md`
- `.oh-imean/specs/<task-slug>/plan.md`

说明：

- `state.json`: 所有任务的真相源，用于阶段门禁、任务标识、下一角色、当前执行步和上下文裁剪。
- `requirements.md`: 参考 Kiro 的需求文档格式，记录 introduction、scope、non-goals、constraints、assumptions，以及带 user story 和 EARS 验收标准的 requirements。
- `plan.md`: 参考 Antigravity 的 implementation plan 风格，记录用户选定后的最终执行方案。
- `handoff.md`: phase 切换专用，只保留最新 handoff，固定包含 `Context / Assumptions / Open Questions / Next Action`。
- `review.md`: reviewer 的独立审查结果，固定记录 findings、需求/意图一致性、回归风险、测试缺口和建议下一步。
- `verification.md`: 参考 Antigravity 的 walkthrough 风格，记录验证结果、覆盖情况、风险、推荐下一步，以及一段可追溯的验证叙事。

生命周期规则：

- 每个标准化任务一套工件
- 同一任务后续只更新原文件，不重复新建
- `quick-fix` 也创建任务目录，但不生成 `requirements.md` / `plan.md`
- 只有在明确开启新任务时，才创建新的 `task-slug` 目录
- `.oh-imean/` 属于运行时生成目录，不纳入版本控制

## Runtime Artifacts

为恢复能力和 hook 自动化新增 runtime 层：

- `.oh-imean/runtime/tasks/<task-slug>.json`
- `.oh-imean/runtime/sessions/<date>-<session-id>.md`
- `.oh-imean/runtime/logs/oh-imean-hook.log`

说明：

- `runtime/tasks/*.json`: 任务级运行态摘要，不替代 `state.json`，仅保存最近 session、最近 review/verify 结论、最近阻塞和推荐下一步。
- `runtime/sessions/*.md`: 单次会话摘要，固定记录当前目标、已完成、失败尝试、触达文件、下一步建议。
- `runtime/logs/*.log|*.json`: hook 日志与 pre-compact 快照。

原则：

- `state.json` 继续做流程真相源
- `runtime/tasks/*.json` 做恢复加速层
- `handoff.md` 做角色切换层
- `runtime/sessions/*.md` 做跨会话叙事层

## Hook Lifecycle

当前 hooks 统一走 Node.js 脚本，shell 只保留兼容包装层。

- `SessionStart`: 自动恢复最近一次活跃任务，输出 `mode`、`task-slug`、当前 phase、最近 review/verify 摘要和推荐下一命令。
- `PostToolUse(Edit|Write|MultiEdit)`: 执行轻量 quality gate，只检查本次触达文件。
- `PreToolUse(Edit|Write|MultiEdit)`: 两种模式统一按 `phase` 做源码编辑门禁；只有 `implement` 阶段允许改源码，`review` / `verify` 一律只能写 `.oh-imean/` 工件。
- `Stop`: 按响应周期生成 session summary，记录本轮目标、触达文件、失败信号和推荐下一步。
- `PreCompact`: 在上下文压缩前写一次最小状态快照，避免 phase 信息丢失。

## Hook Runtime Controls

支持以下环境变量：

- `OH_IMEAN_HOOK_PROFILE=minimal|standard|strict`
- `OH_IMEAN_DISABLED_HOOKS=<comma-separated ids>`
- `OH_IMEAN_QUALITY_GATE_FIX=true|false`
- `OH_IMEAN_QUALITY_GATE_STRICT=true|false`

默认建议：

- `quick-fix`: `minimal`
- `standardized`: `standard`
- 明确需要更强护栏时再切到 `strict`

## Quality Gate

`oh-imean` 的 quality gate 只做“改完立刻发现明显问题”，不替代完整 CI。

- JS/TS: 优先 `biome check`，否则 `prettier --check`
- Python: `ruff format --check`
- Go: `gofmt -w` 仅在 `--fix` 或 `OH_IMEAN_QUALITY_GATE_FIX=true` 时启用
- hooks 模式只检查当前编辑文件
- 手动命令模式支持 `[path|.] [--fix] [--strict]`

## Artifact Writer

统一工件写入入口：

- JSON 工件：`node "${CLAUDE_PLUGIN_ROOT}/scripts/write-artifact.js" state|runtime <task-slug> --merge '<json>'`
- JSON patch 文件：`node "${CLAUDE_PLUGIN_ROOT}/scripts/write-artifact.js" state|runtime <task-slug> --merge-file <path>`
- Markdown 模板初始化：`node "${CLAUDE_PLUGIN_ROOT}/scripts/write-artifact.js" requirements|plan|handoff|review|verification <task-slug> --template --meta '<json>'`
- 长元数据可改用：`node "${CLAUDE_PLUGIN_ROOT}/scripts/write-artifact.js" requirements|plan|handoff|review|verification <task-slug> --template --meta-file <path>`
- Markdown 工件：`node "${CLAUDE_PLUGIN_ROOT}/scripts/write-artifact.js" requirements|plan|handoff|review|verification <task-slug> --stdin`

用途：

- 避免 agent 手工拼接 `state.json` / runtime task 导致字段漂移
- `state/runtime` 也可以改走 patch-file，避免长 JSON 内联在命令里
- 让 `requirements.md` / `plan.md` / `handoff.md` / `review.md` / `verification.md` 都有统一模板入口
- 避免长 JSON 内联在命令里难以维护，可先落地 `meta` 文件再渲染模板
- 配合 `PreToolUse` 门禁，把 `.oh-imean/` 工件和源码编辑区分开

## Template Meta Wrapper

为 `dispatch / plan / kickoff / review / verify` 提供更短的 wrapper，先生成 `meta-file`，再交给 `write-artifact.js`：

- `node "${CLAUDE_PLUGIN_ROOT}/scripts/build-template-meta.js" dispatch-state <task-slug> ... --out <patch-file>`
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/build-template-meta.js" dispatch-runtime <task-slug> ... --out <patch-file>`
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/build-template-meta.js" dispatch-handoff <task-slug> ... --out <meta-file>`
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/build-template-meta.js" plan-state <task-slug> ... --out <patch-file>`
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/build-template-meta.js" plan-runtime <task-slug> ... --out <patch-file>`
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/build-template-meta.js" plan-requirements <task-slug> ... --out <meta-file>`
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/build-template-meta.js" plan-implementation <task-slug> ... --out <meta-file>`
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/build-template-meta.js" plan-handoff <task-slug> ... --out <meta-file>`
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/build-template-meta.js" kickoff-state <task-slug> ... --out <patch-file>`
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/build-template-meta.js" kickoff-runtime <task-slug> ... --out <patch-file>`
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/build-template-meta.js" kickoff-handoff <task-slug> ... --out <meta-file>`
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/build-template-meta.js" review-state <task-slug> ... --out <patch-file>`
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/build-template-meta.js" review-runtime <task-slug> ... --out <patch-file>`
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/build-template-meta.js" review-report <task-slug> ... --out <meta-file>`
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/build-template-meta.js" verify-state <task-slug> ... --out <patch-file>`
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/build-template-meta.js" verify-runtime <task-slug> ... --out <patch-file>`
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/build-template-meta.js" verify-report <task-slug> ... --out <meta-file>`

作用：

- agent 不需要记完整 `meta` JSON 结构
- `state/runtime` patch 也不需要内联拼接
- 常见数组字段支持重复 flag，例如 `--check-run`、`--risk`、`--step`
- 复杂 requirements 仍可通过 `--requirements-file <json>` 注入

## Weak-Model Strategy

这版 workflow 继续按“响应快、可多读、但能力边界较弱”的模型来设计。

核心原则：

- 先看 `state.json`
- 再看 `handoff.md`
- 再看 `requirements.md / plan.md / review.md / verification.md`
- 再看 `runtime/tasks/<task-slug>.json`
- 最后才读必要代码文件

统一裁剪规则：

- `Read -> Judge -> Keep/Drop`
- `Explore locally, persist minimally`

统一不确定性分级：

- `low`: 小命名差异、局部路径不确定，可继续并记录假设
- `medium`: 涉及范围边界、文件选择、行为变化，先回 dispatcher 或 spec-planner
- `high`: 涉及需求冲突、缺失工件、无法确认任务身份，直接阻塞

## State Machine

固定阶段流转：

- `standardized`: `intake -> spec -> plan -> implement -> review -> verify -> done`
- `quick-fix`: `intake -> implement -> review -> verify -> done`
- `review -> implement`：审查发现阻断问题时回退
- `verify -> implement`：验证失败且属于实现问题时回退
- `verify -> dispatch`：验证失败且属于需求/计划冲突时回退
- `spec/plan -> waiting_user -> spec/plan`

阶段门禁：

- `spec-planner` 仅在 `phase=spec|plan` 工作
- `implementer` 仅在 `phase=implement` 工作；standardized 下要求 `selected_option` 已锁定
- `reviewer` 仅在 `phase=review` 工作
- `verifier` 仅在 `phase=verify` 工作
- 阶段不匹配时返回结构化阻塞，不自行纠偏

### `state.json` 推荐骨架

```json
{
  "task_slug": "login-rate-limit",
  "mode": "standardized",
  "phase": "spec",
  "status": "active",
  "current_goal": "给登录接口增加限流能力",
  "current_role": "spec-planner",
  "next_role": "spec-planner",
  "active_artifacts": [
    ".oh-imean/specs/login-rate-limit/requirements.md",
    ".oh-imean/specs/login-rate-limit/plan.md",
    ".oh-imean/specs/login-rate-limit/review.md",
    ".oh-imean/specs/login-rate-limit/verification.md"
  ],
  "locked_scope": [],
  "non_goals": [],
  "selected_option": null,
  "active_step": null,
  "uncertainty_level": "low",
  "replan_reason": null,
  "last_verified_at": null,
  "context_budget": "minimal",
  "discarded_context_summary": null,
  "session_id": null,
  "last_session_summary": null,
  "last_handoff_at": null,
  "verification_status": null,
  "review_status": null,
  "last_blocking_reason": null,
  "hook_profile": "standard",
  "recommended_next_command": "/plan login-rate-limit"
}
```

## Native OpenCode

`OpenCode iMean` now includes a native OpenCode entrypoint under `.opencode/`.

### Direct use inside this repository

Run OpenCode in this folder:

```bash
cd /Users/vcbb/Documents/代码/vcbb666/program/oh-imean
opencode
```

OpenCode will load:

- `.opencode/opencode.json`
- `.opencode/plugins/oh-imean.js`
- plugin-injected `command` entries
- one primary agent: `OpenCode iMean`
- internal subagents used by the workflow commands

### Reuse from another project

In another repository, point your `opencode.json` at this plugin directory:

```json
{
  "plugin": [
    "/Users/vcbb/Documents/代码/vcbb666/program/oh-imean/.opencode/plugins"
  ]
}
```

Notes:

- The native OpenCode wrapper injects commands and roles at runtime through the plugin `config` hook. You do not need to copy `agent` or `command` blocks by hand.
- The native OpenCode wrapper currently bridges `session.created`, `session.idle`, `tool.execute.before`, and `file.edited` into the existing `oh-imean` hook scripts.
- The npm package route is not published yet, so the supported native path today is local directory usage rather than `plugin: ["package-name"]`.

## Claude / oh-my-opencode Register Locally

`oh-my-opencode` discovers plugins from:

- `~/.claude/plugins/installed_plugins.json`

Add an entry pointing `installPath` to this folder:

`/Users/vcbb/Documents/代码/vcbb666/program/oh-imean`

Then ensure plugin is enabled in `~/.claude/settings.json` (`enabledPlugins`).

## Notes

- Hook logs now write to `.oh-imean/runtime/logs/oh-imean-hook.log` in the current project.
- Runtime session summaries write to `.oh-imean/runtime/sessions/`.
- MCP server is still a placeholder and intentionally disabled.
- Default command language is Chinese.
- Native OpenCode support lives under `.opencode/` and reuses the existing workflow artifacts and Node hook scripts.
