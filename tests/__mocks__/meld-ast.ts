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
    name?: string;
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
      nodes.push({
        type: 'Directive',
        directive: {
          kind: directive,
          value: rest.join(' '),
        },
        location: {
          start: { line: index + 1, column: 1 },
          end: { line: index + 1, column: line.length },
        },
      });
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