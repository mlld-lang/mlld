export type JSONRPCId = string | number | null;

export interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: JSONRPCId;
  method: string;
  params?: unknown;
}

export interface JSONRPCError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: JSONRPCId;
  result?: unknown;
  error?: JSONRPCError;
}

export interface JSONSchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  items?: JSONSchemaProperty;
  properties?: Record<string, JSONSchemaProperty>;
}

export interface MCPToolSchema {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, JSONSchemaProperty>;
    required: string[];
  };
}

export interface InitializeRequest extends JSONRPCRequest {
  method: 'initialize';
  params: {
    protocolVersion: string;
    capabilities: Record<string, unknown>;
    clientInfo: {
      name: string;
      version: string;
    };
  };
}

export interface InitializeResult {
  protocolVersion: string;
  capabilities: {
    tools?: Record<string, unknown>;
    [key: string]: unknown;
  };
  serverInfo: {
    name: string;
    version: string;
  };
}

export interface ToolsListRequest extends JSONRPCRequest {
  method: 'tools/list';
  params?: Record<string, unknown>;
}

export interface ToolsListResult {
  tools: MCPToolSchema[];
}

export interface ToolsCallRequest extends JSONRPCRequest {
  method: 'tools/call';
  params: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

export interface ToolsCallResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

export enum MCPErrorCode {
  ParseError = -32700,
  InvalidRequest = -32600,
  MethodNotFound = -32601,
  InvalidParams = -32602,
  InternalError = -32603,
  ServerError = -32000,
}
