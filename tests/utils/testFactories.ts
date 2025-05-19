import type { 
  MeldNode, 
  DirectiveNode, 
  TextNode, 
  CodeFenceNode,
  VariableReferenceNode
} from '@core/ast/types/index';
// Directive types are now in the main AST types
import type { Location, Position } from '@core/types';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import type { IParserService } from '@services/pipeline/ParserService/IParserService';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService';
import type { IPathService } from '@services/fs/PathService/IPathService';
import { vi, type Mock } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { isInterpolatableValueArray } from '@core/ast/types/guards';
import type { InterpolatableValue } from '@core/ast/types';
import { VariableOrigin, VariableType } from '@core/types/variables';
import type { TextVariable, DataVariable, IPathVariable, CommandVariable, VariableMetadata } from '@core/types/variables';
import type { JsonValue } from '@core/types';
import type { ICommandDefinition } from '@core/types/exec';

// Counter for generating unique node IDs in tests
let testNodeIdCounter = 0;

// ====================
// Helper Functions for Creating AST Nodes
// ====================

/**
 * Creates an array containing a single TextNode
 */
export function createTextNodeArray(content: string, location?: Location): TextNode[] {
  return [{
    type: 'Text',
    nodeId: `test-text-${testNodeIdCounter++}`,
    content,
    location: location || DEFAULT_LOCATION
  }];
}

/**
 * Creates an array containing a single VariableReferenceNode
 */
export function createVariableReferenceArray(
  identifier: string, 
  valueType: string = 'identifier',
  location?: Location
): VariableReferenceNode[] {
  return [{
    type: 'VariableReference',
    nodeId: `test-vref-${testNodeIdCounter++}`,
    identifier,
    valueType,
    isVariableReference: true,
    location: location || DEFAULT_LOCATION
  }];
}

/**
 * Creates a PathNode array from a path string
 * For now, this creates a simple TextNode array, but can be enhanced
 * to handle more complex path structures
 */
export function createPathNodeArray(path: string, location?: Location): TextNode[] {
  return createTextNodeArray(path, location);
}

/**
 * Creates proper meta object for path-based directives
 */
export function createPathMeta(path: string): Record<string, any> {
  const hasExtension = path.includes('.');
  const extension = hasExtension ? path.split('.').pop() || '' : '';
  
  return {
    path: {
      hasVariables: path.includes('{{') || path.includes('$'),
      isAbsolute: path.startsWith('/'),
      hasExtension,
      extension
    }
  };
}

const DEFAULT_POSITION: Position = { line: 1, column: 1 };
const DEFAULT_LOCATION: Location = {
  start: DEFAULT_POSITION,
  end: DEFAULT_POSITION,
  filePath: undefined
};

/**
 * Create a location object for testing (includes filePath)
 */
export function createLocation(
  startLine: number = 1,
  startColumn: number = 1,
  endLine?: number,
  endColumn?: number,
  filePath?: string
): Location {
  const start = { line: startLine, column: startColumn };
  const end = { line: endLine ?? startLine, column: endColumn ?? startColumn };
  return {
    start,
    end,
    filePath
  };
}

/**
 * Create a test directive node
 */
export function createTestDirective(
  kind: DirectiveKind,
  identifier: string,
  value: string,
  location: Location = DEFAULT_LOCATION
): DirectiveNode {
  // For other directives, use the standard property structure
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
 * Create a test text node
 */
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

/**
 * Create a test code fence node
 */
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

/**
 * Create a test location
 */
export function createTestLocation(
  startLine: number = 1,
  startColumn: number = 1,
  endLine?: number,
  endColumn?: number,
  filePath?: string
): Location {
  return createLocation(startLine, startColumn, endLine, endColumn, filePath);
}

/**
 * Create a generic directive node (less specific than individual factories)
 */
export function createDirectiveNode(
  kind: DirectiveKind,
  properties: Record<string, any> = {},
  location: Location = DEFAULT_LOCATION
): DirectiveNode {
  // Extract common directive properties
  const { identifier, value, values, source = 'literal', subtype, raw, meta, ...rest } = properties;
  
  // Create the node with correct AST structure
  const node: DirectiveNode = {
    type: 'Directive',
    kind,
    nodeId: `test-directive-${testNodeIdCounter++}`,
    location,
    ...rest
  } as DirectiveNode;
  
  // Add source if provided
  if (source) {
    node.source = source;
  }
  
  // Add subtype based on kind
  if (subtype) {
    node.subtype = subtype;
  } else {
    // Set default subtypes based on kind
    switch (kind) {
      case 'text':
        node.subtype = source === 'run' ? 'textRun' : 'textAssignment';
        break;
      case 'data':
        node.subtype = 'dataAssignment';
        break;
      case 'path':
        node.subtype = 'pathAssignment';
        break;
      case 'import':
        node.subtype = 'importAll';
        break;
      case 'add':
        node.subtype = 'addTemplate';
        break;
      case 'exec':
        node.subtype = 'execCode';
        break;
      case 'run':
        node.subtype = 'runCommand';
        break;
      default:
        node.subtype = `${kind}Assignment` as DirectiveSubtype;
    }
  }
  
  // Set up raw values
  node.raw = raw || {};
  if (identifier) {
    node.raw.identifier = identifier;
  }
  
  // Set up values object
  node.values = values || {};
  
  // If identifier is provided, create the identifier array
  if (identifier && !node.values.identifier) {
    node.values.identifier = [{
      type: 'VariableReference',
      identifier,
      nodeId: `test-vref-${testNodeIdCounter++}`,
      location
    }];
  }
  
  // Handle different value types
  if (value !== undefined) {
    if (kind === 'text' && (source === 'literal' || source === 'template')) {
      node.raw.content = typeof value === 'string' ? value : '';
      // Create content array for text directives
      if (typeof value === 'string') {
        node.values.content = [{
          type: 'Text',
          content: value,
          nodeId: `test-text-${testNodeIdCounter++}`,
          location
        }];
      } else if (Array.isArray(value)) {
        node.values.content = value;
      }
    } else if (kind === 'text' && source === 'run') {
      // Handle run directives
      if (!node.values.run) {
        node.values.run = value.run || [value];
      }
    } else if (kind === 'data') {
      node.values.value = value;
      node.raw.value = value;
    } else if (kind === 'path') {
      node.values.path = value;
      node.raw.path = typeof value === 'string' ? value : '';
    }
  }
  
  // Add meta if provided
  if (meta) {
    node.meta = meta;
  }
  
  return node;
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

// Create a text directive node for testing
export function createTextDirective(
  identifier: string,
  value: string | InterpolatableValue,
  location?: Location
): DirectiveNode {
  // Determine subtype and source based on value type
  let subtype: string;
  let source: string;
  let contentNodes: MeldNode[];
  let rawContent: string;
  let meta: Record<string, any> = {};
  
  if (typeof value === 'string') {
    // Simple string - textAssignment with literal source
    subtype = 'textAssignment';
    source = 'literal';
    contentNodes = createTextNodeArray(value, location);
    rawContent = value;
    meta = {
      sourceType: 'literal',
      hasVariables: false,
      isTemplateContent: false
    };
  } else if (Array.isArray(value)) {
    // Interpolatable array - check if it contains variables
    const hasVariables = value.some(node => node.type === 'VariableReference');
    subtype = hasVariables ? 'textTemplate' : 'textAssignment';
    source = hasVariables ? 'template' : 'literal';
    contentNodes = value;
    
    // Build raw content from nodes
    rawContent = value.map(node => {
      if (node.type === 'Text') {
        return node.content;
      } else if (node.type === 'VariableReference') {
        return `{{${node.identifier}}}`;
      }
      return '';
    }).join('');
    
    meta = {
      sourceType: source,
      hasVariables,
      isTemplateContent: hasVariables
    };
  } else {
    throw new Error('Invalid value type for createTextDirective');
  }
  
  // Create identifier as VariableReference array
  const identifierNodes = createVariableReferenceArray(identifier, 'identifier', location);
  
  return {
    type: 'Directive',
    nodeId: `test-directive-${testNodeIdCounter++}`,
    location: location || DEFAULT_LOCATION,
    kind: 'text',
    subtype,
    source,
    values: {
      identifier: identifierNodes,
      content: contentNodes
    },
    raw: {
      identifier,
      content: rawContent
    },
    meta
  };
}

// Create a data directive node for testing
export function createDataDirective(
  identifier: string,
  value: any,
  location?: Location
): DirectiveNode {
  // Create identifier as VariableReference array
  const identifierNodes = createVariableReferenceArray(identifier, 'identifier', location);
  
  // Determine source based on value type
  let source: string;
  let valueContent: any;
  
  if (typeof value === 'string') {
    source = 'string';
    valueContent = {
      type: 'string',
      value: JSON.stringify(value)
    };
  } else if (typeof value === 'number') {
    source = 'number';
    valueContent = {
      type: 'number',
      value: value
    };
  } else if (typeof value === 'boolean') {
    source = 'boolean';
    valueContent = {
      type: 'boolean',
      value: value
    };
  } else if (Array.isArray(value)) {
    source = 'array';
    valueContent = {
      type: 'array',
      items: value
    };
  } else if (typeof value === 'object' && value !== null) {
    source = 'object';
    valueContent = {
      type: 'object',
      properties: value
    };
  } else {
    source = 'literal';
    valueContent = value;
  }
  
  return {
    type: 'Directive',
    nodeId: `test-directive-${testNodeIdCounter++}`,
    location: location || DEFAULT_LOCATION,
    kind: 'data',
    subtype: 'dataAssignment',
    source,
    values: {
      identifier: identifierNodes,
      value: valueContent
    },
    raw: {
      identifier,
      value: typeof value === 'string' ? value : JSON.stringify(value)
    },
    meta: {
      sourceType: source
    }
  };
}

// Create a path directive node for testing
export function createPathDirective(
  identifier: string,
  pathString: string,
  location?: Location
): DirectiveNode {
  // Create identifier as VariableReference array
  const identifierNodes = createVariableReferenceArray(identifier, 'identifier', location);
  
  // Create path as TextNode array
  const pathNodes = createTextNodeArray(pathString, location);
  
  return {
    type: 'Directive',
    nodeId: `test-directive-${testNodeIdCounter++}`,
    location: location || DEFAULT_LOCATION,
    kind: 'path',
    subtype: 'pathAssignment',
    source: 'path',
    values: {
      identifier: identifierNodes,
      path: pathNodes
    },
    raw: {
      identifier,
      path: pathString
    },
    meta: createPathMeta(pathString)
  };
}

// Create a run directive node for testing
export function createRunDirective(
  commandInput: string | InterpolatableValue | { name: string, args: any[], raw: string }, 
  location?: Location,
  subtype?: 'runCommand' | 'runCode' | 'runCodeParams' | 'runExec',
  language?: string,
  parameters?: Array<VariableReferenceNode | string>,
  outputVar?: string,
  errorVar?: string
): DirectiveNode {
  let resolvedSubtype = subtype;
  let source: string;
  const values: Record<string, any> = {};
  const raw: Record<string, any> = {};
  const meta: Record<string, any> = {};
  
  // Determine subtype if not provided
  if (!resolvedSubtype) {
    if (typeof commandInput === 'object' && 'name' in commandInput) {
      resolvedSubtype = 'runExec';
    } else if (language) {
      resolvedSubtype = parameters ? 'runCodeParams' : 'runCode';
    } else {
      resolvedSubtype = 'runCommand';
    }
  }
  
  // Set source based on subtype
  switch (resolvedSubtype) {
    case 'runCommand':
      source = 'command';
      break;
    case 'runCode':
    case 'runCodeParams':
      source = 'code';
      break;
    case 'runExec':
      source = 'exec';
      break;
    default:
      source = 'command';
  }

  // Build values based on subtype
  if (resolvedSubtype === 'runCommand') {
    // Handle command input
    if (typeof commandInput === 'string') {
      values.command = createTextNodeArray(commandInput, location);
      raw.command = commandInput;
    } else if (Array.isArray(commandInput)) {
      values.command = commandInput;
      raw.command = commandInput.map(node => 
        node.type === 'Text' ? node.content : `{{${node.identifier}}}`
      ).join('');
    }
    meta.hasVariables = Array.isArray(commandInput) && commandInput.some(node => node.type === 'VariableReference');
    meta.isMultiLine = raw.command.includes('\n');
  } else if (resolvedSubtype === 'runCode' || resolvedSubtype === 'runCodeParams') {
    // Code with language
    const codeText = typeof commandInput === 'string' ? commandInput : '';
    values.code = createTextNodeArray(codeText, location);
    raw.code = codeText;
    
    if (language) {
      values.lang = createTextNodeArray(language, location);
      raw.lang = language;
      meta.language = language;
    }
    
    if (parameters && resolvedSubtype === 'runCodeParams') {
      values.args = parameters.map(p => {
        if (typeof p === 'string') {
          return createTextNodeArray(p, location)[0];
        }
        return p;
      });
      raw.args = parameters.map(p => typeof p === 'string' ? p : (p as VariableReferenceNode).identifier);
    }
    
    meta.isMultiLine = codeText.includes('\n');
    meta.isBracketed = true;
  } else if (resolvedSubtype === 'runExec') {
    // Reference to defined command
    if (typeof commandInput === 'string') {
      values.identifier = createTextNodeArray(commandInput, location);
      raw.identifier = commandInput;
    } else if (typeof commandInput === 'object' && 'name' in commandInput) {
      const definedCmd = commandInput as { name: string, args: any[], raw: string };
      values.identifier = createTextNodeArray(definedCmd.name, location);
      raw.identifier = definedCmd.name;
      
      if (definedCmd.args && definedCmd.args.length > 0) {
        values.args = definedCmd.args.map(arg => createTextNodeArray(String(arg), location)[0]);
        raw.args = definedCmd.args;
      }
    }
  }
  
  // Add output/error variables if specified
  if (outputVar) {
    values.outputVariable = createVariableReferenceArray(outputVar, 'identifier', location);
    raw.outputVariable = outputVar;
  }
  
  if (errorVar) {
    values.errorVariable = createVariableReferenceArray(errorVar, 'identifier', location);
    raw.errorVariable = errorVar;
  }
  
  return {
    type: 'Directive',
    nodeId: `test-directive-${testNodeIdCounter++}`,
    location: location || DEFAULT_LOCATION,
    kind: 'run',
    subtype: resolvedSubtype,
    source,
    values,
    raw,
    meta
  };
}

// Create an add directive node for testing (formerly embed)
export function createAddDirective(
  pathOrContent: string | InterpolatableValue | AstStructuredPath, 
  section?: string,
  location?: Location,
  subtype?: 'addPath' | 'addVariable' | 'addTemplate',
  options?: { 
    names?: string[];
    headingLevel?: number;
    underHeader?: string;
  }
): DirectiveNode {
  let determinedSubtype: 'addPath' | 'addVariable' | 'addTemplate';
  let source: string;
  const values: Record<string, any> = {};
  const raw: Record<string, any> = {};
  let meta: Record<string, any> = {};
  
  // Determine subtype and set up values based on input
  if (subtype) {
    determinedSubtype = subtype;
  } else {
    // Auto-determine subtype based on input type
    if (isInterpolatableValueArray(pathOrContent)) {
      determinedSubtype = 'addTemplate';
    } else if (typeof pathOrContent === 'string') {
      // Check if it's a variable reference
      if (pathOrContent.startsWith('@') || pathOrContent.includes('{{') && pathOrContent.includes('}}')) {
        determinedSubtype = 'addVariable';
      } else {
        determinedSubtype = 'addPath';
      }
    } else {
      determinedSubtype = 'addPath';
    }
  }

  // Set source based on subtype
  switch (determinedSubtype) {
    case 'addPath':
      source = 'path';
      break;
    case 'addVariable':
      source = 'variable';
      break;
    case 'addTemplate':
      source = 'template';
      break;
  }

  // Build values based on subtype
  switch (determinedSubtype) {
    case 'addPath':
      if (typeof pathOrContent === 'string') {
        values.path = createTextNodeArray(pathOrContent, location);
        raw.path = pathOrContent;
        meta = createPathMeta(pathOrContent);
      } else if (typeof pathOrContent === 'object' && 'raw' in pathOrContent) {
        values.path = [pathOrContent];
        raw.path = pathOrContent.raw;
      }
      break;
      
    case 'addVariable':
      if (typeof pathOrContent === 'string') {
        // Extract the variable name from formats like '@varName' or '{{varName}}'
        let varName = pathOrContent;
        if (varName.startsWith('@')) {
          varName = varName.substring(1);
        } else if (varName.startsWith('{{') && varName.endsWith('}}')) {
          varName = varName.substring(2, varName.length - 2);
        }
        values.variable = createVariableReferenceArray(varName, 'varIdentifier', location);
        raw.variable = pathOrContent;
      }
      break;
      
    case 'addTemplate':
      if (isInterpolatableValueArray(pathOrContent)) {
        values.content = pathOrContent;
        raw.content = pathOrContent.map(node => 
          node.type === 'Text' ? node.content : `{{${(node as VariableReferenceNode).identifier}}}`
        ).join('');
      } else if (typeof pathOrContent === 'string') {
        values.content = createTextNodeArray(pathOrContent, location);
        raw.content = pathOrContent;
      }
      break;
  }

  // Add common optional values
  if (section) {
    values.section = createTextNodeArray(section, location);
    raw.section = section;
  }
  
  if (options?.headingLevel !== undefined) {
    values.headerLevel = [{
      type: 'Number' as const,
      nodeId: `test-number-${testNodeIdCounter++}`,
      value: options.headingLevel,
      raw: options.headingLevel.toString(),
      location: location || DEFAULT_LOCATION
    }];
    raw.headerLevel = options.headingLevel.toString();
  }
  
  if (options?.underHeader) {
    values.underHeader = createTextNodeArray(options.underHeader, location);
    raw.underHeader = options.underHeader;
  }
  
  if (options?.names) {
    values.names = options.names.map(name => 
      createVariableReferenceArray(name, 'identifier', location)[0]
    );
    raw.names = options.names;
  }

  return {
    type: 'Directive',
    nodeId: `test-directive-${testNodeIdCounter++}`,
    location: location || DEFAULT_LOCATION,
    kind: 'add',
    subtype: determinedSubtype,
    source,
    values,
    raw,
    meta
  };
}

// Create an import directive node for testing
export function createImportDirective(
  imports: string,
  location?: Location,
  from?: string
): DirectiveNode {
  // Determine subtype based on imports
  const subtype = imports === '*' ? 'importAll' : 'importSelected';
  
  // Parse imports
  const importNodes: MeldNode[] = [];
  
  if (imports === '*') {
    // Import all
    importNodes.push({
      type: 'VariableReference',
      nodeId: `test-vref-${testNodeIdCounter++}`,
      identifier: '*',
      valueType: 'import',
      isVariableReference: true,
      alias: null,
      location: location || DEFAULT_LOCATION
    } as any);
  } else {
    // Selected imports - for now just create as text
    importNodes.push(...createTextNodeArray(imports, location));
  }
  
  // Create path nodes
  const pathNodes = from ? createTextNodeArray(from, location) : [];
  
  return {
    type: 'Directive',
    nodeId: `test-directive-${testNodeIdCounter++}`,
    location: location || DEFAULT_LOCATION,
    kind: 'import',
    subtype,
    source: 'path',
    values: {
      imports: importNodes,
      ...(from && { path: pathNodes })
    },
    raw: {
      imports,
      ...(from && { path: from })
    },
    meta: from ? createPathMeta(from) : {}
  };
}

// Create a exec directive node for testing
export function createExecDirective(
  identifier: string,
  command: string | InterpolatableValue,
  parameters: string[] = [],
  location?: Location
): DirectiveNode {
  // Create identifier nodes - using TextNode for exec directive identifiers
  const identifierNodes = createTextNodeArray(identifier, location);
  
  // Create command nodes
  let commandNodes: MeldNode[];
  if (typeof command === 'string') {
    commandNodes = createTextNodeArray(command, location);
  } else if (Array.isArray(command)) {
    commandNodes = command;
  } else {
    commandNodes = createTextNodeArray(String(command), location);
  }
  
  // Create parameter nodes as VariableReferences
  const paramNodes = parameters.map(param => 
    createVariableReferenceArray(param, 'varIdentifier', location)[0]
  );
  
  // Check if command has variables
  const hasVariables = commandNodes.some(node => 
    node.type === 'VariableReference' || 
    (node.type === 'Text' && (node.content.includes('@') || node.content.includes('{{')))
  );

  return {
    type: 'Directive',
    nodeId: `test-directive-${testNodeIdCounter++}`,
    location: location || DEFAULT_LOCATION,
    kind: 'exec',
    subtype: 'execCommand',
    source: 'command',
    values: {
      identifier: identifierNodes,
      command: commandNodes,
      ...(parameters.length > 0 && { params: paramNodes })
    },
    raw: {
      identifier,
      ...(parameters.length > 0 && { params: parameters }),
      command: typeof command === 'string' ? command : commandNodes.map(node =>
        node.type === 'Text' ? node.content : `@${(node as VariableReferenceNode).identifier}`
      ).join('')
    },
    meta: {
      hasVariables,
      parameterCount: parameters.length
    }
  };
}

// Mock service creation functions
export function createMockValidationService(): IValidationService {
  // Use simplified mock<T>()
  return mock<IValidationService>();
}

export function createMockStateService(): IStateService {
  // Use simplified mock<T>()
  return mock<IStateService>();
}

export function createMockResolutionService(): IResolutionService {
  // Use simplified mock<T>()
  return mock<IResolutionService>();
}

// Keep other factories as they were (simplified)
export function createMockFileSystemService(): IFileSystemService {
  return mock<IFileSystemService>();
}

export function createMockCircularityService(): ICircularityService {
  return mock<ICircularityService>();
}

export function createMockParserService(): IParserService {
  return mock<IParserService>();
}

export function createMockInterpreterService(): IInterpreterService {
  return mock<IInterpreterService>();
}

export function createMockPathService(): IPathService {
  return mock<IPathService>();
}

/**
 * Create a variable reference node for testing
 */
export function createVariableReferenceNode(
  identifier: string,
  valueType: 'text' | 'data' | 'path' | 'command',
  fields?: Array<{ type: 'field' | 'index', value: string | number }>,
  location: Location = DEFAULT_LOCATION
): VariableReferenceNode {
  return {
    type: 'VariableReference',
    nodeId: `test-vref-${testNodeIdCounter++}`,
    identifier,
    valueType,
    isVariableReference: true,
    ...(fields ? { fields } : {}),
    location
  };
}

/**
 * Create a TextVariable instance for testing
 */
export function createTextVariable(value: string, metadata?: Partial<VariableMetadata>): TextVariable {
  return {
    type: VariableType.TEXT,
    value,
    metadata: metadata || {
      origin: VariableOrigin.DIRECTIVE,
      timestamp: Date.now()
    }
  };
}

/**
 * Create a DataVariable instance for testing
 */
export function createDataVariable(value: JsonValue, metadata?: Partial<VariableMetadata>): DataVariable {
  return {
    type: VariableType.DATA,
    value,
    metadata: metadata || {
      origin: VariableOrigin.DIRECTIVE,
      timestamp: Date.now()
    }
  };
}

/**
 * Create a PathVariable instance for testing
 */
export function createPathVariable(value: string, metadata?: Partial<VariableMetadata>): IPathVariable {
  return {
    type: VariableType.PATH,
    value,
    metadata: metadata || {
      origin: VariableOrigin.DIRECTIVE,
      timestamp: Date.now()
    }
  };
}

/**
 * Create a CommandVariable instance for testing
 */
export function createCommandVariable(
  value: string, 
  execution: { stdout: string; stderr: string; exitCode: number },
  metadata?: Partial<VariableMetadata>
): CommandVariable {
  return {
    type: VariableType.COMMAND,
    value,
    stdout: execution.stdout,
    stderr: execution.stderr,
    exitCode: execution.exitCode,
    metadata: metadata || {
      origin: VariableOrigin.DIRECTIVE,
      timestamp: Date.now()
    }
  };
} 