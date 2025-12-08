/import { @claudeAgentSdkAdapter } from @mlld/stream-claude-agent-sdk
stream /exe @chat(prompt) = run { claude "@prompt" --output-format stream-json }

# Default parsing (generic NDJSON)
/show @chat("Hello")

# Claude-specific parsing (string shortcut)
/run stream @chat("Use a tool") with { streamFormat: "claude-code" }

# Claude-specific parsing (imported config)
/run stream @chat("Use a tool") with { streamFormat: @claudeAgentSdkAdapter }