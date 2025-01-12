// Type definitions for Meld AST
export type DirectiveKindString = 'run' | 'import' | 'embed' | 'define' | 'text' | 'path' | 'data' | 'api' | 'call';

export interface Location {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

export interface DirectiveNode {
  type: 'Directive';
  kind: DirectiveKindString;
  properties: Record<string, any>;
  location: Location;
}

export interface TextNode {
  type: 'Text';
  content: string;
  location: Location;
}

export type MeldNode = DirectiveNode | TextNode;

export interface DirectiveKind {
  name: DirectiveKindString;
  properties: {
    [key: string]: {
      type: 'string' | 'number' | 'boolean' | 'object' | 'array';
      required?: boolean;
      description?: string;
    };
  };
}

export const DIRECTIVE_KINDS: Record<DirectiveKindString, DirectiveKind> = {
  text: {
    name: 'text',
    properties: {
      name: { type: 'string', required: true },
      value: { type: 'string', required: true }
    }
  },
  data: {
    name: 'data',
    properties: {
      name: { type: 'string', required: true },
      value: { type: 'object', required: true }
    }
  },
  define: {
    name: 'define',
    properties: {
      name: { type: 'string', required: true },
      body: { type: 'string', required: true }
    }
  },
  run: {
    name: 'run',
    properties: {
      command: { type: 'string', required: true }
    }
  },
  import: {
    name: 'import',
    properties: {
      from: { type: 'string', required: true },
      variables: { type: 'object', required: false }
    }
  },
  embed: {
    name: 'embed',
    properties: {
      path: { type: 'string', required: true },
      section: { type: 'string', required: false },
      items: { type: 'array', required: false },
      headerLevel: { type: 'number', required: false },
      underHeader: { type: 'string', required: false }
    }
  },
  path: {
    name: 'path',
    properties: {
      name: { type: 'string', required: true },
      value: { type: 'string', required: true }
    }
  },
  api: {
    name: 'api',
    properties: {
      name: { type: 'string', required: true },
      endpoint: { type: 'string', required: true }
    }
  },
  call: {
    name: 'call',
    properties: {
      name: { type: 'string', required: true },
      args: { type: 'object', required: false }
    }
  }
};

export function parse(content: string): MeldNode[] {
  if (content === 'invalid') {
    throw new Error('Failed to parse Meld content: Parse error');
  }
  if (content.startsWith('>>')) {
    return [{
      type: 'Text',
      content: content.substring(2).trim(),
      location: {
        start: { line: 1, column: 1 },
        end: { line: 1, column: content.length }
      }
    }];
  }
  return [{
    type: 'Text',
    content,
    location: {
      start: { line: 1, column: 1 },
      end: { line: 1, column: content.length }
    }
  }];
} 