import type { DirectiveNode, Location, MeldNode, DirectiveKind } from 'meld-spec';
import { InterpreterState } from '../state/state';
import { HandlerContext } from '../directives/types';
import { ErrorFactory } from '../errors/factory';

/**
 * Test context for setting up and managing test state
 */
export class TestContext {
  state: InterpreterState;
  parentState?: InterpreterState;
  baseLocation?: Location;
  mode: 'toplevel' | 'rightside' = 'toplevel';

  constructor(config?: {
    parentState?: InterpreterState;
    baseLocation?: Location;
    mode?: 'toplevel' | 'rightside';
  }) {
    this.parentState = config?.parentState;
    this.baseLocation = config?.baseLocation;
    this.mode = config?.mode ?? 'toplevel';
    this.state = new InterpreterState(this.parentState);
  }

  /**
   * Create a handler context for testing
   */
  createHandlerContext(): HandlerContext {
    return {
      mode: this.mode,
      parentState: this.parentState,
      baseLocation: this.baseLocation
    };
  }

  /**
   * Create a nested test context
   */
  createNestedContext(baseLocation: Location): TestContext {
    return new TestContext({
      parentState: this.state,
      baseLocation,
      mode: 'rightside'
    });
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
   * Create a text node for testing
   */
  createTextNode(content: string, location?: Location): MeldNode {
    return {
      type: 'Text',
      content,
      location
    };
  }

  /**
   * Create a location for testing
   */
  createLocation(line: number, column: number, endLine?: number, endColumn?: number): Location {
    return {
      start: { line, column },
      end: endLine && endColumn ? { line: endLine, column: endColumn } : { line, column }
    };
  }

  /**
   * Adjust a location based on the current context
   */
  adjustLocation(location: Location): Location {
    if (this.mode === 'rightside' && this.baseLocation) {
      return {
        start: ErrorFactory.adjustLocation(location.start, this.baseLocation.start),
        end: ErrorFactory.adjustLocation(location.end, this.baseLocation.start)
      };
    }
    return location;
  }

  /**
   * Set up a mock file system for testing
   */
  setupMockFileSystem(files: Record<string, string>): void {
    // To be implemented with actual mock fs
    this.state.setCurrentFilePath('/test/mock.meld');
  }

  /**
   * Clean up after tests
   */
  cleanup(): void {
    // Clean up any resources
    this.state.setImmutable();
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