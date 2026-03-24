/**
 * Tool collection type definitions for MCP tool gateway.
 */

export interface ToolDefinition {
  mlld?: string;
  labels?: string[];
  description?: string;
  bind?: Record<string, unknown>;
  expose?: string[];
  optional?: string[];
  controlArgs?: string[];
}

export type ToolCollection = Record<string, ToolDefinition>;
