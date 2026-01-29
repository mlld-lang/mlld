/**
 * mlld Development MCP Server Command
 *
 * Starts an MCP server that provides mlld language introspection tools
 * for use during development (e.g., with Claude Code).
 *
 * This is separate from `mlld mcp` which serves user-defined tools.
 *
 * Tools provided:
 * - mlld_validate: Validate syntax, return errors/warnings
 * - mlld_analyze: Full module analysis (exports, executables, imports, etc.)
 * - mlld_ast: Get parsed AST
 *
 * Usage:
 *   mlld mcp-dev
 *
 * Configure in claude_desktop_config.json:
 *   {
 *     "mcpServers": {
 *       "mlld-dev": {
 *         "command": "mlld",
 *         "args": ["mcp-dev"]
 *       }
 *     }
 *   }
 */

import { DevMCPServer } from '../mcp/DevMCPServer';

export async function mcpDevCommand(_args?: string[]): Promise<void> {
  const server = new DevMCPServer();
  await server.start();
}
