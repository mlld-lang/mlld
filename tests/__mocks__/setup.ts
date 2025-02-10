import { vi, beforeEach } from 'vitest';
import type { DirectiveNode, MeldNode } from 'meld-spec';
import { InterpreterState } from '../../src/interpreter/state/state';
import { ErrorFactory } from '../../src/interpreter/errors/factory';
import { HandlerContext } from '../../src/interpreter/directives/types';
import { embedDirectiveHandler, importDirectiveHandler } from './directive-handlers';

// Mock file system state
const mockFiles: Record<string, string> = {};

// Mock file management functions
function getMockFiles(): Record<string, string> {
  return mockFiles;
}

export function addMockFile(path: string, content: string) {
  mockFiles[path] = content;
}

export function clearMockFiles() {
  Object.keys(mockFiles).forEach(key => delete mockFiles[key]);
}

// Mock fs module
vi.mock('fs', () => ({
  default: {
    readFileSync: vi.fn((path: string) => {
      if (mockFiles[path]) {
        return mockFiles[path];
      }
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    }),
    writeFileSync: vi.fn((path: string, content: string) => {
      mockFiles[path] = content;
    }),
    existsSync: vi.fn((path: string) => !!mockFiles[path]),
    mkdirSync: vi.fn(),
    promises: {
      readFile: vi.fn(async (path: string) => {
        if (mockFiles[path]) {
          return mockFiles[path];
        }
        throw new Error(`ENOENT: no such file or directory, open '${path}'`);
      }),
      writeFile: vi.fn(async (path: string, content: string) => {
        mockFiles[path] = content;
      })
    }
  },
  readFileSync: vi.fn((path: string) => {
    if (mockFiles[path]) {
      return mockFiles[path];
    }
    throw new Error(`ENOENT: no such file or directory, open '${path}'`);
  }),
  writeFileSync: vi.fn((path: string, content: string) => {
    mockFiles[path] = content;
  }),
  existsSync: vi.fn((path: string) => !!mockFiles[path]),
  mkdirSync: vi.fn(),
  promises: {
    readFile: vi.fn(async (path: string) => {
      if (mockFiles[path]) {
        return mockFiles[path];
      }
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    }),
    writeFile: vi.fn(async (path: string, content: string) => {
      mockFiles[path] = content;
    })
  }
}));

// Mock path module
vi.mock('path', () => {
  return {
    default: {
      isAbsolute: vi.fn((path: string) => path.startsWith('/')),
      normalize: vi.fn((path: string) => {
        const normalized = path.replace(/\/\.\//g, '/').replace(/\/[^/]+\/\.\./g, '');
        return normalized.startsWith('/') ? normalized : `/${normalized}`;
      }),
      resolve: vi.fn((...paths: string[]) => {
        const joined = paths.join('/').replace(/\/\.\//g, '/').replace(/\/[^/]+\/\.\./g, '');
        return joined.startsWith('/') ? joined : `/${joined}`;
      }),
      join: vi.fn((...paths: string[]) => {
        const joined = paths.join('/').replace(/\/\.\//g, '/').replace(/\/[^/]+\/\.\./g, '');
        return joined.startsWith('/') ? joined : `/${joined}`;
      }),
      dirname: vi.fn((path: string) => {
        const dir = path.split('/').slice(0, -1).join('/');
        return dir || '/';
      })
    },
    isAbsolute: vi.fn((path: string) => path.startsWith('/')),
    normalize: vi.fn((path: string) => {
      const normalized = path.replace(/\/\.\//g, '/').replace(/\/[^/]+\/\.\./g, '');
      return normalized.startsWith('/') ? normalized : `/${normalized}`;
    }),
    resolve: vi.fn((...paths: string[]) => {
      const joined = paths.join('/').replace(/\/\.\//g, '/').replace(/\/[^/]+\/\.\./g, '');
      return joined.startsWith('/') ? joined : `/${joined}`;
    }),
    join: vi.fn((...paths: string[]) => {
      const joined = paths.join('/').replace(/\/\.\//g, '/').replace(/\/[^/]+\/\.\./g, '');
      return joined.startsWith('/') ? joined : `/${joined}`;
    }),
    dirname: vi.fn((path: string) => {
      const dir = path.split('/').slice(0, -1).join('/');
      return dir || '/';
    })
  };
});

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
          throw ErrorFactory.createDirectiveError(
            'Data directive requires a name',
            'data',
            node.location?.start
          );
        }
        state.setDataVar(data.name, data.value);
      }
    },
    text: {
      canHandle: (k: string) => k === 'text',
      handle: async (node: DirectiveNode, state: InterpreterState, context: HandlerContext) => {
        const data = node.directive;
        if (!data.name) {
          throw ErrorFactory.createDirectiveError(
            'Text directive requires a name',
            'text',
            node.location?.start
          );
        }
        state.setTextVar(data.name, data.value);
      }
    },
    run: {
      canHandle: (k: string) => k === 'run',
      handle: async (node: DirectiveNode, state: InterpreterState, context: HandlerContext) => {
        const data = node.directive;
        if (!data.command) {
          throw ErrorFactory.createDirectiveError(
            'Run directive requires a command',
            'run',
            node.location?.start
          );
        }
        const commandData = state.getCommand(data.command);
        if (commandData && typeof commandData === 'object' && 'command' in commandData) {
          const { command } = commandData as { command: string };
          console.log(`[MOCK] Executing command: ${command}`);
        }
      }
    },
    define: {
      canHandle: (k: string) => k === 'define',
      handle: async (node: DirectiveNode, state: InterpreterState, context: HandlerContext) => {
        const data = node.directive;
        if (!data.name) {
          throw ErrorFactory.createDirectiveError(
            'Define directive requires a name',
            'define',
            node.location?.start
          );
        }
        state.setCommand(data.name, data.command || '');
      }
    }
  };
  return handlers[kind];
}

// File system utilities
export function mockFile(path: string, content: string): void {
  mockFiles[path] = content;
}

// Add test fixtures
beforeEach(() => {
  clearMockFiles();
  
  // Basic fixtures
  addMockFile('/Users/adam/dev/meld/src/__fixtures__/markdown/basic.md', `
# Basic Document

## Section One
Some content in section one

## Section Two
Some content in section two

### Nested Section
This is a nested section
\`\`\`typescript
function test() {
  console.log('Hello');
}
\`\`\`
`);

  addMockFile('/Users/adam/dev/meld/src/__fixtures__/xml/expected/basic.xml', `<BasicDocument title="Basic Document"><Section title="Section One" hlevel="2">Some content in section one</Section><Section title="Section Two" hlevel="2">Some content in section two<Section title="Nested Section" hlevel="3">This is a nested section\`\`\`typescript
function test() {
  console.log('Hello');
}
\`\`\`</Section></Section></BasicDocument>`);

  // Complex fixtures
  addMockFile('/Users/adam/dev/meld/src/__fixtures__/markdown/complex.md', `
# Complex Document

## 你好，世界
Some unicode content

## 🎉 Emoji Title 🚀
こんにちは and Café

## Code Blocks
\`\`\`typescript
interface Test {
  name: string;
}
\`\`\`
\`\`\`python
def hello():
    print("Hello")
\`\`\`

## About the Project
Project info

### About Development
Dev info

## Getting Started (Quick Guide)
This section has a title with parentheses
`);

  addMockFile('/Users/adam/dev/meld/src/__fixtures__/xml/expected/complex.xml', `<ComplexDocument title="Complex Document"><Section title="你好，世界" hlevel="2">Some unicode content</Section><Section title="🎉 Emoji Title 🚀" hlevel="2">こんにちは and Café</Section><Section title="Code Blocks" hlevel="2">\`\`\`typescript
interface Test {
  name: string;
}
\`\`\`
\`\`\`python
def hello():
    print("Hello")
\`\`\`</Section><Section title="About the Project" hlevel="2">Project info<Section title="About Development" hlevel="3">Dev info</Section></Section><Section title="Getting Started (Quick Guide)" hlevel="2">This section has a title with parentheses</Section></ComplexDocument>`);

  // Edge cases
  addMockFile('/Users/adam/dev/meld/src/__fixtures__/markdown/edge-cases.md', `
# Edge Cases

## Malformed Code Block
\`\`\`typescript
const x = {
  // Missing closing brace

## Incomplete Code Fence
\`\`\`python
def test():
    print("No closing fence")

## Empty Section

## HTML in Markdown
<h1>Raw HTML header</h1>
<div class="test">
  Some content
</div>
`);

  // Real-world examples
  addMockFile('/Users/adam/dev/meld/src/__fixtures__/real-world/architecture.md', `
# Architecture Documentation

## System Overview
The system consists of multiple components:
- Frontend
- Backend
- Database

## Component Details
### Frontend
Built with React & TypeScript

### Backend
Node.js with Express

### Database
PostgreSQL for persistence

## Deployment
Using Docker & Kubernetes
`);

  addMockFile('/Users/adam/dev/meld/src/__fixtures__/xml/expected/real-world/architecture.xml', `<ArchitectureDocumentation title="Architecture Documentation"><Section title="System Overview" hlevel="2">The system consists of multiple components:
- Frontend
- Backend
- Database</Section><Section title="Component Details" hlevel="2"><Section title="Frontend" hlevel="3">Built with React &amp; TypeScript</Section><Section title="Backend" hlevel="3">Node.js with Express</Section><Section title="Database" hlevel="3">PostgreSQL for persistence</Section></Section><Section title="Deployment" hlevel="2">Using Docker &amp; Kubernetes</Section></ArchitectureDocumentation>`);
});

// Export utilities
export { createMockHandler, mockFiles }; 