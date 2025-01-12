export interface Location {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

export interface DirectiveNode {
  type: 'Directive';
  kind: string;
  properties: Record<string, any>;
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
    const [_, name, value] = content.match(/@text\s+(\w+)\s*=\s*"([^"]*)"/) || [];
    return [{
      type: 'Directive',
      kind: 'text',
      properties: {
        name,
        value
      },
      location: {
        start: { line: 1, column: 1 },
        end: { line: 1, column: content.length }
      }
    }];
  }

  if (content.startsWith('@data')) {
    const [_, name, value] = content.match(/@data\s+(\w+)\s*=\s*({[^}]*})/) || [];
    return [{
      type: 'Directive',
      kind: 'data',
      properties: {
        name,
        value: JSON.parse(value)
      },
      location: {
        start: { line: 1, column: 1 },
        end: { line: 1, column: content.length }
      }
    }];
  }

  if (content.startsWith('@define')) {
    const [_, name, body] = content.match(/@define\s+(\w+)\s*{([^}]*)}/) || [];
    return [{
      type: 'Directive',
      kind: 'define',
      properties: {
        name,
        body
      },
      location: {
        start: { line: 1, column: 1 },
        end: { line: 1, column: content.length }
      }
    }];
  }

  if (content.startsWith('@run')) {
    const [_, command] = content.match(/@run\s+(.*)/) || [];
    return [{
      type: 'Directive',
      kind: 'run',
      properties: {
        command
      },
      location: {
        start: { line: 1, column: 1 },
        end: { line: 1, column: content.length }
      }
    }];
  }

  if (content.startsWith('@import')) {
    const [_, from] = content.match(/@import\s+(.*)/) || [];
    return [{
      type: 'Directive',
      kind: 'import',
      properties: {
        from
      },
      location: {
        start: { line: 1, column: 1 },
        end: { line: 1, column: content.length }
      }
    }];
  }

  if (content.startsWith('@embed')) {
    const [_, path] = content.match(/@embed\s+(.*)/) || [];
    return [{
      type: 'Directive',
      kind: 'embed',
      properties: {
        path
      },
      location: {
        start: { line: 1, column: 1 },
        end: { line: 1, column: content.length }
      }
    }];
  }

  // Default to text node
  return [{
    type: 'Text',
    content,
    location: {
      start: { line: 1, column: 1 },
      end: { line: 1, column: content.length }
    }
  }];
} 