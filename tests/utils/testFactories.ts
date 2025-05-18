import type { 
  MeldNode, 
  DirectiveNode, 
  TextNode, 
  CodeFenceNode,
  VariableReferenceNode
} from '@core/ast/types/index';
import type { DirectiveKind, DirectiveSubtype } from '@core/syntax/types/directives';
import type { DirectiveData } from '@core/syntax/types';
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
import { isInterpolatableValueArray } from '@core/syntax/types/guards';
import type { InterpolatableValue, StructuredPath as AstStructuredPath, VariableReferenceNode } from '@core/syntax/types/nodes';
import { VariableOrigin, VariableType } from '@core/types/variables';
import type { TextVariable, DataVariable, IPathVariable, CommandVariable, VariableMetadata } from '@core/types/variables';
import type { JsonValue } from '@core/types';
import type { ICommandDefinition } from '@core/types/exec';

// Counter for generating unique node IDs in tests
let testNodeIdCounter = 0;

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
  return {
    type: 'Directive',
    directive: {
      kind,
      ...properties
    } as DirectiveData,
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

// Create a text directive node for testing
export function createTextDirective(
  identifier: string,
  value: string | InterpolatableValue,
  location?: Location
): DirectiveNode {
  // Convert to the new structure
  const variableRef: VariableReferenceNode = {
    type: 'VariableReference',
    nodeId: `test-vref-${testNodeIdCounter++}`,
    identifier,
    valueType: 'identifier',
    isVariableReference: true,
    location: location || DEFAULT_LOCATION
  };
  
  let valueNodes: MeldNode[];
  if (typeof value === 'string') {
    valueNodes = [{
      type: 'Text',
      nodeId: `test-text-${testNodeIdCounter++}`,
      content: value,
      location: location || DEFAULT_LOCATION
    }];
  } else if (Array.isArray(value)) {
    valueNodes = value;
  } else {
    valueNodes = [];
  }
  
  return {
    type: 'Directive',
    nodeId: `test-directive-${testNodeIdCounter++}`,
    kind: 'text',
    subtype: 'textVariable',
    source: 'literal',
    values: {
      identifier: [variableRef],
      value: valueNodes
    },
    raw: {
      identifier,
      value: typeof value === 'string' ? value : '' 
    },
    meta: {},
    location: location || DEFAULT_LOCATION
  };
}

// Create a data directive node for testing
export function createDataDirective(
  identifier: string,
  value: any,
  location?: Location
): DirectiveNode {
  const variableRef: VariableReferenceNode = {
    type: 'VariableReference',
    nodeId: `test-vref-${testNodeIdCounter++}`,
    identifier,
    valueType: 'identifier',
    isVariableReference: true,
    location: location || DEFAULT_LOCATION
  };
  
  return {
    type: 'Directive',
    nodeId: `test-directive-${testNodeIdCounter++}`,
    kind: 'data',
    subtype: 'dataVariable',
    source: 'literal',
    values: {
      identifier: [variableRef],
      value: [{
        type: 'Text',
        nodeId: `test-text-${testNodeIdCounter++}`,
        content: JSON.stringify(value),
        location: location || DEFAULT_LOCATION
      }]
    },
    raw: {
      identifier,
      value: JSON.stringify(value)
    },
    meta: {},
    location: location || DEFAULT_LOCATION
  };
}

// Create a path directive node for testing
export function createPathDirective(
  identifier: string,
  pathString: string,
  location?: Location
): DirectiveNode {
  const variableRef: VariableReferenceNode = {
    type: 'VariableReference',
    nodeId: `test-vref-${testNodeIdCounter++}`,
    identifier,
    valueType: 'identifier',
    isVariableReference: true,
    location: location || DEFAULT_LOCATION
  };
  
  const pathObject: AstStructuredPath = {
      raw: pathString,
      structured: {
          segments: pathString.split('/').filter(Boolean),
          base: pathString.startsWith('$') ? pathString.split('/')[0] : '.'
      }
  };
  
  return {
    type: 'Directive',
    nodeId: `test-directive-${testNodeIdCounter++}`,
    kind: 'path',
    subtype: 'pathVariable',
    source: 'path',
    values: {
      identifier: [variableRef],
      path: [pathObject]
    },
    raw: {
      identifier,
      path: pathString
    },
    meta: {},
    location: location || DEFAULT_LOCATION
  };
}

// Create a run directive node for testing
export function createRunDirective(
  commandInput: string | InterpolatableValue | { name: string, args: any[], raw: string }, 
  location?: Location,
  subtype?: 'runCommand' | 'runCode' | 'runCodeParams' | 'runDefined',
  language?: string,
  parameters?: Array<VariableReferenceNode | string>,
  outputVar?: string,
  errorVar?: string
): DirectiveNode {
  let resolvedSubtype = subtype;
  let commandValue: MeldNode[] = [];
  let resolvedParameters: MeldNode[] | undefined = undefined;
  
  // Determine subtype if not provided
  if (!resolvedSubtype) {
    if (typeof commandInput === 'object' && 'name' in commandInput) {
      resolvedSubtype = 'runDefined';
    } else if (language) {
      resolvedSubtype = parameters ? 'runCodeParams' : 'runCode';
    } else {
      resolvedSubtype = 'runCommand';
    }
  }

  // Normalize commandInput based on subtype
  if (resolvedSubtype === 'runCommand' || resolvedSubtype === 'runCode' || resolvedSubtype === 'runCodeParams') {
    if (typeof commandInput === 'string') {
      commandValue = [{ 
        type: 'Text', 
        nodeId: `test-text-${testNodeIdCounter++}`,
        content: commandInput,
        location: location || DEFAULT_LOCATION 
      }];
    } else if (isInterpolatableValueArray(commandInput)) {
      commandValue = commandInput;
    }
  } else if (resolvedSubtype === 'runDefined') {
    // Handle defined command differently
    const definedCmd = commandInput as { name: string, args: any[], raw: string };
    commandValue = [{
      type: 'VariableReference',
      nodeId: `test-vref-${testNodeIdCounter++}`,
      identifier: definedCmd.name,
      valueType: 'command',
      isVariableReference: true,
      location: location || DEFAULT_LOCATION
    }];
  }

  // Normalize parameters if they are strings
  if (parameters) {
      resolvedParameters = parameters.map(p => {
          if (typeof p === 'string') {
              return {
                  type: 'Text',
                  nodeId: `test-text-${testNodeIdCounter++}`,
                  content: p,
                  location: location || DEFAULT_LOCATION
              };
          }
          return p;
      });
  }

  return {
    type: 'Directive',
    nodeId: `test-directive-${testNodeIdCounter++}`,
    kind: 'run',
    subtype: resolvedSubtype,
    source: 'literal',
    values: {
      command: commandValue,
      ...(language && { language: [{
        type: 'Text',
        nodeId: `test-text-${testNodeIdCounter++}`,
        content: language,
        location: location || DEFAULT_LOCATION
      }] }),
      ...(resolvedParameters && { parameters: resolvedParameters }),
      ...(outputVar && { outputVariable: [{
        type: 'VariableReference',
        nodeId: `test-vref-${testNodeIdCounter++}`,
        identifier: outputVar,
        valueType: 'identifier',
        isVariableReference: true,
        location: location || DEFAULT_LOCATION
      }] }),
      ...(errorVar && { errorVariable: [{
        type: 'VariableReference',
        nodeId: `test-vref-${testNodeIdCounter++}`,
        identifier: errorVar,
        valueType: 'identifier',
        isVariableReference: true,
        location: location || DEFAULT_LOCATION
      }] })
    },
    raw: {
      command: typeof commandInput === 'string' ? commandInput : '',
      outputVariable: outputVar,
      errorVariable: errorVar
    },
    meta: {},
    location: location || DEFAULT_LOCATION
  };
}

// Create an add directive node for testing (formerly add)
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
  let pathValue: MeldNode[] | undefined = undefined;
  let contentValue: MeldNode[] | undefined = undefined;
  
  // Replace old add subtypes with add subtypes
  if (subtype) {
    determinedSubtype = subtype;
  } else {
    // Auto-determine subtype
    if (isInterpolatableValueArray(pathOrContent)) {
      determinedSubtype = 'addTemplate';
      contentValue = pathOrContent;
    } else if (typeof pathOrContent === 'object' && 'raw' in pathOrContent) {
      determinedSubtype = 'addPath';
      pathValue = [pathOrContent];
    } else if (typeof pathOrContent === 'string') {
      determinedSubtype = 'addPath';
      pathValue = [{
        raw: pathOrContent,
        structured: {
          segments: pathOrContent.split('/').filter(Boolean),
          base: pathOrContent.startsWith('$') ? pathOrContent.split('/')[0] : '.'
        }
      }];
    } else {
      throw new Error('Invalid input type for createAddDirective pathOrContent');
    }
  }

  return {
    type: 'Directive',
    nodeId: `test-directive-${testNodeIdCounter++}`,
    kind: 'add', // Changed from 'add' to 'add'
    subtype: determinedSubtype,
    source: 'literal',
    values: {
      ...(pathValue && { path: pathValue }),
      ...(contentValue && { content: contentValue }),
      ...(section && { section: [{
        type: 'Text',
        nodeId: `test-text-${testNodeIdCounter++}`,
        content: section,
        location: location || DEFAULT_LOCATION
      }] }),
      ...(options?.names && { names: options.names.map(name => ({
        type: 'Text',
        nodeId: `test-text-${testNodeIdCounter++}`,
        content: name,
        location: location || DEFAULT_LOCATION
      })) })
    },
    raw: {
      path: typeof pathOrContent === 'string' ? pathOrContent : undefined,
      section,
      names: options?.names
    },
    meta: {},
    location: location || DEFAULT_LOCATION
  };
}

// Create an import directive node for testing
export function createImportDirective(
  imports: string,
  location?: Location,
  from?: string
): DirectiveNode {
  return {
    type: 'Directive',
    nodeId: `test-directive-${testNodeIdCounter++}`,
    kind: 'import',
    subtype: 'importAll', // or determine based on imports content
    source: 'import',
    values: {
      imports: [{
        type: 'Text',
        nodeId: `test-text-${testNodeIdCounter++}`,
        content: imports,
        location: location || DEFAULT_LOCATION
      }],
      path: from ? [{
        raw: from,
        structured: {
          segments: from.split('/').filter(Boolean),
          base: from.startsWith('$') ? from.split('/')[0] : '.'
        }
      }] : undefined
    },
    raw: {
      imports,
      path: from
    },
    meta: {},
    location: location || DEFAULT_LOCATION
  };
}

// Create a exec directive node for testing
export function createExecDirective(
  identifier: string,
  command: string | any,
  parameters: string[] = [],
  location?: Location
): DirectiveNode {
  const identifierRef: VariableReferenceNode = {
    type: 'VariableReference',
    nodeId: `test-vref-${testNodeIdCounter++}`,
    identifier,
    valueType: 'identifier',
    isVariableReference: true,
    location: location || DEFAULT_LOCATION
  };

  let commandValue: MeldNode[];
  if (typeof command === 'string') {
    commandValue = [{
      type: 'Text',
      nodeId: `test-text-${testNodeIdCounter++}`,
      content: command,
      location: location || DEFAULT_LOCATION
    }];
  } else {
    // Handle other command types if needed
    commandValue = [];
  }

  return {
    type: 'Directive',
    nodeId: `test-directive-${testNodeIdCounter++}`,
    kind: 'exec', // Changed from 'exec' to 'exec'
    subtype: 'execCommand',
    source: 'literal',
    values: {
      identifier: [identifierRef],
      command: commandValue,
      parameters: parameters.map(p => ({
        type: 'Text',
        nodeId: `test-text-${testNodeIdCounter++}`,
        content: p,
        location: location || DEFAULT_LOCATION
      }))
    },
    raw: {
      identifier,
      command: typeof command === 'string' ? command : JSON.stringify(command),
      parameters
    },
    meta: {},
    location: location || DEFAULT_LOCATION
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