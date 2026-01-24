import * as readline from 'readline';
import { version } from '@core/version';
import type { Environment } from '@interpreter/env/Environment';
import type { ExecutableVariable } from '@core/types/variable';
import type { ToolCollection } from '@core/types/tools';
import { FunctionRouter } from './FunctionRouter';
import { generateToolSchema } from './SchemaGenerator';
import type {
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCError,
  MCPToolSchema,
  InitializeRequest,
  InitializeResult,
  ToolsListResult,
  ToolsCallRequest,
  ToolsCallResult,
} from './types';
import { MCPErrorCode } from './types';

const NOT_INITIALIZED_ERROR_CODE = -32002;

export interface MCPServerOptions {
  environment: Environment;
  exportedFunctions: Map<string, ExecutableVariable>;
  toolCollection?: ToolCollection;
}

export class MCPServer {
  private readonly environment: Environment;
  private readonly exportedFunctions: Map<string, ExecutableVariable>;
  private readonly toolCollection?: ToolCollection;
  private readonly toolMap?: Map<string, ExecutableVariable>;
  private readonly router: FunctionRouter;
  private initialized = false;

  constructor(options: MCPServerOptions) {
    this.environment = options.environment;
    this.exportedFunctions = options.exportedFunctions;
    this.toolCollection = options.toolCollection;
    this.toolMap = this.toolCollection ? this.buildToolMap(this.toolCollection) : undefined;
    this.router = new FunctionRouter({ environment: this.environment, toolCollection: this.toolCollection });
  }

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
        name: 'mlld',
        version,
      },
    };
  }

  private handleToolsList(): ToolsListResult {
    this.ensureInitialized();

    const tools: MCPToolSchema[] = [];
    if (this.toolCollection && this.toolMap) {
      for (const [toolName, execVar] of this.toolMap.entries()) {
        const toolDef = this.toolCollection[toolName];
        const schema = generateToolSchema(toolName, execVar);
        if (toolDef?.description) {
          schema.description = toolDef.description;
        }
        tools.push(schema);
      }
    } else {
      for (const [name, variable] of this.exportedFunctions.entries()) {
        tools.push(generateToolSchema(name, variable));
      }
    }

    return { tools };
  }

  private buildToolMap(toolCollection: ToolCollection): Map<string, ExecutableVariable> {
    const map = new Map<string, ExecutableVariable>();

    for (const [toolName, toolDef] of Object.entries(toolCollection)) {
      const execName = toolDef?.mlld;
      if (!execName) {
        throw new Error(`Tool '${toolName}' is missing 'mlld' reference`);
      }
      const execVar = this.exportedFunctions.get(execName);
      if (!execVar) {
        throw new Error(`Tool '${toolName}' references unknown executable '@${execName}'`);
      }
      map.set(toolName, execVar);
    }

    return map;
  }

  private async handleToolsCall(request: ToolsCallRequest): Promise<ToolsCallResult> {
    this.ensureInitialized();

    const { name, arguments: args } = request.params;

    try {
      const result = await this.router.executeFunction(name, args ?? {});
      return {
        content: [
          {
            type: 'text',
            text: result,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: error instanceof Error ? error.message : String(error),
          },
        ],
        isError: true,
      };
    }
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
