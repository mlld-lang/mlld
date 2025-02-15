// Mock implementation of meld-ast
export class ParseError extends Error {
  constructor(message: string, public location?: { line: number; column: number }) {
    super(message);
    this.name = 'ParseError';
  }
}

export interface MeldNode {
  type: string;
  content?: string;
  directive?: {
    kind: string;
    identifier?: string;
    value?: string;
    [key: string]: any;
  };
  location?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
    filePath?: string;
  };
}

export function parse(content: string): MeldNode[] {
  // Simple mock implementation that returns basic nodes
  const lines = content.split('\n');
  const nodes: MeldNode[] = [];

  lines.forEach((line, index) => {
    if (line.startsWith('@')) {
      // Mock directive parsing
      const [directive, ...rest] = line.slice(1).split(' ');
      const value = rest.join(' ');
      
      // For text, data, and path directives, we expect format: identifier = value
      if (['text', 'data', 'path'].includes(directive)) {
        // Parse identifier = value format
        const match = value.match(/^(\w+)\s*=\s*(.+)$/);
        if (match) {
          const [_, identifier, directiveValue] = match;
          nodes.push({
            type: 'Directive',
            directive: {
              kind: directive,
              identifier,
              value: directiveValue.trim()
            },
            location: {
              start: { line: index + 1, column: 1 },
              end: { line: index + 1, column: line.length },
            },
          });
        } else {
          // Invalid format, but still create a node to match parser behavior
          nodes.push({
            type: 'Directive',
            directive: {
              kind: directive,
              value
            },
            location: {
              start: { line: index + 1, column: 1 },
              end: { line: index + 1, column: line.length },
            },
          });
        }
      } else {
        // For other directives (import, embed, etc.), pass through as is
        nodes.push({
          type: 'Directive',
          directive: {
            kind: directive,
            value
          },
          location: {
            start: { line: index + 1, column: 1 },
            end: { line: index + 1, column: line.length },
          },
        });
      }
    } else if (line.trim()) {
      // Mock text node parsing
      nodes.push({
        type: 'Text',
        content: line,
        location: {
          start: { line: index + 1, column: 1 },
          end: { line: index + 1, column: line.length },
        },
      });
    }
  });

  return nodes;
} 