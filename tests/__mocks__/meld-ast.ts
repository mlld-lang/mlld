// Re-export everything from meld-ast
export * from 'meld-ast';

// Add test utilities
import type { MeldNode, DirectiveNode, TextNode, CodeFenceNode, SourceLocation, DirectiveKind } from 'meld-spec';

// Test helper functions for creating nodes
const DEFAULT_LOCATION: SourceLocation = {
  start: { line: 1, column: 1 },
  end: { line: 1, column: 1 }
};

// Test helper to create directive nodes
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

// Test helper to create text nodes
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

// Test helper to create code fence nodes
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

// Test helper to create a location
export function createTestLocation(
  startLine: number = 1,
  startColumn: number = 1,
  endLine?: number,
  endColumn?: number
): SourceLocation {
  return {
    start: { line: startLine, column: startColumn },
    end: { line: endLine || startLine, column: endColumn || startColumn }
  };
} 