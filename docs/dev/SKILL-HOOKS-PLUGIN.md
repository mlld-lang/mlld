---
updated: 2026-02-14
tags: #dev, #plugins, #skills
related-docs: docs/dev/DOCS-DEV.md
related-code: cli/commands/skill.ts, cli/commands/plugin.ts, plugins/mlld/, scripts/postinstall.js
---

# Skill Install & Plugin Hooks

## tldr

`mlld skill install` detects coding tools (Claude Code, Codex, Pi, OpenCode) and installs mlld authoring skills to each. `mlld skill install @author/name` installs skills from the mlld registry. npm postinstall nudges first-time users and silently updates existing installs.

## Principles

- Harness-agnostic skill distribution from a single `plugins/mlld/` source
- Registry skills resolved via `RegistryResolver`, validated as `moduleType: 'skill'`
- Version markers (`.version` files) distinguish first install from update, per-skill
- Hooks nudge agents toward skills when writing to `llm/`
- postinstall must never fail `npm install`

## Details

### Plugin source structure

```
plugins/mlld/
├── .claude-plugin/plugin.json   # Claude Code plugin manifest
├── .lsp.json                    # LSP config
├── .mcp.json                    # MCP server config
├── skills/                      # Skill definitions (SKILL.md files)
├── examples/                    # Reference orchestrator templates
├── commands/                    # Plugin commands
└── hooks/
    ├── hooks.json               # Hook definitions (PostToolUse)
    └── skill-nudge.sh           # Nudge script for llm/ writes
```

### Install paths per harness

Built-in mlld plugin:

| Harness      | Target directory                          |
|-------------|-------------------------------------------|
| Claude Code | Managed by `claude plugin install`         |
| Codex       | `~/.codex/skills/mlld/`                   |
| Pi          | `~/.pi/agent/skills/mlld/`                |
| OpenCode    | `~/.config/opencode/skills/mlld/`         |

Registry skills (`@author/skill-name`):

| Harness      | Target directory                              |
|-------------|-----------------------------------------------|
| Claude Code | `~/.claude/skills/{name}/`                     |
| Codex       | `~/.codex/skills/{name}/`                     |
| Pi          | `~/.pi/agent/skills/{name}/`                  |
| OpenCode    | `~/.config/opencode/skills/{name}/`           |

### Version markers

Plain text `.version` file at install root containing the version string. Used by:
- `mlld skill status` to compare installed vs current version
- `scripts/postinstall.js` to detect update vs first install

Built-in plugin: `{harnessDir}/skills/mlld/.version` (mlld package version).
Registry skills: `{harnessDir}/skills/{name}/.version` (registry module version).

### Hook mechanism

`hooks.json` registers a PostToolUse hook on Write|Edit. The `skill-nudge.sh` script reads tool input JSON from stdin, extracts `file_path`, and prints a skill reminder if the path is under `llm/`.

### Update lifecycle

1. `npm install mlld` → postinstall detects harnesses
2. If `.version` markers exist → silently re-copy skills, print refresh message
3. If first install + harnesses detected → print nudge to run `mlld skill install`
4. `mlld skill install` → copies skills + writes `.version` marker

### Registry skill install flow

1. `mlld skill install @author/name` → `RegistryResolver.resolve()` fetches module
2. Validates `metadata.isDirectory && metadata.moduleType === 'skill'`
3. Writes `metadata.directoryFiles` to each detected harness skill directory
4. Writes `.version` marker with registry module version

### Adding a new harness

1. Add detection logic in `cli/commands/skill.ts` `detectHarness()`
2. Add install/uninstall logic in `installHarness()`/`uninstallHarness()`
3. Add skill directory path in `getSkillDir()`
4. Add detection in `scripts/postinstall.js`
