/import { @claudeAgentSdkAdapter } from @mlld/stream-claude-agent-sdk

/run stream @chat("Use a tool") with { streamFormat: @claudeAgentSdkAdapter }