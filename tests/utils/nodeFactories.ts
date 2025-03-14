import type { 
  MeldNode, 
  DirectiveNode, 
  TextNode, 
  CodeFenceNode, 
  SourceLocation,
  DirectiveKind,
  Position
} from '@core/syntax/types';

// Default position for convenience
const DEFAULT_POSITION: Position = { 
  line: 1, 
  column: 1 
};

// Default source location for convenience
const DEFAULT_LOCATION: SourceLocation = {
  start: DEFAULT_POSITION,
  end: DEFAULT_POSITION
};

/**
 * Create a position object for testing
 */
export function createPosition(line: number, column: number): Position {
  return { line, column };
}

/**
 * Create a test source location with the given line and column numbers
 */
export function createTestLocation(
  startLine: number = 1,
  startColumn: number = 1,
  endLine?: number,
  endColumn?: number
): SourceLocation {
  return {
    start: createPosition(startLine, startColumn),
    end: createPosition(endLine ?? startLine, endColumn ?? startColumn)
  };
}

/**
 * Create a test directive node with the given properties
 */
export function createTestDirective(
  kind: DirectiveKind,
  identifier: string,
  value: string,
  location: SourceLocation = DEFAULT_LOCATION
): DirectiveNode {
  return {
    type: 'Directive',
    directive: {
      kind,
      identifier,
      value
    },
    location
  };
}

/**
 * Create a test text node with the given content
 */
export function createTestText(
  content: string,
  location: SourceLocation = DEFAULT_LOCATION
): TextNode {
  return {
    type: 'Text',
    content,
    location
  };
}

/**
 * Create a test code fence node with the given content and optional language
 */
export function createTestCodeFence(
  content: string,
  language?: string,
  location: SourceLocation = DEFAULT_LOCATION
): CodeFenceNode {
  return {
    type: 'CodeFence',
    content,
    language,
    location
  };
} 