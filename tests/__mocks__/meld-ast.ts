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
    end: { line: endLine || startLine, column: endColumn || startColumn }
  };
}

// Mock the parse function to include locations
export function parse(content: string, options?: { locations?: boolean }): Promise<MeldNode[]> {
  if (!content || typeof content !== 'string') {
    return Promise.resolve([]);
  }

  // Always create a location, even if not requested in options
  const createLocation = (start: number, end: number): Location => ({
    start: { line: 1, column: start },
    end: { line: 1, column: end }
  });

  // New directive regex that captures both formats:
  // 1. @kind [value] or @kind [x,y,z] from [value]
  // 2. @kind identifier = value
  const newDirectiveRegex = /@(\w+)\s+\[([^\]]+)\](?:\s+from\s+\[([^\]]+)\])?/;
  const oldDirectiveRegex = /@(\w+)\s+(\w+)\s*=\s*(["']?)(.*?)\3/;
  
  // Try new format first
  const newMatch = content.match(newDirectiveRegex);
  if (newMatch) {
    const [fullMatch, kind, importsOrPath, fromPath] = newMatch;
    const matchStart = content.indexOf(fullMatch);
    const location = createLocation(matchStart + 1, matchStart + fullMatch.length);

    let value: string;
    if (fromPath) {
      // Handle explicit imports list
      value = `[${fromPath}]`;
    } else {
      // Handle simple path import
      value = `[${importsOrPath.trim()}]`;
    }

    return Promise.resolve([
      createTestDirective(kind, 'import', value, location)
    ]);
  }

  // Try old format if new format doesn't match
  const oldMatch = content.match(oldDirectiveRegex);
  if (oldMatch) {
    const [fullMatch, kind, identifier, quote, value] = oldMatch;
    const matchStart = content.indexOf(fullMatch);
    const location = createLocation(matchStart + 1, matchStart + fullMatch.length);

    // Preserve quotes in the value if they were present
    const finalValue = quote ? `${quote}${value}${quote}` : value;

    return Promise.resolve([
      createTestDirective(kind, identifier, finalValue, location)
    ]);
  }

  // If no directive match, treat as text
  const location = createLocation(1, content.length + 1);

  return Promise.resolve([
    createTestText(content, location)
  ]);
} 