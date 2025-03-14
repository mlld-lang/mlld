import type { 
  MeldNode, 
  DirectiveNode, 
  TextNode, 
  CodeFenceNode,
  DirectiveKindString
} from '@core/syntax/types';
import type { Location, Position } from '@core/types.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import type { IPathService } from '@services/PathService/IPathService.js';
import { vi, type Mock } from 'vitest';
import { 
  createPosition,
  createTestLocation as createSourceLocation,
  createTestDirective,
  createTestText,
  createTestCodeFence
} from './nodeFactories.js';

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
  const sourceLocation = createSourceLocation(startLine, startColumn, endLine, endColumn);
  return {
    ...sourceLocation,
    filePath
  };
}

/**
 * Create a test directive node
 */
export function createTestDirective(
  kind: DirectiveKindString,
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

// Create a text directive node for testing
export function createTextDirective(
  identifier: string,
  value: string,
  location?: Location
): DirectiveNode {
  return createTestDirective('text', identifier, value, location);
}

// Create a data directive node for testing
export function createDataDirective(
  identifier: string,
  value: any,
  location?: Location
): DirectiveNode {
  // Determine if this is a literal or reference source
  const source = 'literal';
  
  // Return a directive node with the proper structure matching the AST
  return {
    type: 'Directive',
    directive: {
      kind: 'data',
      identifier,
      source,
      value
    },
    location: location || DEFAULT_LOCATION
  };
}

// Create a path directive node for testing
export function createPathDirective(
  identifier: string,
  value: string,
  location?: Location
): DirectiveNode {
  return createTestDirective('path', identifier, value, location);
}

// Create a run directive node for testing
export function createRunDirective(
  command: string,
  location?: Location
): DirectiveNode {
  return {
    type: 'Directive',
    directive: {
      kind: 'run',
      identifier: 'run',
      value: `[${command}]`,
      command
    },
    location: location || DEFAULT_LOCATION
  };
}

// Create an embed directive node for testing
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
  const value = section ? `[${path} # ${section}]` : `[${path}]`;
  return {
    type: 'Directive',
    directive: {
      kind: 'embed',
      path,
      value,
      section,
      ...options
    },
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
  command: string,
  parameters: string[] = [],
  location?: Location
): DirectiveNode {
  const value = parameters.length > 0 
    ? `${identifier}(${parameters.join(', ')}) = @run [${command}]`
    : `${identifier} = @run [${command}]`;
  return {
    type: 'Directive',
    directive: {
      kind: 'define',
      identifier,
      value,
      command,
      parameters
    },
    location: location || DEFAULT_LOCATION
  };
}

// Mock service creation functions
export function createMockValidationService(): IValidationService {
  const mockService = {
    validate: vi.fn(),
    registerValidator: vi.fn(),
    removeValidator: vi.fn(),
    hasValidator: vi.fn(),
    getRegisteredDirectiveKinds: vi.fn(),
    getAllValidators: vi.fn()
  };

  // Set default implementations
  mockService.validate.mockImplementation(async () => {});
  mockService.registerValidator.mockImplementation(() => {});
  mockService.removeValidator.mockImplementation(() => {});
  mockService.hasValidator.mockImplementation(() => false);
  mockService.getRegisteredDirectiveKinds.mockImplementation(() => []);
  mockService.getAllValidators.mockImplementation(() => []);

  return mockService as unknown as IValidationService;
}

export function createMockStateService(): IStateService {
  const mockService = {
    setTextVar: vi.fn(),
    getTextVar: vi.fn(),
    setDataVar: vi.fn(),
    getDataVar: vi.fn(),
    setPathVar: vi.fn(),
    getPathVar: vi.fn(),
    setCommand: vi.fn(),
    getCommand: vi.fn(),
    appendContent: vi.fn(),
    getContent: vi.fn(),
    createChildState: vi.fn(),
    getParentState: vi.fn(),
    isImmutable: vi.fn(),
    makeImmutable: vi.fn(),
    clone: vi.fn(),
    mergeStates: vi.fn(),
    getAllTextVars: vi.fn(),
    getAllDataVars: vi.fn(),
    getAllPathVars: vi.fn(),
    getAllCommands: vi.fn(),
    getNodes: vi.fn(),
    addNode: vi.fn(),
    getTransformedNodes: vi.fn(),
    transformNode: vi.fn(),
    isTransformationEnabled: vi.fn(),
    enableTransformation: vi.fn(),
    addImport: vi.fn(),
    removeImport: vi.fn(),
    hasImport: vi.fn(),
    getImports: vi.fn(),
    getCurrentFilePath: vi.fn(),
    setCurrentFilePath: vi.fn(),
    hasLocalChanges: vi.fn(),
    getLocalChanges: vi.fn(),
    setImmutable: vi.fn(),
    mergeChildState: vi.fn(),
    getStateId: vi.fn()
  };

  // Set default implementations
  mockService.setTextVar.mockImplementation(() => {});
  mockService.getTextVar.mockImplementation(() => '');
  mockService.setDataVar.mockImplementation(() => {});
  mockService.getDataVar.mockImplementation(() => null);
  mockService.setPathVar.mockImplementation(() => {});
  mockService.getPathVar.mockImplementation(() => '');
  mockService.setCommand.mockImplementation(() => {});
  mockService.getCommand.mockImplementation(() => '');
  mockService.appendContent.mockImplementation(() => {});
  mockService.getContent.mockImplementation(() => '');
  mockService.createChildState.mockImplementation(() => createMockStateService());
  mockService.getParentState.mockImplementation(() => undefined);
  mockService.isImmutable.mockImplementation(() => false);
  mockService.makeImmutable.mockImplementation(() => {});
  mockService.setImmutable.mockImplementation(() => {});
  mockService.mergeChildState.mockImplementation((childState) => {
    // Get current state
    const currentTextVars = mockService.getAllTextVars();
    const currentDataVars = mockService.getAllDataVars();
    const currentPathVars = mockService.getAllPathVars();
    const currentCommands = mockService.getAllCommands();
    const currentNodes = mockService.getNodes();
    const currentTransformedNodes = mockService.getTransformedNodes();
    const currentImports = mockService.getImports();

    // Get child state
    const childTextVars = childState.getAllTextVars();
    const childDataVars = childState.getAllDataVars();
    const childPathVars = childState.getAllPathVars();
    const childCommands = childState.getAllCommands();
    const childNodes = childState.getNodes();
    const childTransformedNodes = childState.getTransformedNodes();
    const childImports = childState.getImports();

    // Merge variables
    const mergedTextVars = new Map([...currentTextVars, ...childTextVars]);
    const mergedDataVars = new Map([...currentDataVars, ...childDataVars]);
    const mergedPathVars = new Map([...currentPathVars, ...childPathVars]);
    const mergedCommands = new Map([...currentCommands, ...childCommands]);
    const mergedNodes = [...currentNodes, ...childNodes];
    const mergedImports = new Set([...currentImports, ...childImports]);

    // Handle transformed nodes
    let mergedTransformedNodes;
    if (mockService.isTransformationEnabled()) {
      if (childTransformedNodes && childTransformedNodes.length > 0) {
        mergedTransformedNodes = currentTransformedNodes ? 
          [...currentTransformedNodes, ...childTransformedNodes] :
          [...childTransformedNodes];
      } else {
        mergedTransformedNodes = currentTransformedNodes;
      }
    }

    // Update mock implementations with merged state
    mockService.getAllTextVars.mockImplementation(() => mergedTextVars);
    mockService.getAllDataVars.mockImplementation(() => mergedDataVars);
    mockService.getAllPathVars.mockImplementation(() => mergedPathVars);
    mockService.getAllCommands.mockImplementation(() => mergedCommands);
    mockService.getNodes.mockImplementation(() => mergedNodes);
    if (mergedTransformedNodes) {
      mockService.getTransformedNodes.mockImplementation(() => mergedTransformedNodes);
    }
    mockService.getImports.mockImplementation(() => mergedImports);

    // Update individual getters
    mockService.getTextVar.mockImplementation((name) => mergedTextVars.get(name));
    mockService.getDataVar.mockImplementation((name) => mergedDataVars.get(name));
    mockService.getPathVar.mockImplementation((name) => mergedPathVars.get(name));
    mockService.getCommand.mockImplementation((name) => mergedCommands.get(name));
    mockService.hasImport.mockImplementation((path) => mergedImports.has(path));

    // If tracking service is available, add merge relationship
    if (mockService.trackingService && childState.getStateId()) {
      mockService.trackingService.addRelationship(
        mockService.getStateId()!,
        childState.getStateId()!,
        'merge-source'
      );
    }
  });

  mockService.clone.mockImplementation(() => {
    const newMock = createMockStateService();
    
    // Copy all state
    newMock.getTextVar.mockImplementation(mockService.getTextVar);
    newMock.getDataVar.mockImplementation(mockService.getDataVar);
    newMock.getPathVar.mockImplementation(mockService.getPathVar);
    newMock.getCommand.mockImplementation(mockService.getCommand);
    newMock.getAllTextVars.mockImplementation(mockService.getAllTextVars);
    newMock.getAllDataVars.mockImplementation(mockService.getAllDataVars);
    newMock.getAllPathVars.mockImplementation(mockService.getAllPathVars);
    newMock.getAllCommands.mockImplementation(mockService.getAllCommands);
    newMock.getNodes.mockImplementation(mockService.getNodes);
    newMock.getTransformedNodes.mockImplementation(mockService.getTransformedNodes);
    newMock.isTransformationEnabled.mockImplementation(mockService.isTransformationEnabled);
    newMock.getCurrentFilePath.mockImplementation(mockService.getCurrentFilePath);
    newMock.hasLocalChanges.mockImplementation(mockService.hasLocalChanges);
    newMock.getLocalChanges.mockImplementation(mockService.getLocalChanges);
    newMock.isImmutable.mockImplementation(mockService.isImmutable);
    newMock.getImports.mockImplementation(mockService.getImports);
    newMock.hasImport.mockImplementation(mockService.hasImport);
    newMock.getStateId.mockImplementation(mockService.getStateId);
    
    // Copy service references
    if (mockService.eventService) {
      newMock.setEventService(mockService.eventService);
    }
    if (mockService.trackingService) {
      newMock.setTrackingService(mockService.trackingService);
    }
    
    return newMock;
  });

  // Restore other mock implementations
  mockService.getAllTextVars.mockImplementation(() => new Map());
  mockService.getAllDataVars.mockImplementation(() => new Map());
  mockService.getAllPathVars.mockImplementation(() => new Map());
  mockService.getAllCommands.mockImplementation(() => new Map());
  mockService.getNodes.mockImplementation(() => []);
  mockService.addNode.mockImplementation(() => {});
  mockService.getTransformedNodes.mockImplementation(() => []);

  // Enhanced transformNode implementation
  mockService.transformNode.mockImplementation((original, transformed) => {
    // Check if transformation is enabled
    if (!mockService.isTransformationEnabled()) {
      return;
    }

    // Get current nodes
    const nodes = mockService.getNodes();
    const transformedNodes = mockService.getTransformedNodes() || [...nodes];

    // Try to find the node by reference first
    let index = transformedNodes.findIndex(node => node === original);

    // If not found by reference, try matching by properties
    if (index === -1) {
      index = transformedNodes.findIndex(node => 
        node.type === original.type &&
        node.content === original.content &&
        node.location.start.line === original.location.start.line &&
        node.location.start.column === original.location.start.column &&
        node.location.end.line === original.location.end.line &&
        node.location.end.column === original.location.end.column
      );
    }

    if (index !== -1) {
      transformedNodes[index] = transformed;
      mockService.getTransformedNodes.mockImplementation(() => transformedNodes);
    } else {
      // If not found in transformed nodes, check original nodes
      const originalIndex = nodes.findIndex(node => node === original);
      if (originalIndex === -1) {
        throw new Error('Cannot transform node: original node not found');
      }
      transformedNodes.push(transformed);
      mockService.getTransformedNodes.mockImplementation(() => transformedNodes);
    }
  });

  mockService.isTransformationEnabled.mockImplementation(() => false);
  mockService.enableTransformation.mockImplementation(() => {});
  mockService.addImport.mockImplementation(() => {});
  mockService.removeImport.mockImplementation(() => {});
  mockService.hasImport.mockImplementation(() => false);
  mockService.getImports.mockImplementation(() => new Set());
  mockService.getCurrentFilePath.mockImplementation(() => null);
  mockService.setCurrentFilePath.mockImplementation(() => {});
  mockService.hasLocalChanges.mockImplementation(() => false);
  mockService.getLocalChanges.mockImplementation(() => []);

  return mockService as unknown as IStateService;
}

export function createMockResolutionService(): IResolutionService {
  const mockService = {
    resolveInContext: vi.fn(),
    resolveContent: vi.fn(),
    resolvePath: vi.fn(),
    resolveCommand: vi.fn(),
    resolveText: vi.fn(),
    resolveData: vi.fn(),
    validateResolution: vi.fn(),
    extractSection: vi.fn()
  };

  // Set default implementations
  mockService.resolveInContext.mockImplementation(async (value: string, context: any) => {
    // Validate string literals
    if (value.startsWith("'") || value.startsWith('"') || value.startsWith('`')) {
      const quote = value[0];
      if (value[value.length - 1] !== quote) {
        throw new Error('Unclosed string literal');
      }
      
      // Check for unescaped quotes
      const content = value.slice(1, -1);
      const unescapedQuotes = new RegExp(`(?<!\\\\)${quote}`, 'g');
      if (unescapedQuotes.test(content)) {
        throw new Error('Invalid string literal: unescaped quotes');
      }

      // Return unescaped content
      return content.replace(new RegExp(`\\\\${quote}`, 'g'), quote);
    }

    // Handle variable references
    const varPattern = /\${([^}]+)}/g;
    return value.replace(varPattern, (match, varPath) => {
      const parts = varPath.split('.');
      const baseVar = parts[0];

      // Check for environment variables
      if (baseVar.startsWith('ENV_')) {
        return process.env[baseVar] || '';
      }

      // Try text variables first
      let varValue = context.state.getTextVar(baseVar);
      
      // Then try data variables if allowed
      if (varValue === undefined && context.allowedVariableTypes?.data) {
        varValue = context.state.getDataVar(baseVar);
        if (varValue && parts.length > 1) {
          // Handle nested data access
          for (let i = 1; i < parts.length; i++) {
            varValue = varValue[parts[i]];
          }
        }
      }

      if (varValue === undefined) {
        throw new Error(`Undefined variable: ${baseVar}`);
      }

      return String(varValue);
    });
  });

  mockService.resolveContent.mockImplementation(async (nodes) => {
    return nodes.map(n => n.type === 'Text' ? n.content : '').join('');
  });

  mockService.resolvePath.mockImplementation(async (path) => path);
  mockService.resolveCommand.mockImplementation(async (cmd) => cmd);
  mockService.resolveText.mockImplementation(async (text) => text);
  mockService.resolveData.mockImplementation(async (ref) => ref);
  mockService.validateResolution.mockImplementation(async () => {});
  mockService.extractSection.mockImplementation(async () => '');

  return mockService as unknown as IResolutionService;
}

export function createMockFileSystemService(): IFileSystemService {
  const mockService = {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    exists: vi.fn(),
    stat: vi.fn(),
    isFile: vi.fn(),
    readDir: vi.fn(),
    ensureDir: vi.fn(),
    isDirectory: vi.fn(),
    join: vi.fn(),
    resolve: vi.fn(),
    dirname: vi.fn(),
    basename: vi.fn(),
    normalize: vi.fn(),
    executeCommand: vi.fn(),
    getCwd: vi.fn(),
    enableTestMode: vi.fn(),
    disableTestMode: vi.fn(),
    isTestMode: vi.fn(),
    mockFile: vi.fn(),
    mockDir: vi.fn(),
    clearMocks: vi.fn()
  };

  // Set default implementations
  mockService.readFile.mockImplementation(async () => '');
  mockService.writeFile.mockImplementation(async () => {});
  mockService.exists.mockImplementation(async () => true);
  mockService.stat.mockImplementation(async () => ({}));
  mockService.isFile.mockImplementation(async () => true);
  mockService.readDir.mockImplementation(async () => []);
  mockService.ensureDir.mockImplementation(async () => {});
  mockService.isDirectory.mockImplementation(async () => false);
  mockService.join.mockImplementation((...paths) => paths.join('/'));
  mockService.resolve.mockImplementation((path) => path);
  mockService.dirname.mockImplementation((path) => path.split('/').slice(0, -1).join('/'));
  mockService.basename.mockImplementation((path) => path.split('/').pop() || '');
  mockService.normalize.mockImplementation((path) => path);
  mockService.executeCommand.mockImplementation(async () => ({ stdout: '', stderr: '' }));
  mockService.getCwd.mockImplementation(() => '/project');
  mockService.enableTestMode.mockImplementation(() => {});
  mockService.disableTestMode.mockImplementation(() => {});
  mockService.isTestMode.mockImplementation(() => true);
  mockService.mockFile.mockImplementation(() => {});
  mockService.mockDir.mockImplementation(() => {});
  mockService.clearMocks.mockImplementation(() => {});

  // Bind all functions to the mock service
  Object.keys(mockService).forEach(key => {
    const fn = mockService[key];
    mockService[key] = fn.bind(mockService);
  });

  return mockService as unknown as IFileSystemService;
}

export function createMockCircularityService(): ICircularityService {
  const mockService = {
    beginImport: vi.fn(),
    endImport: vi.fn(),
    isImporting: vi.fn(),
    getImportChain: vi.fn()
  };

  // Set default implementations
  mockService.beginImport.mockImplementation(async () => {});
  mockService.endImport.mockImplementation(async () => {});
  mockService.isImporting.mockImplementation(() => false);
  mockService.getImportChain.mockImplementation(() => []);

  return mockService as unknown as ICircularityService;
}

export function createMockParserService(): IParserService {
  const mockService = {
    parse: vi.fn(),
    parseWithLocations: vi.fn()
  };

  // Set default implementations
  mockService.parse.mockImplementation(async () => []);
  mockService.parseWithLocations.mockImplementation(async () => []);

  return mockService as unknown as IParserService;
}

export function createMockInterpreterService(): IInterpreterService {
  const mockService = {
    interpret: vi.fn(),
    interpretWithContext: vi.fn()
  };

  // Set default implementations
  mockService.interpret.mockImplementation(async () => {});
  mockService.interpretWithContext.mockImplementation(async () => {});

  return mockService as unknown as IInterpreterService;
}

export function createMockPathService(): IPathService {
  const mockService = {
    resolvePath: vi.fn(),
    normalizePath: vi.fn(),
    isAbsolute: vi.fn(),
    join: vi.fn(),
    dirname: vi.fn(),
    basename: vi.fn(),
    extname: vi.fn(),
    relative: vi.fn()
  };

  // Set default implementations
  mockService.resolvePath.mockImplementation(() => '');
  mockService.normalizePath.mockImplementation(() => '');
  mockService.isAbsolute.mockImplementation(() => false);
  mockService.join.mockImplementation(() => '');
  mockService.dirname.mockImplementation(() => '');
  mockService.basename.mockImplementation(() => '');
  mockService.extname.mockImplementation(() => '');
  mockService.relative.mockImplementation(() => '');

  return mockService as unknown as IPathService;
}

/**
 * Create a variable reference node for testing
 */
export function createVariableReferenceNode(
  identifier: string,
  valueType: 'text' | 'data' | 'path',
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

/**
 * Create a text variable reference node for testing (backward compatibility)
 */
export function createTextVarNode(
  identifier: string,
  fields?: Array<{ type: 'field' | 'index', value: string | number }>,
  location: Location = DEFAULT_LOCATION
) {
  return {
    type: 'TextVar',
    identifier,
    ...(fields ? { fields } : {}),
    location
  };
}

/**
 * Create a data variable reference node for testing (backward compatibility)
 */
export function createDataVarNode(
  identifier: string,
  fields: Array<{ type: 'field' | 'index', value: string | number }> = [],
  location: Location = DEFAULT_LOCATION
) {
  return {
    type: 'DataVar',
    identifier,
    fields,
    location
  };
}

/**
 * Create a path variable reference node for testing (backward compatibility)
 */
export function createPathVarNode(
  identifier: string,
  location: Location = DEFAULT_LOCATION
) {
  return {
    type: 'PathVar',
    identifier,
    location
  };
} 