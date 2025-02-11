import type { DirectiveNode, Location, MeldNode, DirectiveKind } from 'meld-spec';
import { InterpreterState } from '../state/state';
import { HandlerContext } from '../directives/types';
import { ErrorFactory } from '../errors/factory';
import { TestFileSystem } from '../../test/fs-utils';

/**
 * Test context for setting up and managing test state
 */
export class TestContext {
  public state: InterpreterState;
  public fs: TestFileSystem;

  constructor() {
    this.state = new InterpreterState();
    this.fs = new TestFileSystem();
  }

  /**
   * Initialize the test context
   */
  async initialize(): Promise<void> {
    await this.fs.initialize();
  }

  /**
   * Clean up the test context
   */
  async cleanup(): Promise<void> {
    await this.fs.cleanup();
  }

  /**
   * Create a location object for testing
   */
  createLocation(line: number, column: number): Location {
    return {
      start: { line, column },
      end: { line, column }
    };
  }

  /**
   * Create a directive node for testing
   */
  createDirectiveNode(kind: DirectiveKind, data: Record<string, any>, location?: Location): DirectiveNode {
    return {
      type: 'Directive',
      directive: {
        kind,
        ...data
      },
      location
    };
  }

  /**
   * Create a handler context for testing
   */
  createHandlerContext(options: Partial<HandlerContext> = {}): HandlerContext {
    return {
      mode: 'toplevel',
      workspaceRoot: this.fs.getProjectPath(),
      ...options
    };
  }

  /**
   * Create a nested context for testing right-side mode
   */
  createNestedContext(baseLocation: Location): TestContext {
    const nestedContext = new TestContext();
    nestedContext.state = this.state;
    nestedContext.fs = this.fs;
    return nestedContext;
  }

  /**
   * Write a test file
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    await this.fs.writeFile(filePath, content);
  }

  /**
   * Read a test file
   */
  async readFile(filePath: string): Promise<string> {
    return this.fs.readFile(filePath);
  }

  /**
   * Check if a test file exists
   */
  async exists(filePath: string): Promise<boolean> {
    return this.fs.exists(filePath);
  }

  /**
   * Get the absolute path in the test filesystem
   */
  getPath(filePath: string): string {
    return this.fs.getPath(filePath);
  }
}

/**
 * Create a test directive node with common defaults
 */
export function createTestDirective(
  kind: DirectiveKind,
  data: Record<string, any> = {},
  location?: Location
): DirectiveNode {
  return {
    type: 'Directive',
    directive: {
      kind,
      ...data
    },
    location
  };
}

/**
 * Create a test location with common defaults
 */
export function createTestLocation(
  line: number = 1,
  column: number = 1,
  endLine?: number,
  endColumn?: number
): Location {
  return {
    start: { line, column },
    end: endLine && endColumn ? { line: endLine, column: endColumn } : { line, column }
  };
}

/**
 * Create a test state with common defaults
 */
export function createTestState(config?: {
  parentState?: InterpreterState;
  filePath?: string;
}): InterpreterState {
  const state = new InterpreterState(config?.parentState);
  if (config?.filePath) {
    state.setCurrentFilePath(config.filePath);
  }
  return state;
}

/**
 * Create a test context with proper defaults
 */
export function createTestContext(config?: {
  mode?: 'toplevel' | 'rightside';
  baseLocation?: Location;
  parentState?: InterpreterState;
}): HandlerContext {
  return {
    mode: config?.mode ?? 'toplevel',
    baseLocation: config?.baseLocation,
    parentState: config?.parentState,
    currentPath: '/test/mock.meld'
  };
} 