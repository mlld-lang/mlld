import { vi } from 'vitest';
import type { DirectiveNode, MeldNode } from 'meld-spec';
import { InterpreterState, type StateConfig } from '../../src/interpreter/state/state.js';
import type { LocationData } from '../../src/interpreter/subInterpreter.js';
import { EmbedDirectiveHandler, ImportDirectiveHandler } from './directive-handlers.js';

// Mock fs module
vi.mock('fs', () => ({
  readFileSync: vi.fn().mockReturnValue('Mock embedded content'),
  writeFileSync: vi.fn()
}));

// Mock path module
vi.mock('path', () => ({
  join: vi.fn((...args) => args.join('/')),
  resolve: vi.fn((...args) => args.join('/')),
  dirname: vi.fn((p) => p.split('/').slice(0, -1).join('/')),
  basename: vi.fn((p) => p.split('/').pop())
}));

// Export handler instances
export const embedDirectiveHandler = new EmbedDirectiveHandler();
export const importDirectiveHandler = new ImportDirectiveHandler();

// Mock InterpreterState
export class MockInterpreterState extends InterpreterState {
  constructor(config?: StateConfig) {
    super(config);
  }

  // Alias methods for backward compatibility
  setText = this.setTextVar;
  getText = this.getTextVar;
  setData = this.setDataVar;
  getData = this.getDataVar;

  override addNode(node: MeldNode): void {
    super.addNode(node);
  }

  override getNodes(): MeldNode[] {
    return super.getNodes();
  }

  override setTextVar(name: string, value: string): void {
    super.setTextVar(name, value);
  }

  override getTextVar(name: string): string | undefined {
    return super.getTextVar(name);
  }

  override getAllTextVars(): Map<string, string> {
    return super.getAllTextVars();
  }

  override setDataVar(name: string, value: any): void {
    super.setDataVar(name, value);
  }

  override getDataVar(name: string): any {
    return super.getDataVar(name);
  }

  override getAllDataVars(): Map<string, any> {
    return super.getAllDataVars();
  }

  override hasDataVar(name: string): boolean {
    return super.hasDataVar(name);
  }

  override setPathVar(name: string, value: string): void {
    super.setPathVar(name, value);
  }

  override getPathVar(name: string): string | undefined {
    return super.getPathVar(name);
  }

  override setCommand(name: string, fn: Function): void {
    super.setCommand(name, fn);
  }

  override getCommand(name: string): Function | undefined {
    return super.getCommand(name);
  }

  override getAllCommands(): Map<string, Function> {
    return super.getAllCommands();
  }

  override addImport(path: string): void {
    super.addImport(path);
  }

  override hasImport(path: string): boolean {
    return super.hasImport(path);
  }

  override mergeChildState(childState: InterpreterState): void {
    super.mergeChildState(childState);
  }

  override clone(): InterpreterState {
    return super.clone();
  }
}

// Mock handler factory
function createMockHandler(kind: string) {
  switch (kind) {
    case 'data':
      return {
        canHandle: (k: string) => k === 'data',
        handle: (node: DirectiveNode, state: InterpreterState) => {
          const data = node.directive;
          if (!data.name) {
            throw new Error('Data directive requires a name');
          }
          state.setDataVar(data.name, data.value);
        }
      };
    case 'text':
      return {
        canHandle: (k: string) => k === 'text',
        handle: (node: DirectiveNode, state: InterpreterState) => {
          const data = node.directive;
          if (!data.name) {
            throw new Error('Text directive requires a name');
          }
          state.setTextVar(data.name, data.value);
        }
      };
    case 'run':
      return {
        canHandle: (k: string) => k === 'run',
        handle: (node: DirectiveNode, state: InterpreterState) => {
          const data = node.directive;
          const command = state.getCommand(data.command);
          if (command) {
            command(data.args);
          }
        }
      };
    case 'define':
      return {
        canHandle: (k: string) => k === 'define',
        handle: (node: DirectiveNode, state: InterpreterState) => {
          const data = node.directive;
          if (!data.name) {
            throw new Error('Define directive requires a name');
          }
          state.setCommand(data.name, data.fn);
        }
      };
    case 'path':
      return {
        canHandle: (k: string) => k === 'path',
        handle: (node: DirectiveNode, state: InterpreterState) => {
          const data = node.directive;
          if (!data.name) {
            throw new Error('Path directive requires a name');
          }
          state.setPathVar(data.name, data.value);
        }
      };
    default:
      return undefined;
  }
}

// Export mock handler factory
export { createMockHandler }; 