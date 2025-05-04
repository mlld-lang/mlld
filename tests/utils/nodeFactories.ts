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
 * Create a structured directive using the modern AST format with values/raw/meta objects
 */
export function createStructuredDirective(
  kind: DirectiveKind,
  subtype: string,
  values: { [key: string]: any },
  raw: { [key: string]: string } = {},
  meta: { [key: string]: any } = {},
  location: SourceLocation = DEFAULT_LOCATION
): DirectiveNode {
  return {
    type: 'Directive',
    kind,
    subtype,
    values,
    raw,
    meta,
    location
  };
}

/**
 * Create a text directive with a nested directive
 */
export function createTextWithNestedDirective(
  identifier: string,
  nestedDirective: DirectiveNode,
  location: SourceLocation = DEFAULT_LOCATION
): DirectiveNode {
  return {
    type: 'Directive',
    kind: 'text',
    subtype: 'textAssignment',
    values: {
      identifier: [
        {
          type: 'VariableReference',
          identifier,
          valueType: 'text',
          isVariableReference: true,
          location
        }
      ],
      content: nestedDirective,
      source: 'directive'
    },
    raw: {
      identifier,
      content: `@${nestedDirective.kind}`
    },
    meta: {},
    location
  };
}

/**
 * Create a data directive with a nested directive
 */
export function createDataWithNestedDirective(
  identifier: string,
  nestedDirective: DirectiveNode,
  location: SourceLocation = DEFAULT_LOCATION
): DirectiveNode {
  return {
    type: 'Directive',
    kind: 'data',
    subtype: 'dataAssignment',
    values: {
      identifier: [
        {
          type: 'VariableReference',
          identifier,
          valueType: 'data',
          isVariableReference: true,
          location
        }
      ],
      value: nestedDirective
    },
    raw: {
      identifier,
      value: `@${nestedDirective.kind}`
    },
    meta: {},
    location
  };
}

/**
 * Create a data directive with an object containing nested directives
 */
export function createDataWithObjectContainingDirectives(
  identifier: string,
  properties: { [key: string]: string | DirectiveNode },
  location: SourceLocation = DEFAULT_LOCATION
): DirectiveNode {
  // Process properties to create the object structure
  const objectProperties: { [key: string]: any } = {};
  const rawProperties: string[] = [];
  
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value === 'string') {
      objectProperties[key] = value;
      rawProperties.push(`"${key}": "${value}"`);
    } else {
      // It's a directive node
      objectProperties[key] = value;
      rawProperties.push(`"${key}": @${value.kind}`);
    }
  }
  
  return {
    type: 'Directive',
    kind: 'data',
    subtype: 'dataAssignment',
    values: {
      identifier: [
        {
          type: 'VariableReference',
          identifier,
          valueType: 'data',
          isVariableReference: true,
          location
        }
      ],
      value: {
        type: 'object',
        properties: objectProperties
      }
    },
    raw: {
      identifier,
      value: `{ ${rawProperties.join(', ')} }`
    },
    meta: {},
    location
  };
}

/**
 * Create a data directive with an array containing directives
 */
export function createDataWithArrayContainingDirectives(
  identifier: string,
  items: Array<string | DirectiveNode>,
  location: SourceLocation = DEFAULT_LOCATION
): DirectiveNode {
  // Process items to create the array structure
  const arrayItems: any[] = [];
  const rawItems: string[] = [];
  
  for (const item of items) {
    if (typeof item === 'string') {
      arrayItems.push(item);
      rawItems.push(`"${item}"`);
    } else {
      // It's a directive node
      arrayItems.push(item);
      rawItems.push(`@${item.kind}`);
    }
  }
  
  return {
    type: 'Directive',
    kind: 'data',
    subtype: 'dataAssignment',
    values: {
      identifier: [
        {
          type: 'VariableReference',
          identifier,
          valueType: 'data',
          isVariableReference: true,
          location
        }
      ],
      value: {
        type: 'array',
        items: arrayItems
      }
    },
    raw: {
      identifier,
      value: `[ ${rawItems.join(', ')} ]`
    },
    meta: {},
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

/**
 * Create a test node with an unknown type for error testing
 * This is intentionally generic to test error handling for unknown node types
 */
export function createTestUnknownNode(
  location: SourceLocation = DEFAULT_LOCATION
): MeldNode {
  return {
    type: 'Unknown',
    location
  } as MeldNode;
}

/**
 * Create a simple embed directive
 */
export function createSimpleEmbedDirective(
  path: string,
  location: SourceLocation = DEFAULT_LOCATION
): DirectiveNode {
  return {
    type: 'Directive',
    kind: 'embed',
    subtype: 'embedPath',
    values: {
      path: [
        {
          type: 'Text',
          content: path,
          location
        }
      ]
    },
    raw: {
      path
    },
    meta: {},
    location
  };
}

/**
 * Create a simple run directive
 */
export function createSimpleRunDirective(
  command: string,
  location: SourceLocation = DEFAULT_LOCATION
): DirectiveNode {
  return {
    type: 'Directive',
    kind: 'run',
    subtype: 'runCommand',
    values: {
      command: [
        {
          type: 'Text',
          content: command,
          location
        }
      ]
    },
    raw: {
      command
    },
    meta: {},
    location
  };
} 