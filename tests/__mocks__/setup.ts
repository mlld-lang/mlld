import { vi } from 'vitest';
import { DirectiveNode } from 'meld-ast';
import { InterpreterState } from '../../src/interpreter/state/state';

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

// Mock InterpreterState
class MockInterpreterState {
  private nodes: any[] = [];
  private textVars: Map<string, string> = new Map();
  private dataVars: Map<string, any> = new Map();
  private pathVars: Map<string, string> = new Map();
  private commands: Map<string, Function> = new Map();
  private imports: Set<string> = new Set();

  addNode(node: any) {
    this.nodes.push(node);
  }

  getNodes() {
    return this.nodes;
  }

  setTextVar(name: string, value: string) {
    this.textVars.set(name, value);
  }

  getTextVar(name: string) {
    return this.textVars.get(name);
  }

  setDataVar(name: string, value: any) {
    this.dataVars.set(name, value);
  }

  getDataVar(name: string) {
    return this.dataVars.get(name);
  }

  setPathVar(name: string, value: string) {
    this.pathVars.set(name, value);
  }

  getPathVar(name: string) {
    return this.pathVars.get(name);
  }

  setCommand(name: string, fn: Function) {
    this.commands.set(name, fn);
  }

  getCommand(name: string) {
    return this.commands.get(name);
  }

  addImport(path: string) {
    this.imports.add(path);
  }

  hasImport(path: string) {
    return this.imports.has(path);
  }

  getAllTextVars() {
    return new Map(this.textVars);
  }

  getAllDataVars() {
    return new Map(this.dataVars);
  }

  getAllPathVars() {
    return new Map(this.pathVars);
  }

  getAllCommands() {
    return new Map(this.commands);
  }

  // Alias methods for backward compatibility
  setText = this.setTextVar;
  getText = this.getTextVar;
  setData = this.setDataVar;
  getData = this.getDataVar;
}

vi.mock('../interpreter/state/state', () => ({
  InterpreterState: MockInterpreterState
}));

// Mock handler factory
function createMockHandler(kind: string) {
  return {
    canHandle: (k: string) => k === kind,
    handle: vi.fn((node: any, state: any) => {
      // Basic implementation that stores values in state
      if (node.properties) {
        if (node.properties.identifier) {
          state.setTextVar(node.properties.identifier, node.properties.value);
        }
        if (node.properties.name) {
          state.setDataVar(node.properties.name, node.properties.value);
        }
        if (node.properties.command) {
          state.setDataVar('__pendingCommand', {
            command: node.properties.command,
            background: !!node.properties.background,
            location: node.location
          });
        }
      }
    })
  };
}

// Mock directive handlers
vi.mock('../interpreter/directives/embed', () => ({
  EmbedDirectiveHandler: vi.fn().mockImplementation(() => createMockHandler('embed'))
}));

vi.mock('../interpreter/directives/import', () => ({
  ImportDirectiveHandler: vi.fn().mockImplementation(() => createMockHandler('import'))
}));

vi.mock('../interpreter/directives/run', () => ({
  RunDirectiveHandler: vi.fn().mockImplementation(() => createMockHandler('run'))
}));

vi.mock('../interpreter/directives/text', () => ({
  TextDirectiveHandler: vi.fn().mockImplementation(() => createMockHandler('text'))
}));

vi.mock('../interpreter/directives/data', () => ({
  DataDirectiveHandler: vi.fn().mockImplementation(() => createMockHandler('data'))
}));

vi.mock('../interpreter/directives/path', () => ({
  PathDirectiveHandler: vi.fn().mockImplementation(() => createMockHandler('path'))
}));

vi.mock('../interpreter/directives/define', () => ({
  DefineDirectiveHandler: vi.fn().mockImplementation(() => createMockHandler('define'))
}));

export {
  MockInterpreterState,
  createMockHandler
}; 