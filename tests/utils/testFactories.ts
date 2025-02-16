import type { 
  MeldNode, 
  DirectiveNode, 
  TextNode, 
  CodeFenceNode,
  DirectiveKindString
} from 'meld-spec';
import type { Location, Position } from '@core/types.js';
import type { IValidationService } from '@services/ValidationService/IValidationService.js';
import type { IResolutionService } from '@services/ResolutionService/IResolutionService.js';
import type { IStateService } from '@services/StateService/IStateService.js';
import type { ICircularityService } from '@services/CircularityService/ICircularityService.js';
import type { IFileSystemService } from '@services/FileSystemService/IFileSystemService.js';
import type { IParserService } from '@services/ParserService/IParserService.js';
import type { IInterpreterService } from '@services/InterpreterService/IInterpreterService.js';
import type { IPathService } from '@services/PathService/IPathService.js';
import { vi, type Mock } from 'vitest';

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
 * Create a test directive node
 */
export function createTestDirective(
  kind: DirectiveKindString,
  identifier: string,
  value: string,
  location: Location = DEFAULT_LOCATION
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
  const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
  return createTestDirective('data', identifier, stringValue, location);
}

// Create a path directive node for testing
export function createPathDirective(
  identifier: string,
  value: string,
  location?: Location
): DirectiveNode {
  return {
    type: 'Directive',
    directive: {
      kind: 'path',
      identifier,
      value
    },
    location
  };
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
  return {
    type: 'Directive',
    directive: {
      kind: 'embed',
      path,
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
  const value = from ? `imports = [${imports}] path = "${from}"` : `path = "${imports}"`;
  return createTestDirective('import', 'import', value, location);
}

// Create a define directive node for testing
export function createDefineDirective(
  identifier: string,
  command: string,
  parameters: string[] = [],
  location?: Location
): DirectiveNode {
  const value = {
    command: {
      kind: 'run',
      command
    },
    parameters
  };
  return createTestDirective('define', identifier, JSON.stringify(value), location);
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
    mergeStates: vi.fn()
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
  mockService.createChildState.mockImplementation(() => null);
  mockService.getParentState.mockImplementation(() => undefined);
  mockService.isImmutable.mockImplementation(() => false);
  mockService.makeImmutable.mockImplementation(() => {});
  mockService.clone.mockImplementation(() => null);
  mockService.mergeStates.mockImplementation(() => {});

  return mockService as unknown as IStateService;
}

export function createMockResolutionService(): IResolutionService {
  const mockService = {
    resolveInContext: vi.fn(),
    resolveContent: vi.fn(),
    resolvePath: vi.fn(),
    resolveCommand: vi.fn(),
    extractSection: vi.fn()
  };

  // Set default implementations
  mockService.resolveInContext.mockImplementation(async () => '');
  mockService.resolveContent.mockImplementation(async () => '');
  mockService.resolvePath.mockImplementation(async () => '');
  mockService.resolveCommand.mockImplementation(async () => '');
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