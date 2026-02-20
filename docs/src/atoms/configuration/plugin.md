---
id: config-plugin
title: Claude Code Plugin
brief: Install the mlld plugin for Claude Code
category: configuration
parent: cli
tags: [cli, plugin, claude-code, setup]
related: [config-cli-run]
related-code: [cli/commands/plugin.ts]
updated: 2026-02-13
---

Install the mlld Claude Code plugin for orchestrator authoring skills, the `/mlld:scaffold` command, language server integration, and MCP dev tools.

```bash
mlld plugin install                  # Install for current user
mlld plugin install --scope project  # Install for current project only
mlld plugin status                   # Check if installed
mlld plugin uninstall                # Remove the plugin
```

Requires the `claude` CLI to be installed. The command adds the mlld marketplace (`mlld-lang/mlld`) and installs the plugin through Claude Code's plugin system.

**What's included**:

| Component | Description |
|-----------|-------------|
| Orchestrator skill | Patterns for audit, research, and development pipelines |
| Agent skill | Tool agents, event-driven agents, workflow agents |
| `/mlld:scaffold` | Generate starter orchestrator projects |
| Language server | `.mld` syntax highlighting and diagnostics |
| MCP dev tools | `mlld mcp-dev` for development |

Restart Claude Code after installing to activate the plugin.
