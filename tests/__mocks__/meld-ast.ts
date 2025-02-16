// Re-export everything from the real meld-ast package
export * from 'meld-ast';

// Add test utilities
import type { MeldNode, DirectiveNode, TextNode, CodeFenceNode, Location } from 'meld-ast';

const DEFAULT_LOCATION: Location = {
  start: { line: 1, column: 1 },
  end: { line: 1, column: 1 }
};

// Test helper to create directive nodes
export function createTestDirective(
  kind: string,
  identifier: string,
  value: string,
  location: Location = DEFAULT_LOCATION
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
  location: Location = DEFAULT_LOCATION
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
  location: Location = DEFAULT_LOCATION
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
): Location {
  return {
    start: { line: startLine, column: startColumn },
    end: { line: endLine ?? startLine, column: endColumn ?? startColumn }
  };
}

// Mock the parse function to include locations
export function parse(content: string): Promise<MeldNode[]> {
  // Basic directive regex that captures @kind identifier = value
  const directiveRegex = /@(\w+)\s+(\w+)\s*=\s*(["']?)(.*?)\3/;
  const match = content.match(directiveRegex);

  if (match) {
    const [fullMatch, kind, identifier, quote, value] = match;
    const location = {
      start: { line: 1, column: 1 },
      end: { line: 1, column: fullMatch.length }
    };

    // Preserve quotes in the value if they were present
    const finalValue = quote ? `${quote}${value}${quote}` : value;

    return Promise.resolve([
      createTestDirective(kind, identifier, finalValue, location)
    ]);
  }

  // If no directive match, treat as text
  const location = {
    start: { line: 1, column: 1 },
    end: { line: 1, column: content.length }
  };

  return Promise.resolve([
    createTestText(content, location)
  ]);
} 