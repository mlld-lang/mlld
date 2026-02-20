---
updated: 2026-02-14
tags: #dev, #plugins, #skills
related-docs: docs/dev/DOCS-DEV.md
related-code: cli/commands/skill.ts, cli/commands/plugin.ts, plugins/mlld/, scripts/postinstall.js
---

# Skill Install & Plugin Hooks

## tldr

`mlld skill install` detects coding tools (Claude Code, Codex, Pi, OpenCode) and installs mlld authoring skills to each. npm postinstall nudges first-time users and silently updates existing installs.

## Principles

- Harness-agnostic skill distribution from a single `plugins/mlld/` source
- Version markers (`.version` files) distinguish first install from update
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

| Harness      | Target directory                          |
|-------------|-------------------------------------------|
| Claude Code | Managed by `claude plugin install`         |
| Codex       | `~/.codex/skills/mlld/`                   |
| Pi          | `~/.pi/agent/skills/mlld/`                |
| OpenCode    | `~/.config/opencode/skills/mlld/`         |

### Version markers

Plain text `.version` file at install root containing the mlld package version string. Used by:
- `mlld skill status` to compare installed vs current version
- `scripts/postinstall.js` to detect update vs first install

### Hook mechanism

`hooks.json` registers a PostToolUse hook on Write|Edit. The `skill-nudge.sh` script reads tool input JSON from stdin, extracts `file_path`, and prints a skill reminder if the path is under `llm/`.

### Update lifecycle

1. `npm install mlld` → postinstall detects harnesses
2. If `.version` markers exist → silently re-copy skills, print refresh message
3. If first install + harnesses detected → print nudge to run `mlld skill install`
4. `mlld skill install` → copies skills + writes `.version` marker

### Adding a new harness

1. Add detection logic in `cli/commands/skill.ts` `detectHarness()`
2. Add install/uninstall logic in `installHarness()`/`uninstallHarness()`
3. Add detection in `scripts/postinstall.js`
