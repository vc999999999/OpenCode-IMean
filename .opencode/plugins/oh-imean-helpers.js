import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const pluginRoot = path.resolve(__dirname, "../..")
const CLAUDE_PLUGIN_ROOT_VAR = "${CLAUDE_PLUGIN_ROOT}"
const SKILLS_SOURCE_PATH = path.join(pluginRoot, "skills")
const RUNTIME_TASKS_DIR = ".oh-imean/runtime/tasks"
const SPECS_DIR = ".oh-imean/specs"

const TOOL_NAME_MAP = {
  edit: "Edit",
  write: "Write",
  multiedit: "MultiEdit",
}

const FILE_ARG_KEYS = ["filePath", "file_path", "path"]
const FRONTMATTER_PATTERN = /^---\n[\s\S]*?\n---\n?/

const readText = (relativePath) =>
  fs.readFileSync(path.join(pluginRoot, relativePath), "utf8")

const stripFrontmatter = (value) => value.replace(FRONTMATTER_PATTERN, "").trim()

const readPrompt = (relativePath) => stripFrontmatter(readText(relativePath))

const readTemplate = (relativePath) => `${readText(relativePath).trim()}\n\n$ARGUMENTS`

const resolvePluginPaths = (value) => {
  if (value === null || value === undefined) return value

  if (typeof value === "string") {
    return value.replace(CLAUDE_PLUGIN_ROOT_VAR, pluginRoot)
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolvePluginPaths(item))
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolvePluginPaths(item)]),
    )
  }

  return value
}

const buildInjectedAgents = () => ({
  "oh-imean-dispatcher": {
    description: "Route work into standardized or quick-fix workflow phases.",
    mode: "all",
    prompt: readPrompt("agents/dispatcher.md"),
    tools: {
      read: true,
      bash: true,
      question: true,
      write: false,
      edit: false,
      mcp: true,
    },
  },
  "oh-imean-spec-planner": {
    description: "Lock requirements and produce an implementation plan for standardized workflow tasks.",
    mode: "all",
    prompt: readPrompt("agents/spec-planner.md"),
    tools: {
      read: true,
      bash: true,
      question: true,
      write: true,
      edit: true,
      mcp: true,
    },
  },
  "oh-imean-implementer": {
    description: "Implement approved quick-fix or planned work within the current phase gate.",
    mode: "all",
    prompt: readPrompt("agents/implementer.md"),
    tools: {
      read: true,
      bash: true,
      question: true,
      write: true,
      edit: true,
      mcp: true,
    },
  },
  "oh-imean-reviewer": {
    description: "Review completed implementation for regressions, quality, and missing coverage.",
    mode: "all",
    prompt: readPrompt("agents/reviewer.md"),
    tools: {
      read: true,
      bash: true,
      write: true,
      edit: false,
      mcp: true,
    },
  },
  "oh-imean-verifier": {
    description: "Verify implementation against requirements, tests, and quality gates.",
    mode: "all",
    prompt: readPrompt("agents/verifier.md"),
    tools: {
      read: true,
      bash: true,
      write: true,
      edit: false,
      mcp: true,
    },
  },
})

const buildPrimaryAgents = () => ({
  "OpenCode iMean": {
    description: "Primary orchestration role that routes work through the oh-imean workflow.",
    mode: "primary",
    prompt: readPrompt("agents/dispatcher.md"),
    tools: {
      read: true,
      bash: true,
      question: true,
      write: true,
      edit: true,
      mcp: true,
    },
  },
})

const buildInjectedCommands = () => ({
  dispatch: {
    description: "Route a new task into standardized or quick-fix mode.",
    template: readTemplate("commands/dispatch.md"),
    agent: "oh-imean-dispatcher",
    subtask: true,
  },
  plan: {
    description: "Create requirements and an implementation plan for a standardized task.",
    template: readTemplate("commands/plan.md"),
    agent: "oh-imean-spec-planner",
    subtask: true,
  },
  kickoff: {
    description: "Execute the implementation phase for the current task.",
    template: readTemplate("commands/kickoff.md"),
    agent: "oh-imean-implementer",
    subtask: true,
  },
  review: {
    description: "Review implementation results before verification.",
    template: readTemplate("commands/review.md"),
    agent: "oh-imean-reviewer",
    subtask: true,
  },
  verify: {
    description: "Run final verification and write verification artifacts.",
    template: readTemplate("commands/verify.md"),
    agent: "oh-imean-verifier",
    subtask: true,
  },
  resume: {
    description: "Resume the latest active task and show the next recommended command.",
    template: readTemplate("commands/resume.md"),
    agent: "oh-imean-dispatcher",
    subtask: true,
  },
  status: {
    description: "Summarize task state, review status, verification status, and blockers.",
    template: readTemplate("commands/status.md"),
    agent: "oh-imean-dispatcher",
    subtask: true,
  },
  "quality-gate": {
    description: "Run the lightweight quality gate on a file or repo scope.",
    template: readTemplate("commands/quality-gate.md"),
    agent: "oh-imean-verifier",
    subtask: true,
  },
})

const getLatestTaskPhase = () => {
  try {
    const specsRoot = path.join(process.cwd(), SPECS_DIR)
    if (!fs.existsSync(specsRoot)) return null

    const taskDirs = fs
      .readdirSync(specsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)

    let latestTask = null
    let latestTime = 0

    for (const taskSlug of taskDirs) {
      const statePath = path.join(specsRoot, taskSlug, "state.json")
      if (fs.existsSync(statePath)) {
        const stat = fs.statSync(statePath)
        if (stat.mtimeMs > latestTime) {
          latestTime = stat.mtimeMs
          const state = JSON.parse(fs.readFileSync(statePath, "utf8"))
          latestTask = state
        }
      }
    }

    if (!latestTask) return null
    if (["done"].includes(latestTask.phase)) return null
    if (["active", "waiting_user", "blocked"].includes(latestTask.status)) {
      return latestTask.phase
    }
    return null
  } catch {
    return null
  }
}

const buildInjectedMcpServers = () => {
  const rawConfig = JSON.parse(readText(".mcp.json"))
  const rawServers = rawConfig?.mcpServers
  const currentPhase = getLatestTaskPhase()

  // Define research-heavy MCPs that should be disabled during pure implementation
  const RESEARCH_MCPS = ["websearch", "context7"]

  if (!rawServers || typeof rawServers !== "object") {
    return {}
  }

  return Object.fromEntries(
    Object.entries(rawServers).flatMap(([name, rawServer]) => {
      if (!rawServer || typeof rawServer !== "object") {
        return []
      }

      const server = resolvePluginPaths(rawServer)
      const serverType = server.type || "stdio"
      let enabled = server.disabled !== true

      // Disable research tools if we are actively implementing code
      if (enabled && RESEARCH_MCPS.includes(name) && currentPhase === "implement") {
        enabled = false
      }

      if (serverType === "http" || serverType === "sse") {
        if (typeof server.url !== "string" || !server.url.trim()) {
          return []
        }

        return [[
          name,
          {
            type: "remote",
            url: server.url,
            ...(server.headers && Object.keys(server.headers).length > 0
              ? { headers: server.headers }
              : {}),
            enabled,
          },
        ]]
      }

      if (typeof server.command !== "string" || !server.command.trim()) {
        return []
      }

      return [[
        name,
        {
          type: "local",
          command: [server.command, ...(Array.isArray(server.args) ? server.args : [])],
          ...(server.env && Object.keys(server.env).length > 0
            ? { environment: server.env }
            : {}),
          enabled,
        },
      ]]
    }),
  )
}

const mergeSkillSources = (existingSkills) => {
  if (!existingSkills) {
    return {
      sources: [SKILLS_SOURCE_PATH],
    }
  }

  if (Array.isArray(existingSkills)) {
    return {
      enable: existingSkills,
      sources: [SKILLS_SOURCE_PATH],
    }
  }

  const existingSources = Array.isArray(existingSkills.sources) ? existingSkills.sources : []
  const hasSource = existingSources.some((source) =>
    source === SKILLS_SOURCE_PATH || source?.path === SKILLS_SOURCE_PATH,
  )

  if (hasSource) {
    return existingSkills
  }

  return {
    ...existingSkills,
    sources: [...existingSources, SKILLS_SOURCE_PATH],
  }
}

export const applyOhIMeanConfig = (config) => {
  config.agent = {
    ...(config.agent || {}),
    ...buildInjectedAgents(),
    ...buildPrimaryAgents(),
  }

  config.command = {
    ...(config.command || {}),
    ...buildInjectedCommands(),
  }

  config.skills = mergeSkillSources(config.skills)

  config.mcp = {
    ...buildInjectedMcpServers(),
    ...(config.mcp || {}),
  }
}

const normalizeToolName = (tool) => {
  const raw = String(tool || "").trim()
  if (!raw) return ""
  return TOOL_NAME_MAP[raw.toLowerCase()] || raw
}

const getFilePath = (args) => {
  if (!args || typeof args !== "object") return ""
  for (const key of FILE_ARG_KEYS) {
    const value = args[key]
    if (typeof value === "string" && value.trim()) {
      return value.trim()
    }
  }
  return ""
}

export const toClaudeToolPayload = (input = {}) => {
  const toolName = normalizeToolName(input.tool)
  const filePath = getFilePath(input.args)
  const payload = {
    tool_name: toolName,
    tool_input: {},
  }

  if (filePath) {
    payload.tool_input.file_path = filePath
  }

  if (input.args && typeof input.args === "object") {
    payload.input = input.args
  }

  return payload
}
