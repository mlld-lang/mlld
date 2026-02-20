/**
 * Development MCP Server
 *
 * A standalone MCP server that provides mlld language introspection tools
 * for use during development (e.g., with Claude Code).
 *
 * This is separate from the main MCPServer which serves user-defined tools.
 *
 * Tools provided:
 * - mlld_validate: Validate syntax, return errors/warnings
 * - mlld_analyze: Full module analysis
 * - mlld_ast: Get parsed AST
 */

import * as readline from 'readline';
import { version } from '@core/version';
import { BUILTIN_TOOL_SCHEMAS, executeBuiltinTool } from './BuiltinTools';
import type {
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCError,
  InitializeRequest,
  InitializeResult,
  ToolsListResult,
  ToolsCallRequest,
  ToolsCallResult,
} from './types';
import { MCPErrorCode } from './types';

const NOT_INITIALIZED_ERROR_CODE = -32002;

export class DevMCPServer {
  private initialized = false;

  async start(): Promise<void> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    rl.on('line', async (line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return;
      }

      try {
        const request = JSON.parse(trimmed) as JSONRPCRequest;
        const response = await this.handleRequest(request);
        process.stdout.write(`${JSON.stringify(response)}\n`);
      } catch (error) {
        const response: JSONRPCResponse = {
          jsonrpc: '2.0',
          id: null,
          error: {
            code: MCPErrorCode.ParseError,
            message: error instanceof Error ? error.message : String(error),
          },
        };
        process.stdout.write(`${JSON.stringify(response)}\n`);
      }
    });

    await new Promise<void>(() => {});
  }

  async handleRequest(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    try {
      const result = await this.dispatch(request);
      return {
        jsonrpc: '2.0',
        id: request.id,
        result,
      };
    } catch (error) {
      const rpcError = this.normalizeError(error);
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: rpcError,
      };
    }
  }

  private async dispatch(request: JSONRPCRequest): Promise<unknown> {
    switch (request.method) {
      case 'initialize':
        return this.handleInitialize(request as InitializeRequest);
      case 'tools/list':
        return this.handleToolsList();
      case 'tools/call':
        return this.handleToolsCall(request as ToolsCallRequest);
      default:
        throw {
          code: MCPErrorCode.MethodNotFound,
          message: `Method '${request.method}' not found`,
        } satisfies JSONRPCError;
    }
  }

  private handleInitialize(request: InitializeRequest): InitializeResult {
    this.initialized = true;

    return {
      protocolVersion: request.params.protocolVersion,
      capabilities: {
        tools: {},
      },
      serverInfo: {
        name: 'mlld-dev',
        version,
      },
    };
  }

  private handleToolsList(): ToolsListResult {
    this.ensureInitialized();
    return { tools: BUILTIN_TOOL_SCHEMAS };
  }

  private async handleToolsCall(request: ToolsCallRequest): Promise<ToolsCallResult> {
    this.ensureInitialized();

    const { name, arguments: args } = request.params;

    const result = await executeBuiltinTool(name, args ?? {});
    if (result) {
      return result;
    }

    return {
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw {
        code: NOT_INITIALIZED_ERROR_CODE,
        message: 'Server not initialized',
      } satisfies JSONRPCError;
    }
  }

  private normalizeError(error: unknown): JSONRPCError {
    if (this.isJSONRPCError(error)) {
      return error;
    }

    return {
      code: MCPErrorCode.InternalError,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  private isJSONRPCError(error: unknown): error is JSONRPCError {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      'message' in error
    );
  }
}
