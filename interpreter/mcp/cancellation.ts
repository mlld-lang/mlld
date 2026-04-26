import type { Environment } from '@interpreter/env/Environment';

export const MCP_CANCELLATION_CONTEXT = 'mcp-cancellation';

export interface McpCancellationContext {
  signal: AbortSignal;
}

export class McpRequestCancelledError extends Error {
  readonly code = 'MCP_REQUEST_CANCELLED';

  constructor(message = 'MCP request cancelled: client connection closed') {
    super(message);
    this.name = 'McpRequestCancelledError';
  }
}

export function createMcpRequestCancelledError(reason?: unknown): McpRequestCancelledError {
  if (reason instanceof McpRequestCancelledError) {
    return reason;
  }
  if (reason instanceof Error && reason.message.trim().length > 0) {
    return new McpRequestCancelledError(reason.message);
  }
  if (typeof reason === 'string' && reason.trim().length > 0) {
    return new McpRequestCancelledError(reason);
  }
  return new McpRequestCancelledError();
}

export function getMcpCancellationContext(env: Environment): McpCancellationContext | undefined {
  const context = env.getExecutionContext<McpCancellationContext>(MCP_CANCELLATION_CONTEXT);
  if (context?.signal instanceof AbortSignal) {
    return context;
  }
  return undefined;
}

export function throwIfMcpRequestCancelled(env: Environment): void {
  const signal = getMcpCancellationContext(env)?.signal;
  if (signal?.aborted) {
    throw createMcpRequestCancelledError(signal.reason);
  }
}
