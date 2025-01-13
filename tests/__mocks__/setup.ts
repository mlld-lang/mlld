import { vi } from 'vitest';
import type { DirectiveNode, MeldNode } from 'meld-spec';
import { InterpreterState } from '../../src/interpreter/state/state';
import { ErrorFactory } from '../../src/interpreter/errors/factory';
import { HandlerContext } from '../../src/interpreter/directives/types';
import { embedDirectiveHandler, importDirectiveHandler } from './directive-handlers';

// Mock file system state
const mockFiles: Record<string, string> = {};

// Mock fs module
vi.mock('fs', () => ({
  readFileSync: vi.fn((path: string) => {
    if (path in mockFiles) {
      return mockFiles[path];
    }
    throw new Error(`Mock file not found: ${path}`);
  }),
  writeFileSync: vi.fn((path: string, content: string) => {
    mockFiles[path] = content;
  }),
  existsSync: vi.fn((path: string) => path in mockFiles),
  mkdirSync: vi.fn(),
  promises: {
    readFile: vi.fn(async (path: string) => {
      if (path in mockFiles) {
        return mockFiles[path];
      }
      throw new Error(`Mock file not found: ${path}`);
    }),
    writeFile: vi.fn(async (path: string, content: string) => {
      mockFiles[path] = content;
    })
  }
}));

// Mock path module
vi.mock('path', () => ({
  isAbsolute: vi.fn((path: string) => path.startsWith('/')),
  normalize: vi.fn((path: string) => path.replace(/\/\.\//g, '/').replace(/\/[^/]+\/\.\./g, '')),
  resolve: vi.fn((...paths: string[]) => paths.join('/')),
  join: vi.fn((...paths: string[]) => paths.join('/')),
  dirname: vi.fn((path: string) => path.split('/').slice(0, -1).join('/'))
}));

// Mock InterpreterState with enhanced tracking
export class MockInterpreterState extends InterpreterState {
  private nodeHistory: MeldNode[] = [];
  private textVarHistory: Map<string, string[]> = new Map();
  private dataVarHistory: Map<string, any[]> = new Map();

  constructor() {
    super();
  }

  // Track node history
  override addNode(node: MeldNode): void {
    this.nodeHistory.push({ ...node });
    super.addNode(node);
  }

  getNodeHistory(): MeldNode[] {
    return [...this.nodeHistory];
  }

  // Track text var history
  override setTextVar(name: string, value: string): void {
    const history = this.textVarHistory.get(name) || [];
    history.push(value);
    this.textVarHistory.set(name, history);
    super.setTextVar(name, value);
  }

  getTextVarHistory(name: string): string[] {
    return this.textVarHistory.get(name) || [];
  }

  // Track data var history
  override setDataVar(name: string, value: any): void {
    const history = this.dataVarHistory.get(name) || [];
    history.push(value);
    this.dataVarHistory.set(name, history);
    super.setDataVar(name, value);
  }

  getDataVarHistory(name: string): any[] {
    return this.dataVarHistory.get(name) || [];
  }

  // Clear history
  clearHistory(): void {
    this.nodeHistory = [];
    this.textVarHistory.clear();
    this.dataVarHistory.clear();
  }

  // Existing methods with proper error handling
  override mergeChildState(childState: InterpreterState): void {
    try {
      super.mergeChildState(childState);
    } catch (error) {
      throw ErrorFactory.createInterpretError(
        `Failed to merge child state: ${error instanceof Error ? error.message : String(error)}`,
        'State'
      );
    }
  }
}

// Mock handler factory with enhanced error handling
function createMockHandler(kind: string) {
  const handlers: Record<string, any> = {
    data: {
      canHandle: (k: string) => k === 'data',
      handle: async (node: DirectiveNode, state: InterpreterState, context: HandlerContext) => {
        const data = node.directive;
        if (!data.name) {
          const error = ErrorFactory.createDirectiveError(
            'Data directive requires a name',
            'data',
            node.location?.start
          );
          if (context.mode === 'rightside' && node.location && context.baseLocation) {
            throw ErrorFactory.createWithAdjustedLocation(
              () => error,
              error.message,
              node.location.start,
              context.baseLocation.start
            );
          }
          throw error;
        }
        state.setDataVar(data.name, data.value);
      }
    },
    text: {
      canHandle: (k: string) => k === 'text',
      handle: async (node: DirectiveNode, state: InterpreterState, context: HandlerContext) => {
        const data = node.directive;
        if (!data.name) {
          const error = ErrorFactory.createDirectiveError(
            'Text directive requires a name',
            'text',
            node.location?.start
          );
          if (context.mode === 'rightside' && node.location && context.baseLocation) {
            throw ErrorFactory.createWithAdjustedLocation(
              () => error,
              error.message,
              node.location.start,
              context.baseLocation.start
            );
          }
          throw error;
        }
        state.setTextVar(data.name, data.value, node.location?.start);
      }
    },
    run: {
      canHandle: (k: string) => k === 'run',
      handle: async (node: DirectiveNode, state: InterpreterState, context: HandlerContext) => {
        const data = node.directive;
        if (!data.command) {
          const error = ErrorFactory.createDirectiveError(
            'Run directive requires a command',
            'run',
            node.location?.start
          );
          if (context.mode === 'rightside' && node.location && context.baseLocation) {
            throw ErrorFactory.createWithAdjustedLocation(
              () => error,
              error.message,
              node.location.start,
              context.baseLocation.start
            );
          }
          throw error;
        }
        const commandData = state.getCommand(data.command);
        if (commandData && typeof commandData === 'object' && 'command' in commandData) {
          const { command, options } = commandData as { command: string; options?: Record<string, unknown> };
          console.log(`[MOCK] Executing command: ${command}`, options);
          state.appendOutput(`Executed: ${command}`, node.location?.start);
        }
      }
    },
    define: {
      canHandle: (k: string) => k === 'define',
      handle: async (node: DirectiveNode, state: InterpreterState, context: HandlerContext) => {
        const data = node.directive;
        if (!data.name) {
          const error = ErrorFactory.createDirectiveError(
            'Define directive requires a name',
            'define',
            node.location?.start
          );
          if (context.mode === 'rightside' && node.location && context.baseLocation) {
            throw ErrorFactory.createWithAdjustedLocation(
              () => error,
              error.message,
              node.location.start,
              context.baseLocation.start
            );
          }
          throw error;
        }
        state.setCommand(data.name, data.command || '', data.options);
      }
    }
  };
  return handlers[kind];
}

// File system utilities
export function mockFile(path: string, content: string): void {
  mockFiles[path] = content;
}

export function clearMockFiles(): void {
  Object.keys(mockFiles).forEach(key => delete mockFiles[key]);
}

// Export utilities
export { createMockHandler, mockFiles }; 