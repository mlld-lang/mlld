export interface Location {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

export interface DirectiveNode {
  type: 'Directive';
  directive: {
    kind: string;
    [key: string]: any;
  };
  location: Location;
}

export interface TextNode {
  type: 'Text';
  content: string;
  location: Location;
}

export type Node = DirectiveNode | TextNode;

export function parse(content: string): Node[] {
  // Simple mock implementation that returns a basic AST
  if (content.startsWith('@text')) {
    const [_, identifier, value] = content.match(/@text\s+identifier\s*=\s*"([^"]*)"(?:\s+value\s*=\s*([^"]*))/) || [];
    return [{
      type: 'Directive',
      directive: {
        kind: 'text',
        identifier,
        value: value.replace(/^['"`]|['"`]$/g, '') // Remove quotes from value
      },
      location: {
        start: { line: 1, column: 1 },
        end: { line: 1, column: content.length }
      }
    }];
  }

  if (content.startsWith('@data')) {
    const [_, identifier, value] = content.match(/@data\s+(\w+)\s*=\s*({[^}]*})/) || [];
    return [{
      type: 'Directive',
      directive: {
        kind: 'data',
        identifier,
        value: JSON.parse(value)
      },
      location: {
        start: { line: 1, column: 1 },
        end: { line: 1, column: content.length }
      }
    }];
  }

  // Default case - return text node
  return [{
    type: 'Text',
    content: content,
    location: {
      start: { line: 1, column: 1 },
      end: { line: 1, column: content.length }
    }
  }];
} 