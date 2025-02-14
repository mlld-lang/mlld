import type { 
  MeldNode, 
  DirectiveNode, 
  TextNode, 
  CodeFenceNode,
  DirectiveKind,
  Location
} from 'meld-spec';

const DEFAULT_LOCATION: Location = {
  start: { line: 1, column: 1 },
  end: { line: 1, column: 1 }
};

/**
 * Create a properly typed DirectiveNode for testing
 */
export function createDirectiveNode(
  kind: DirectiveKind,
  data: Record<string, any> = {},
  location: Location = DEFAULT_LOCATION
): DirectiveNode {
  return {
    type: 'Directive',
    directive: {
      kind,
      ...data
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
 * Create a location object for testing
 */
export function createLocation(
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

/**
 * Create a text directive node for testing
 */
export function createTextDirective(
  name: string,
  value: string,
  location: Location = DEFAULT_LOCATION
): DirectiveNode {
  return createDirectiveNode('text', { name, value }, location);
}

/**
 * Create a data directive node for testing
 */
export function createDataDirective(
  name: string,
  value: any,
  location: Location = DEFAULT_LOCATION
): DirectiveNode {
  return createDirectiveNode('data', { name, value }, location);
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
  location: Location = DEFAULT_LOCATION
): DirectiveNode {
  return createDirectiveNode('embed', { path, section }, location);
}

/**
 * Create an import directive node for testing
 */
export function createImportDirective(
  path: string,
  location: Location = DEFAULT_LOCATION
): DirectiveNode {
  return createDirectiveNode('import', { path }, location);
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