import type { 
  MeldNode, 
  DirectiveNode, 
  TextNode, 
  CodeFenceNode,
  DirectiveKind,
  DirectiveData
} from '@core/syntax/types';
import type { Location, Position } from '@core/types';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import { vi, type Mock } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { isInterpolatableValueArray } from '@core/syntax/types/guards.js';
import type { InterpolatableValue, StructuredPath as AstStructuredPath, VariableReferenceNode } from '@core/syntax/types/nodes.js';
import { VariableOrigin } from '@core/types/variables.js';
import type { TextVariable, DataVariable, IPathVariable, CommandVariable, VariableMetadata, VariableType } from '@core/types/variables.js';
import type { JsonValue } from '@core/types';
import type { ICommandDefinition } from '@core/types/define.js';

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
  return {
    type: 'Directive',
    directive: {
      kind: 'text',
      identifier,
      source: 'literal',
      value
    } as DirectiveData,
    location: location || DEFAULT_LOCATION
  };
}

// Create a data directive node for testing
export function createDataDirective(
  identifier: string,
  value: any,
  location?: Location
): DirectiveNode {
  return {
    type: 'Directive',
    directive: {
      kind: 'data',
      identifier,
      source: 'literal',
      value
    } as DirectiveData,
    location: location || DEFAULT_LOCATION
  };
}

// Create a path directive node for testing
export function createPathDirective(
  identifier: string,
  pathString: string,
  location?: Location
): DirectiveNode {
  const pathObject: AstStructuredPath = {
      raw: pathString,
      structured: {
          segments: pathString.split('/').filter(Boolean),
          base: pathString.startsWith('$') ? pathString.split('/')[0] : '.'
      }
  };
  return {
    type: 'Directive',
    directive: {
      kind: 'path',
      identifier,
      path: pathObject
    } as DirectiveData,
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
  let commandValue: InterpolatableValue | { name: string, args: any[], raw: string } | undefined = undefined;
  let resolvedParameters: InterpolatableValue | undefined = undefined;
  
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
      commandValue = [{ type: 'Text', content: commandInput }];
    } else if (isInterpolatableValueArray(commandInput)) {
      commandValue = commandInput;
    }
  } else if (resolvedSubtype === 'runDefined') {
    commandValue = commandInput as { name: string, args: any[], raw: string };
  }

  // Normalize parameters if they are strings
  if (parameters) {
      resolvedParameters = parameters.map(p => 
          typeof p === 'string' ? { type: 'Text', content: p } : p
      );
  }

  const directiveData: DirectiveData = {
      kind: 'run',
      subtype: resolvedSubtype,
      ...(commandValue && { command: commandValue }),
      ...(language && { language }),
      ...(resolvedParameters && { parameters: resolvedParameters }),
      // Use the passed parameters correctly
      outputVariable: outputVar || 'stdout', 
      errorVariable: errorVar || 'stderr' 
  };

  return {
    type: 'Directive',
    location: location || DEFAULT_LOCATION,
    directive: directiveData 
  };
}

// Create an embed directive node for testing
export function createEmbedDirective(
  pathOrContent: string | InterpolatableValue | AstStructuredPath, 
  section?: string,
  location?: Location,
  subtype?: 'embedPath' | 'embedVariable' | 'embedTemplate',
  options?: { 
    names?: string[];
    headingLevel?: number;
    underHeader?: string;
  }
): DirectiveNode {
  let determinedSubtype: 'embedPath' | 'embedVariable' | 'embedTemplate';
  let pathProperty: AstStructuredPath | undefined = undefined;
  let contentProperty: InterpolatableValue | undefined = undefined;
  let namesProperty = options?.names;

  if (subtype) {
    determinedSubtype = subtype;
    if (subtype === 'embedTemplate') {
      if (!isInterpolatableValueArray(pathOrContent)) {
        throw new Error(`Explicit subtype 'embedTemplate' requires InterpolatableValue array for pathOrContent`);
      }
      contentProperty = pathOrContent;
    } else {
      if (typeof pathOrContent === 'object' && 'raw' in pathOrContent) {
        pathProperty = pathOrContent;
      } else if (typeof pathOrContent === 'string') {
        pathProperty = { 
          raw: pathOrContent, 
          structured: { segments: pathOrContent.split('/').filter(Boolean), base: '.'} 
        };
      } else {
         throw new Error(`Explicit subtype '${subtype}' requires string or AstStructuredPath for pathOrContent`);
      }
    }
  } else {
    if (isInterpolatableValueArray(pathOrContent)) {
      determinedSubtype = 'embedTemplate';
      contentProperty = pathOrContent;
    } else if (typeof pathOrContent === 'object' && 'raw' in pathOrContent) {
      determinedSubtype = 'embedPath';
      pathProperty = pathOrContent;
    } else if (typeof pathOrContent === 'string') {
      if (pathOrContent.startsWith('{{') || pathOrContent.startsWith('$')) {
         determinedSubtype = 'embedVariable';
         pathProperty = { raw: pathOrContent, structured: { segments: [], base: '.' } };
      } else {
         determinedSubtype = 'embedPath';
         pathProperty = { raw: pathOrContent, structured: { segments: pathOrContent.split('/').filter(Boolean), base: '.'} };
      }
    } else {
       throw new Error('Invalid input type for createEmbedDirective pathOrContent');
    }
  }

  const directiveData: DirectiveData = {
    kind: 'embed',
    subtype: determinedSubtype,
    ...(determinedSubtype === 'embedTemplate' ? { content: contentProperty } : { path: pathProperty }),
    ...(section && { section }),
    ...(namesProperty && { names: namesProperty }),
    options: {
       ...(options?.headingLevel && { headingLevel: String(options.headingLevel) }),
       ...(options?.underHeader && { underHeader: options.underHeader })
    }
  };
  
  return {
    type: 'Directive',
    directive: directiveData,
    location: location || DEFAULT_LOCATION
  };
}

// Create an import directive node for testing
export function createImportDirective(
  imports: string,
  location?: Location,
  from?: string
): DirectiveNode {
  const value = from ? `[${imports}] from [${from}]` : `[${imports}]`;
  const path = from || imports;
  return {
    type: 'Directive',
    directive: {
      kind: 'import',
      identifier: 'import',
      value,
      path
    },
    location: location || DEFAULT_LOCATION
  };
}

// Create a define directive node for testing
export function createDefineDirective(
  identifier: string,
  command: string | any,
  parameters: string[] = [],
  location?: Location
): DirectiveNode {
  let valueProp: InterpolatableValue | undefined = undefined;
  let commandProp: any | undefined = undefined;

  if (typeof command === 'string') {
    valueProp = [{ type: 'Text', content: command }];
  } else {
    commandProp = command;
  }

  const directiveData: DirectiveData = {
      kind: 'define',
      name: identifier,
      parameters: parameters?.map(p => ({ name: p, position: parameters.indexOf(p) + 1 })),
      ...(valueProp && { value: valueProp }),
      ...(commandProp && { command: commandProp })
  };
  return {
    type: 'Directive',
    directive: directiveData,
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
) {
  return {
    type: 'VariableReference',
    identifier,
    valueType,
    isVariableReference: true,
    ...(fields ? { fields } : {}),
    location
  };
} 