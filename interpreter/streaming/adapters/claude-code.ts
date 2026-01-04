/**
 * Claude Code SDK Streaming Adapter
 *
 * Pre-configured adapter for parsing Claude Code SDK NDJSON streaming output.
 * Handles thinking, messages, tool use/result, errors, and usage metadata.
 */

import { NDJSONAdapter, createNDJSONAdapter, COMMON_SCHEMAS } from './ndjson';
import type { AdapterConfig, EventSchema } from './base';
import { DEFAULT_TEMPLATES } from '../template-interpolator';

/**
 * Event schemas for Claude Code SDK streaming format.
 */
export const CLAUDE_CODE_SCHEMAS: EventSchema[] = [
  // Claude CLI with --include-partial-messages (Anthropic API wrapped format)
  {
    ...COMMON_SCHEMAS.streamEventTextDelta,
    templates: DEFAULT_TEMPLATES.message
  },
  {
    ...COMMON_SCHEMAS.streamEventMessageDelta,
    templates: DEFAULT_TEMPLATES.metadata
  },
  // Direct streaming format (if ever used)
  {
    ...COMMON_SCHEMAS.claudeCodeThinking,
    templates: DEFAULT_TEMPLATES.thinking
  },
  {
    ...COMMON_SCHEMAS.claudeCodeMessage,
    templates: DEFAULT_TEMPLATES.message
  },
  {
    ...COMMON_SCHEMAS.claudeCodeToolUse,
    templates: DEFAULT_TEMPLATES.toolUse
  },
  {
    ...COMMON_SCHEMAS.claudeCodeToolResult,
    templates: DEFAULT_TEMPLATES.toolResult
  },
  {
    ...COMMON_SCHEMAS.claudeCodeError,
    templates: DEFAULT_TEMPLATES.error
  },
  {
    ...COMMON_SCHEMAS.claudeCodeUsage,
    templates: DEFAULT_TEMPLATES.metadata
  },
  // Anthropic API direct (fallback)
  {
    ...COMMON_SCHEMAS.contentBlockDelta,
    templates: DEFAULT_TEMPLATES.message
  },
  {
    ...COMMON_SCHEMAS.messageDelta,
    templates: DEFAULT_TEMPLATES.metadata
  }
];

/**
 * Default schema for unrecognized events.
 */
export const CLAUDE_CODE_DEFAULT_SCHEMA: EventSchema = {
  kind: 'unknown',
  extract: {
    raw: 'data',
    type: 'type'
  }
};

/**
 * Adapter configuration for Claude Code SDK.
 */
export const CLAUDE_CODE_CONFIG: AdapterConfig = {
  name: 'claude-code',
  format: 'ndjson',
  schemas: CLAUDE_CODE_SCHEMAS,
  defaultSchema: CLAUDE_CODE_DEFAULT_SCHEMA
};

/**
 * Create a Claude Code SDK streaming adapter.
 */
export function createClaudeCodeAdapter(): NDJSONAdapter {
  return createNDJSONAdapter(CLAUDE_CODE_CONFIG);
}

/**
 * Pre-instantiated adapter instance for convenience.
 */
export const claudeCodeAdapter = createClaudeCodeAdapter();

/**
 * Claude Code SDK adapter class for direct instantiation.
 */
export class ClaudeCodeAdapter extends NDJSONAdapter {
  constructor() {
    super(CLAUDE_CODE_CONFIG);
  }
}
