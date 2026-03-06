# OpenCode iMean

[English README](./README.md)

OpenCode iMean 是一个面向 OpenCode、`oh-my-opencode` 以及 Claude Code 兼容加载器的本地优先工作流插件。

`OpenCode iMean` 不是官方 OpenCode 项目，而是社区维护的工作流插件。为了兼容现有命令、工件目录和 hook 脚本，内部 slug 仍然保留为 `oh-imean`。

## 它解决什么问题

OpenCode iMean 的目标不是单纯“给模型更多上下文”，而是优化一类常见模型：

- 上下文窗口很大
- 调用成本比较低
- 但容易在长流程里走歪

这类模型通常不是“看不到信息”，而是：

- 需求还没锁定就开始写代码
- 把探索信息、旧上下文和当前任务状态混在一起
- 忘记自己当前处于哪个阶段
- 看起来说得很多，但其实已经偏离主目标
- 没经过 review / verify 就自认为任务完成

所以 OpenCode iMean 的核心思路是：

- 把任务状态外置到工件
- 强制阶段切换
- 把 `spec/plan` 和实现拆开
- 最小化无效上下文在阶段之间的延续

## 核心设计

- `standardized` 流程：`dispatch -> plan -> kickoff -> review -> verify`
- `quick-fix` 流程：`dispatch -> kickoff -> review -> verify`
- 依赖工件保存状态，而不是依赖会话记忆
- 新会话可以从工件恢复任务
- hooks 负责做 phase gate 和轻量质量检查

## 仓库结构

- `.claude-plugin/plugin.json`：Claude 兼容插件清单
- `.opencode/opencode.json`：原生 OpenCode 入口
- `.opencode/plugins/`：原生 OpenCode 插件包装层
- `agents/`：角色 prompt
- `commands/`：slash command prompt
- `hooks/`：hook 映射
- `scripts/lib/`：共享 runtime 工具
- `scripts/hooks/`：生命周期 hook 与质量检查逻辑
- `skills/`：仓库内自包含技能
- `.mcp.json`：MCP 模板/参考配置

## 工作流

### Standardized

适用于：

- 新功能
- 跨模块改动
- 需求边界还没锁定
- 需要先明确验收标准的任务

流程：

- `/dispatch <目标>`
- `/plan <目标或task-slug>`
- `/kickoff <task-slug>`
- `/review <task-slug>`
- `/verify <task-slug>`

### Quick-fix

适用于：

- 单点 bug 修复
- 低歧义改动
- 范围明确的小修改

流程：

- `/dispatch <目标>`
- `/kickoff <task-slug>`
- `/review <task-slug>`
- `/verify <task-slug>`

## 角色设计

内部工作流角色：

- `oh-imean:dispatcher`：负责分流、推进阶段、决定是否回退
- `oh-imean:spec-planner`：负责锁需求、写计划
- `oh-imean:implementer`：只执行被批准的步骤
- `oh-imean:reviewer`：在 verify 之前先做独立审查
- `oh-imean:verifier`：做最终验证并写入验证结论

原生 OpenCode 对外暴露：

- `OpenCode iMean`：唯一的 `primary` 总调度角色，出现在 OpenCode 的角色切换器中
- 内部阶段角色继续存在，供 slash commands 和内部委托使用

## 为什么它适合容易走歪的模型

这个插件最关键的优化点不是“更多上下文”，而是“更少漂移”。

它会把下一步真正需要的最小状态写出来，而不是指望模型自己记住：

- 当前阶段
- 当前任务身份
- 当前选中的方案
- 当前执行步骤
- 下一角色
- 下一条推荐命令
- 最近一次 review / verify 结果

同时它要求统一裁剪规则：

- `Read -> Judge -> Keep/Drop`
- `Explore locally, persist minimally`

所以它本质上是在压制这类模型最常见的问题：阶段漂移、状态漂移、目标漂移。

## 任务工件

每个任务目录至少包含：

- `.oh-imean/specs/<task-slug>/state.json`
- `.oh-imean/specs/<task-slug>/handoff.md`
- `.oh-imean/specs/<task-slug>/review.md`
- `.oh-imean/specs/<task-slug>/verification.md`

`standardized` 额外包含：

- `.oh-imean/specs/<task-slug>/requirements.md`
- `.oh-imean/specs/<task-slug>/plan.md`

运行时工件：

- `.oh-imean/runtime/tasks/<task-slug>.json`
- `.oh-imean/runtime/sessions/<date>-<session-id>.md`
- `.oh-imean/runtime/logs/oh-imean-hook.log`

说明：

- `.oh-imean/` 是运行时生成目录，不纳入 git
- `state.json` 是流程真相源
- `runtime/tasks/*.json` 是恢复摘要层
- `handoff.md` 是角色切换层

## Hook 行为

当前 hooks 用 Node.js 实现：

- `session.created`：恢复最近活跃任务摘要
- `session.idle`：写入 session summary
- `tool.execute.before`：在源码编辑前做 phase gate
- `file.edited`：编辑后执行轻量质量检查

Hook profile：

- `minimal`
- `standard`
- `strict`

默认建议：

- `quick-fix -> minimal`
- `standardized -> standard`

环境变量：

- `OH_IMEAN_HOOK_PROFILE=minimal|standard|strict`
- `OH_IMEAN_DISABLED_HOOKS=<comma-separated ids>`
- `OH_IMEAN_QUALITY_GATE_FIX=true|false`
- `OH_IMEAN_QUALITY_GATE_STRICT=true|false`

## 仓库内技能

当前仓库只保留自包含、可直接开源发布的技能：

- `frontend-ui-ux`
- `git-master`
- `playwright`
- `repo-guard`

原生 OpenCode wrapper 不会自动把 `skills/` 注入到 `config.skills`。如果你要在原生 OpenCode 里启用这些技能，需要在自己的项目配置里显式接入，或者继续使用已经支持该目录的兼容加载器。

## MCP 配置

仓库里的 `.mcp.json` 是模板/参考配置，不是自动加载的原生 MCP 注册表。

当前定义：

- `websearch`
- `context7`
- `grep_app`

预期环境变量：

- `EXA_API_KEY`：用于 `websearch`
- `CONTEXT7_API_KEY`：用于 `context7`，取决于你的部署方式
- `GITHUB_TOKEN`：用于 `grep_app`

安全要求：

- 不要提交真实 API Key
- 不要把密钥硬编码到 `.mcp.json`
- 优先使用环境变量或本地私有密钥文件

## 原生 OpenCode 使用方式

### 在本仓库直接使用

```bash
cd /Users/vcbb/Documents/代码/vcbb666/program/oh-imean
opencode
```

OpenCode 会加载：

- `.opencode/opencode.json`
- `.opencode/plugins/oh-imean.js`
- 由插件动态注入的 commands
- 一个主角色：`OpenCode iMean`
- 内部工作流子角色

### 在其他项目里复用

在其他项目的 `opencode.json` 中加入：

```json
{
  "plugin": [
    "/Users/vcbb/Documents/代码/vcbb666/program/oh-imean/.opencode/plugins"
  ]
}
```

说明：

- commands 和 roles 都由插件的 `config` hook 动态注入
- 不需要手动复制 `agent` 或 `command` 配置块
- npm 包分发暂未发布，所以当前推荐方式是本地目录引用

## Claude / oh-my-opencode 注册方式

`oh-my-opencode` 会从这里发现插件：

- `~/.claude/plugins/installed_plugins.json`

把 `installPath` 指向下面这个目录：

- `/Users/vcbb/Documents/代码/vcbb666/program/oh-imean`

然后在这里启用插件：

- `~/.claude/settings.json`

## 备注

- 默认工作流语言是中文
- 原生 OpenCode 支持位于 `.opencode/`
- 插件会桥接到现有 Node hook 和工件系统
- 这个项目的优化重点是让容易走歪的模型更守流程，而不是让智能体拥有更大的自由度
