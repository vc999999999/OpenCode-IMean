# OpenCode iMean

[中文说明](./README.zh-CN.md)

OpenCode iMean is a local-first workflow plugin for OpenCode, `oh-my-opencode`, and Claude Code compatible loaders.

`OpenCode iMean` is not an official OpenCode project. It is a community-maintained workflow plugin. The internal slug remains `oh-imean` for compatibility with existing commands, artifact paths, and hook scripts.

## What It Is For

OpenCode iMean is designed for low-cost, large-context models that can read a lot but still drift off-task.

The core idea is not "give the model more context." The core idea is:

- externalize task state
- force phase transitions
- keep planning separate from implementation
- minimize noisy context carryover between steps

In practice, that means the plugin tries to stop common failure modes of weaker planning models:

- implementing before requirements are locked
- mixing exploration notes with execution state
- losing track of the current phase
- carrying stale context too far forward
- skipping review and verification because the model "sounds done"

## Core Design

- `standardized` flow: `dispatch -> plan -> kickoff -> review -> verify`
- `quick-fix` flow: `dispatch -> kickoff -> review -> verify`
- state is written to artifacts instead of relying on chat memory
- the workflow can resume from artifacts in a new session
- hooks enforce phase gates and lightweight quality checks

## Repository Layout

- `.claude-plugin/plugin.json`: Claude-compatible plugin manifest
- `.opencode/opencode.json`: native OpenCode entrypoint
- `.opencode/plugins/`: native OpenCode plugin wrapper
- `agents/`: role prompts
- `commands/`: slash command prompts
- `hooks/`: hook mapping
- `scripts/lib/`: shared runtime helpers
- `scripts/hooks/`: lifecycle hooks and quality gate logic
- `skills/`: self-contained project-local skills tracked in this repo
- `.mcp.json`: MCP template/reference config

## Workflow

### Standardized

Use this for new features, cross-module changes, unclear requirements, or any task that needs locked acceptance criteria first.

Flow:

- `/dispatch <goal>`
- `/plan <goal-or-task-slug>`
- `/kickoff <task-slug>`
- `/review <task-slug>`
- `/verify <task-slug>`

### Quick-fix

Use this for narrow bug fixes or low-ambiguity changes.

Flow:

- `/dispatch <goal>`
- `/kickoff <task-slug>`
- `/review <task-slug>`
- `/verify <task-slug>`

## Roles

Internal workflow roles:

- `oh-imean:dispatcher`: routes work and advances or rolls back phase
- `oh-imean:spec-planner`: locks requirements and writes the plan
- `oh-imean:implementer`: executes only the approved step
- `oh-imean:reviewer`: performs review before verification
- `oh-imean:verifier`: validates outcomes and writes final verification state

Native OpenCode exposure:

- `OpenCode iMean`: the single `primary` role shown in the OpenCode role switcher
- internal roles remain available for workflow commands and internal delegation

## Why This Helps Drift-Prone Models

The plugin is intentionally opinionated about task state.

Instead of trusting the model to remember everything correctly, it writes the minimum durable context needed for the next step:

- current phase
- current task identity
- selected option
- active execution step
- next role
- next recommended command
- latest review and verification status

It also enforces a trim policy:

- `Read -> Judge -> Keep/Drop`
- `Explore locally, persist minimally`

That is the main optimization target: reduce phase drift, not maximize raw context volume.

## Task Artifacts

Per task directory:

- `.oh-imean/specs/<task-slug>/state.json`
- `.oh-imean/specs/<task-slug>/handoff.md`
- `.oh-imean/specs/<task-slug>/review.md`
- `.oh-imean/specs/<task-slug>/verification.md`

Standardized-only artifacts:

- `.oh-imean/specs/<task-slug>/requirements.md`
- `.oh-imean/specs/<task-slug>/plan.md`

Runtime artifacts:

- `.oh-imean/runtime/tasks/<task-slug>.json`
- `.oh-imean/runtime/sessions/<date>-<session-id>.md`
- `.oh-imean/runtime/logs/oh-imean-hook.log`

Notes:

- `.oh-imean/` is runtime-generated and is not tracked in git
- `state.json` is the workflow truth source
- `runtime/tasks/*.json` is the recovery summary layer
- `handoff.md` is the role-to-role transition layer

## Hook Behavior

Current hooks are implemented in Node.js:

- `session.created`: restore latest active task summary
- `session.idle`: write a session summary
- `tool.execute.before`: enforce phase gate before source edits
- `file.edited`: run lightweight quality checks after edits

Hook profiles:

- `minimal`
- `standard`
- `strict`

Recommended defaults:

- `quick-fix -> minimal`
- `standardized -> standard`

Environment variables:

- `OH_IMEAN_HOOK_PROFILE=minimal|standard|strict`
- `OH_IMEAN_DISABLED_HOOKS=<comma-separated ids>`
- `OH_IMEAN_QUALITY_GATE_FIX=true|false`
- `OH_IMEAN_QUALITY_GATE_STRICT=true|false`

## Included Skills

This repository only tracks skills that are self-contained inside `skills/`.

Current checked-in skills:

- `frontend-ui-ux`
- `git-master`
- `playwright`
- `repo-guard`

The native OpenCode wrapper does not auto-inject `skills/` into `config.skills`. If you want them in native OpenCode, wire them in explicitly from your own project setup or use a compatible loader that already understands this directory.

## MCP Setup

Bundled MCP definitions are optional. `.mcp.json` is a template/reference file, not an auto-loaded registry.

Current entries:

- `websearch`
- `context7`
- `grep_app`

Expected environment variables:

- `EXA_API_KEY` for `websearch`
- `CONTEXT7_API_KEY` for `context7` when required by your deployment
- `GITHUB_TOKEN` for `grep_app`

Security rules:

- never commit real API keys
- do not hardcode credentials in `.mcp.json`
- prefer environment variables or local-only secret files

## Native OpenCode Usage

### Use directly in this repository

```bash
cd /Users/vcbb/Documents/代码/vcbb666/program/oh-imean
opencode
```

OpenCode loads:

- `.opencode/opencode.json`
- `.opencode/plugins/oh-imean.js`
- plugin-injected commands
- one primary role: `OpenCode iMean`
- internal workflow subagents

### Reuse from another project

Add this to your `opencode.json`:

```json
{
  "plugin": [
    "/Users/vcbb/Documents/代码/vcbb666/program/oh-imean/.opencode/plugins"
  ]
}
```

Notes:

- commands and roles are injected by the plugin `config` hook
- you do not need to copy `agent` or `command` blocks by hand
- the npm package path is not published yet; local directory usage is the supported path today

## Claude / oh-my-opencode Registration

`oh-my-opencode` discovers plugins from:

- `~/.claude/plugins/installed_plugins.json`

Add an entry whose `installPath` points at this directory:

- `/Users/vcbb/Documents/代码/vcbb666/program/oh-imean`

Then enable the plugin in:

- `~/.claude/settings.json`

## Notes

- default workflow language is Chinese
- native OpenCode support lives under `.opencode/`
- the plugin bridges into the existing Node hook scripts and artifact system
- this project is optimized around workflow reliability for drift-prone models, not around maximizing autonomous freedom
