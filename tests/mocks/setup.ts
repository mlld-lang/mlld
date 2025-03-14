import { vi, beforeEach } from 'vitest';
import type { DirectiveNode, MeldNode } from '@core/syntax/types.js';
import { injectable } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import { InterpreterState } from '@tests/mocks/state.js';
import { MeldInterpreterError } from '@core/errors/MeldInterpreterError.js';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import { embedDirectiveHandler, importDirectiveHandler } from '@tests/mocks/directive-handlers.js';

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
vi.mock('path', async () => {
  // Import the path mock factory
  const { createPathMock } = await import('./path');
  
  // Create a single mock instance that will be used for both named and default exports
  const mockExports = await createPathMock();
  
  // Return the mock exports directly - they already include __esModule and default
  return mockExports;
});

/**
 * Enhanced InterpreterState with tracking for tests
 */
@injectable()
@Service('MockInterpreterState with tracking for testing')
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
  mergeChildState(childState: InterpreterState): void {
    try {
      // Get all variables from the child state
      const childTextVars = childState.getAllTextVars();
      const childDataVars = childState.getAllDataVars();
      const childCommands = childState.getAllCommands();
      
      // Merge text variables
      for (const [key, value] of childTextVars.entries()) {
        this.setTextVar(key, value);
      }
      
      // Merge data variables
      for (const [key, value] of childDataVars.entries()) {
        this.setDataVar(key, value);
      }
      
      // Merge commands
      for (const [key, value] of childCommands.entries()) {
        this.setCommand(key, value);
      }
      
      // Merge nodes
      for (const node of childState.getNodes()) {
        this.addNode(node);
      }
    } catch (error) {
      throw new MeldInterpreterError(
        `Failed to merge child state: ${error instanceof Error ? error.message : String(error)}`,
        'State'
      );
    }
  }
}

/**
 * Creates DI-compatible mock directive handlers
 */
@injectable()
@Service('MockDirectiveHandlerFactory for testing')
export class MockDirectiveHandlerFactory {
  constructor() {
    // Empty constructor for DI compatibility
  }
  
  /**
   * Creates a mock directive handler
   */
  createHandler(kind: string) {
    const handlers: Record<string, any> = {
      data: {
        kind: 'definition',
        directiveName: 'data',
        canHandle: (k: string) => k === 'data',
        validate: (node: DirectiveNode) => {
          if (!node.directive.identifier) {
            return { valid: false, errors: ['Data directive requires an identifier'] };
          }
          return true;
        },
        execute: async (node: DirectiveNode, state: any) => {
          const data = node.directive;
          if (!data.identifier) {
            throw new MeldDirectiveError(
              'Data directive requires an identifier',
              'data',
              node.location?.start
            );
          }
          state.setDataVar(data.identifier, data.value);
        }
      },
      text: {
        kind: 'definition',
        directiveName: 'text',
        canHandle: (k: string) => k === 'text',
        validate: (node: DirectiveNode) => {
          if (!node.directive.identifier) {
            return { valid: false, errors: ['Text directive requires an identifier'] };
          }
          return true;
        },
        execute: async (node: DirectiveNode, state: any) => {
          const data = node.directive;
          if (!data.identifier) {
            throw new MeldDirectiveError(
              'Text directive requires an identifier',
              'text',
              node.location?.start
            );
          }
          state.setTextVar(data.identifier, data.value);
        }
      },
      run: {
        kind: 'execution',
        directiveName: 'run',
        canHandle: (k: string) => k === 'run',
        validate: (node: DirectiveNode) => {
          if (!node.directive.command) {
            return { valid: false, errors: ['Run directive requires a command'] };
          }
          return true;
        },
        transform: async (node: DirectiveNode, state: any) => {
          // Transform implementation
          return node;
        },
        execute: async (node: DirectiveNode, state: any) => {
          const data = node.directive;
          if (!data.command) {
            throw new MeldDirectiveError(
              'Run directive requires a command',
              'run',
              node.location?.start
            );
          }
          const commandData = state.getCommand(data.command);
          if (commandData) {
            console.log(`[MOCK] Executing command: ${data.command}`);
          }
        }
      },
      define: {
        kind: 'definition',
        directiveName: 'define',
        canHandle: (k: string) => k === 'define',
        validate: (node: DirectiveNode) => {
          if (!node.directive.identifier) {
            return { valid: false, errors: ['Define directive requires an identifier'] };
          }
          return true;
        },
        execute: async (node: DirectiveNode, state: any) => {
          const data = node.directive;
          if (!data.identifier) {
            throw new MeldDirectiveError(
              'Define directive requires an identifier',
              'define',
              node.location?.start
            );
          }
          state.setCommand(data.identifier, data.command || '');
        }
      }
    };
    
    // Return the appropriate handler or a default one
    return handlers[kind] || {
      kind: 'generic',
      directiveName: kind,
      canHandle: (k: string) => k === kind,
      validate: () => true,
      execute: async () => {}
    };
  }
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

// Create a factory instance
const mockHandlerFactory = new MockDirectiveHandlerFactory();

// Export utilities
export { mockHandlerFactory as createMockHandler, mockFiles }; 