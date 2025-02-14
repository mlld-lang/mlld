import type { 
  MeldNode, 
  DirectiveNode, 
  TextNode, 
  CodeFenceNode,
  DirectiveKindString
} from 'meld-spec';
import type { Location, Position } from '../../core/types';

const DEFAULT_POSITION: Position = { line: 1, column: 1 };
const DEFAULT_LOCATION: Location = {
  start: DEFAULT_POSITION,
  end: DEFAULT_POSITION,
  filePath: undefined
};

/**
 * Create a position object for testing
 */
export function createPosition(line: number, column: number): Position {
  return { line, column };
}

/**
 * Create a location object for testing
 */
export function createLocation(
  startLine: number = 1,
  startColumn: number = 1,
  endLine?: number,
  endColumn?: number,
  filePath?: string
): Location {
  return {
    start: createPosition(startLine, startColumn),
    end: createPosition(endLine ?? startLine, endColumn ?? startColumn),
    filePath
  };
}

/**
 * Create a properly typed DirectiveNode for testing
 */
export function createDirectiveNode(
  kind: DirectiveKindString,
  properties: Record<string, any> = {},
  location: Location = DEFAULT_LOCATION
): DirectiveNode {
  return {
    type: 'Directive',
    directive: {
      kind,
      ...properties
    },
    location
  };
}

/**
 * Create a properly typed TextNode for testing
 */
export function createTextNode(
  content: string,
  location: Location = DEFAULT_LOCATION
): TextNode {
  return {
    type: 'Text',
    content,
    location
  };
}

/**
 * Create a properly typed CodeFenceNode for testing
 */
export function createCodeFenceNode(
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

/**
 * Create a text directive node for testing
 */
export function createTextDirective(
  name: string,
  value: string,
  location?: Location
): DirectiveNode {
  if (!location) return createDirectiveNode('text', { name, value });

  return {
    type: 'Directive',
    directive: {
      kind: 'text',
      name,
      value
    },
    location
  };
}

/**
 * Create a data directive node for testing
 */
export function createDataDirective(
  name: string,
  value: any,
  location?: Location
): DirectiveNode {
  if (!location) return createDirectiveNode('data', { 
    name, 
    value: typeof value === 'string' ? value : JSON.stringify(value) 
  });

  return {
    type: 'Directive',
    directive: {
      kind: 'data',
      name,
      value: typeof value === 'string' ? value : JSON.stringify(value)
    },
    location
  };
}

/**
 * Create a path directive node for testing
 */
export function createPathDirective(
  name: string,
  path: string,
  location: Location = DEFAULT_LOCATION
): DirectiveNode {
  return createDirectiveNode('path', { name, path }, location);
}

/**
 * Create a run directive node for testing
 */
export function createRunDirective(
  command: string,
  location: Location = DEFAULT_LOCATION
): DirectiveNode {
  return createDirectiveNode('run', { command }, location);
}

/**
 * Create an embed directive node for testing
 */
export function createEmbedDirective(
  path: string,
  section?: string,
  location?: Location,
  options?: {
    headingLevel?: number;
    underHeader?: string;
    fuzzy?: number;
    format?: string;
  }
): DirectiveNode {
  if (!location) return createDirectiveNode('embed', { path, section, ...options });

  return {
    type: 'Directive',
    directive: {
      kind: 'embed',
      path,
      section,
      ...options
    },
    location
  };
}

/**
 * Create an import directive node for testing
 */
export function createImportDirective(
  path: string,
  location?: Location
): DirectiveNode {
  if (!location) return createDirectiveNode('import', { path });

  return {
    type: 'Directive',
    directive: {
      kind: 'import',
      path
    },
    location
  };
}

/**
 * Create a define directive node for testing
 */
export function createDefineDirective(
  name: string,
  command: string,
  parameters: string[] = [],
  location: Location = DEFAULT_LOCATION
): DirectiveNode {
  return createDirectiveNode('define', { 
    name, 
    command: {
      kind: 'run',
      command
    },
    parameters
  }, location);
} 