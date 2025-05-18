import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { AddDirectiveHandler } from './AddDirectiveHandler';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import type { IPathService } from '@services/fs/PathService/IPathService';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService';
import { InterpreterServiceClientFactory } from '@services/pipeline/InterpreterService/factories/InterpreterServiceClientFactory';
import type { IInterpreterServiceClient } from '@services/pipeline/InterpreterService/interfaces/IInterpreterServiceClient';
import { ASTFixtureLoader } from '@tests/utils/ASTFixtureLoader';
import path from 'node:path';
import { MeldPath, PathContentType } from '@core/types/paths';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError';
import type { DirectiveProcessingContext } from '@core/types/index';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { AddDirectiveNode } from '@core/ast/types/add';
import type { DirectiveNode } from '@core/ast/types';
import type { ILogger } from '@services/pipeline/DirectiveService/handlers/execution/AddDirectiveHandler';
import type { ResolutionContext } from '@core/types/resolution';

describe('AddDirectiveHandler - Fixture Tests', () => {
  let handler: AddDirectiveHandler;
  let fileSystemServiceMock: IFileSystemService;
  let validationServiceMock: IValidationService;
  let resolutionServiceMock: IResolutionService;
  let pathServiceMock: IPathService;
  let circularityServiceMock: ICircularityService;
  let interpreterServiceClientFactory: InterpreterServiceClientFactory;
  let interpreterServiceClient: IInterpreterServiceClient;
  let loggerMock: ILogger;
  let stateServiceMock: IStateService;
  let fixtureLoader: ASTFixtureLoader;

  beforeEach(() => {
    // Create mocks
    fileSystemServiceMock = mock<IFileSystemService>();
    validationServiceMock = mock<IValidationService>();
    resolutionServiceMock = mock<IResolutionService>();
    pathServiceMock = mock<IPathService>();
    circularityServiceMock = mock<ICircularityService>();
    interpreterServiceClient = mock<IInterpreterServiceClient>();
    interpreterServiceClientFactory = mock<InterpreterServiceClientFactory>();
    loggerMock = mock<ILogger>();
    stateServiceMock = mock<IStateService>();

    // Set up factory to return client
    vi.mocked(interpreterServiceClientFactory.createClient).mockReturnValue(interpreterServiceClient);

    // Create handler
    handler = new AddDirectiveHandler(
      validationServiceMock,
      resolutionServiceMock,
      circularityServiceMock,
      fileSystemServiceMock,
      pathServiceMock,
      interpreterServiceClientFactory,
      loggerMock
    );
    
    // Set up fixture loader
    const fixtureDir = path.join('/Users/adam/dev/meld/core/ast/fixtures');
    fixtureLoader = new ASTFixtureLoader(fixtureDir);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('addPath', () => {
    it('should handle add-path directive correctly', async () => {
      const fixture = fixtureLoader.getFixture('add-path');
      if (!fixture) throw new Error('Fixture not found');
      const addNode = fixture.ast[0] as AddDirectiveNode;
      
      // Set up mocks
      vi.mocked(resolutionServiceMock.resolveInContext).mockResolvedValue('file.md');
      vi.mocked(resolutionServiceMock.resolvePath).mockResolvedValue({
        validatedPath: '/test/file.md',
        contentType: PathContentType.File,
        caseDetails: {}
      } as MeldPath);
      vi.mocked(fileSystemServiceMock.exists).mockResolvedValue(true);
      vi.mocked(fileSystemServiceMock.readFile).mockResolvedValue(fixture.expected);
      vi.mocked(stateServiceMock.getCurrentFilePath).mockReturnValue('/test/current.md');
      
      const mockContext: DirectiveProcessingContext = {
        directiveNode: addNode,
        state: stateServiceMock,
        resolutionContext: {} as ResolutionContext,
        executionContext: {},
        formattingContext: undefined
      };
      
      const result = await handler.handle(mockContext);
      
      expect(result.replacement).toBeDefined();
      expect(result.replacement?.[0]?.content).toBe(fixture.expected);
      expect(result.stateChanges).toBeUndefined();
    });

    it.skip('should handle add-path-section directive correctly', async () => {
      // TODO: Fix grammar bug where section extraction syntax is not properly parsed
      // The parser should create a separate 'section' property in values, but currently
      // includes it in the path string as "file.md # Section 1"
      const fixture = fixtureLoader.getFixture('add-path-section');
      if (!fixture) throw new Error('Fixture not found');
      const addNode = fixture.ast[0] as AddDirectiveNode;
      
      const fullContent = '# Title\n## Section 1\nSection 1 content\n## Section 2\nSection 2 content';
      const sectionContent = fixture.expected; // Use the fixture's expected value
      
      // Set up mocks
      vi.mocked(resolutionServiceMock.resolveInContext).mockResolvedValue('file.md');
      vi.mocked(resolutionServiceMock.resolvePath).mockResolvedValue({
        validatedPath: '/test/file.md',
        contentType: PathContentType.File,
        caseDetails: {}
      } as MeldPath);
      vi.mocked(fileSystemServiceMock.exists).mockResolvedValue(true);
      vi.mocked(fileSystemServiceMock.readFile).mockResolvedValue(fullContent);
      vi.mocked(resolutionServiceMock.extractSection).mockResolvedValue(sectionContent);
      vi.mocked(stateServiceMock.getCurrentFilePath).mockReturnValue('/test/current.md');
      
      const mockContext: DirectiveProcessingContext = {
        directiveNode: addNode,
        state: stateServiceMock,
        resolutionContext: {} as ResolutionContext,
        executionContext: {},
        formattingContext: undefined
      };
      
      const result = await handler.handle(mockContext);
      
      expect(result.replacement).toBeDefined();
      expect(result.replacement?.[0]?.content).toBe(sectionContent);
      expect(resolutionServiceMock.extractSection).toHaveBeenCalledWith(fullContent, 'file.md # Section 1', undefined);
    });
  });

  describe('addTemplate', () => {
    it('should handle add-template directive correctly', async () => {
      const fixture = fixtureLoader.getFixture('add-template');
      if (!fixture) throw new Error('Fixture not found');
      const addNode = fixture.ast[0] as AddDirectiveNode;
      
      // Set up mocks
      vi.mocked(resolutionServiceMock.resolveNodes).mockResolvedValue(fixture.expected);
      vi.mocked(stateServiceMock.getCurrentFilePath).mockReturnValue('/test/current.md');
      
      const mockContext: DirectiveProcessingContext = {
        directiveNode: addNode,
        state: stateServiceMock,
        resolutionContext: {} as ResolutionContext,
        executionContext: {},
        formattingContext: undefined
      };
      
      const result = await handler.handle(mockContext);
      
      expect(result.replacement).toBeDefined();
      expect(result.replacement?.[0]?.content).toBe(fixture.expected);
      expect(resolutionServiceMock.resolveNodes).toHaveBeenCalledWith(addNode.values.content, mockContext.resolutionContext);
    });

    it.skip('should handle add-template-multiline directive correctly', async () => {
      // TODO: Fix grammar bug where multiline templates are parsed as paths instead of templates
      // See _dev/GRAMMAR-BUGS.md - "Multiline Template Parsing in Add Directives"
      const fixture = fixtureLoader.getFixture('add-template-multiline');
      if (!fixture) throw new Error('Fixture not found');
      // The fixture now includes all directives, we need the second one (index 1) which is the @add directive
      const addNode = fixture.ast[1] as AddDirectiveNode;
      
      // Set up mocks
      vi.mocked(resolutionServiceMock.resolveNodes).mockResolvedValue(fixture.expected);
      vi.mocked(stateServiceMock.getCurrentFilePath).mockReturnValue('/test/current.md');
      
      const mockContext: DirectiveProcessingContext = {
        directiveNode: addNode,
        state: stateServiceMock,
        resolutionContext: {} as ResolutionContext,
        executionContext: {},
        formattingContext: undefined
      };
      
      const result = await handler.handle(mockContext);
      
      expect(result.replacement).toBeDefined();
      expect(result.replacement?.[0]?.content).toBe(fixture.expected);
    });

    it('should handle add-template-variables directive correctly', async () => {
      const fixture = fixtureLoader.getFixture('add-template-variables');
      if (!fixture) throw new Error('Fixture not found');
      // The fixture now includes all directives, we need the second one (index 1) which is the @add directive
      const addNode = fixture.ast[1] as AddDirectiveNode;
      
      // Set up mocks
      vi.mocked(resolutionServiceMock.resolveNodes).mockResolvedValue(fixture.expected);
      vi.mocked(stateServiceMock.getCurrentFilePath).mockReturnValue('/test/current.md');
      
      const mockContext: DirectiveProcessingContext = {
        directiveNode: addNode,
        state: stateServiceMock,
        resolutionContext: {} as ResolutionContext,
        executionContext: {},
        formattingContext: undefined
      };
      
      const result = await handler.handle(mockContext);
      
      expect(result.replacement).toBeDefined();
      expect(result.replacement?.[0]?.content).toBe(fixture.expected);
    });
  });

  describe('addVariable', () => {
    it('should handle add-variable directive correctly', async () => {
      const fixture = fixtureLoader.getFixture('add-variable');
      if (!fixture) throw new Error('Fixture not found');
      // The fixture now includes all directives, we need the second one (index 1) which is the @add directive
      const addNode = fixture.ast[1] as AddDirectiveNode;
      
      // Set up mocks
      vi.mocked(resolutionServiceMock.resolveInContext).mockResolvedValue(fixture.expected);
      vi.mocked(stateServiceMock.getCurrentFilePath).mockReturnValue('/test/current.md');
      
      const mockContext: DirectiveProcessingContext = {
        directiveNode: addNode,
        state: stateServiceMock,
        resolutionContext: {} as ResolutionContext,
        executionContext: {},
        formattingContext: undefined
      };
      
      const result = await handler.handle(mockContext);
      
      expect(result.replacement).toBeDefined();
      expect(result.replacement?.[0]?.content).toBe(fixture.expected);
      expect(resolutionServiceMock.resolveInContext).toHaveBeenCalledWith('@variableName', mockContext.resolutionContext);
    });
  });

  describe('error handling', () => {
    it('should throw error when addPath file does not exist', async () => {
      const fixture = fixtureLoader.getFixture('add-path');
      if (!fixture) throw new Error('Fixture not found');
      const addNode = fixture.ast[0] as AddDirectiveNode;
      
      // Set up mocks
      vi.mocked(resolutionServiceMock.resolveInContext).mockResolvedValue('file.md');
      vi.mocked(resolutionServiceMock.resolvePath).mockResolvedValue({
        validatedPath: '/test/file.md',
        contentType: PathContentType.File,
        caseDetails: {}
      } as MeldPath);
      vi.mocked(fileSystemServiceMock.exists).mockResolvedValue(false);
      vi.mocked(stateServiceMock.getCurrentFilePath).mockReturnValue('/test/current.md');
      
      const mockContext: DirectiveProcessingContext = {
        directiveNode: addNode,
        state: stateServiceMock,
        resolutionContext: {} as ResolutionContext,
        executionContext: {},
        formattingContext: undefined
      };
      
      await expect(handler.handle(mockContext)).rejects.toThrow(DirectiveError);
      await expect(handler.handle(mockContext)).rejects.toThrow('Add source file not found');
    });

    it('should throw error for invalid directive kind', async () => {
      const invalidNode = {
        kind: 'invalid',
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 10 } }
      } as unknown as DirectiveNode;
      
      vi.mocked(stateServiceMock.getCurrentFilePath).mockReturnValue('/test/current.md');
      
      const mockContext: DirectiveProcessingContext = {
        directiveNode: invalidNode,
        state: stateServiceMock,
        resolutionContext: {} as ResolutionContext,
        executionContext: {},
        formattingContext: undefined
      };
      
      await expect(handler.handle(mockContext)).rejects.toThrow(DirectiveError);
      await expect(handler.handle(mockContext)).rejects.toThrow('Invalid node type provided to AddDirectiveHandler');
    });

    it('should throw error for unsupported add subtype', async () => {
      const addNode = {
        kind: 'add',
        subtype: 'unsupported',
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 10 } },
        values: {},
        raw: {}
      } as unknown as AddDirectiveNode;
      
      vi.mocked(stateServiceMock.getCurrentFilePath).mockReturnValue('/test/current.md');
      
      const mockContext: DirectiveProcessingContext = {
        directiveNode: addNode,
        state: stateServiceMock,
        resolutionContext: {} as ResolutionContext,
        executionContext: {},
        formattingContext: undefined
      };
      
      await expect(handler.handle(mockContext)).rejects.toThrow(DirectiveError);
      await expect(handler.handle(mockContext)).rejects.toThrow('Unsupported add subtype: unsupported');
    });
  });

  describe('options handling', () => {
    it('should handle headingLevel option', async () => {
      const fixture = fixtureLoader.getFixture('add-path');
      if (!fixture) throw new Error('Fixture not found');
      const addNode = fixture.ast[0] as AddDirectiveNode;
      // Add headingLevel option
      (addNode.values as any).options = { headingLevel: 2 };
      
      // Set up mocks
      vi.mocked(resolutionServiceMock.resolveInContext).mockResolvedValue('file.md');
      vi.mocked(resolutionServiceMock.resolvePath).mockResolvedValue({
        validatedPath: '/test/file.md',
        contentType: PathContentType.File,
        caseDetails: {}
      } as MeldPath);
      vi.mocked(fileSystemServiceMock.exists).mockResolvedValue(true);
      vi.mocked(fileSystemServiceMock.readFile).mockResolvedValue(fixture.expected);
      vi.mocked(stateServiceMock.getCurrentFilePath).mockReturnValue('/test/current.md');
      
      const mockContext: DirectiveProcessingContext = {
        directiveNode: addNode,
        state: stateServiceMock,
        resolutionContext: {} as ResolutionContext,
        executionContext: {},
        formattingContext: undefined
      };
      
      const result = await handler.handle(mockContext);
      
      // Handler should log warning about unsupported heading level
      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.stringContaining('Heading level adjustment specified'),
        expect.any(Object)
      );
      expect(result.replacement?.[0]?.content).toBe(fixture.expected);
    });
    
    it('should handle underHeader option', async () => {
      const fixture = fixtureLoader.getFixture('add-path');
      if (!fixture) throw new Error('Fixture not found');
      const addNode = fixture.ast[0] as AddDirectiveNode;
      // Add underHeader option
      (addNode.values as any).options = { underHeader: 'My Header' };
      
      // Set up mocks
      vi.mocked(resolutionServiceMock.resolveInContext).mockResolvedValue('file.md');
      vi.mocked(resolutionServiceMock.resolvePath).mockResolvedValue({
        validatedPath: '/test/file.md',
        contentType: PathContentType.File,
        caseDetails: {}
      } as MeldPath);
      vi.mocked(fileSystemServiceMock.exists).mockResolvedValue(true);
      vi.mocked(fileSystemServiceMock.readFile).mockResolvedValue(fixture.expected);
      vi.mocked(stateServiceMock.getCurrentFilePath).mockReturnValue('/test/current.md');
      
      const mockContext: DirectiveProcessingContext = {
        directiveNode: addNode,
        state: stateServiceMock,
        resolutionContext: {} as ResolutionContext,
        executionContext: {},
        formattingContext: undefined
      };
      
      const result = await handler.handle(mockContext);
      
      // Handler should log warning about unsupported under header
      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.stringContaining('Under-header wrapping specified'),
        expect.any(Object)
      );
      expect(result.replacement?.[0]?.content).toBe(fixture.expected);
    });
  });
  
  describe('formatting context', () => {
    it('should preserve formatting context when creating replacement node', async () => {
      const fixture = fixtureLoader.getFixture('add-path');
      if (!fixture) throw new Error('Fixture not found');
      const addNode = fixture.ast[0] as AddDirectiveNode;
      
      // Set up mocks
      vi.mocked(resolutionServiceMock.resolveInContext).mockResolvedValue('file.md');
      vi.mocked(resolutionServiceMock.resolvePath).mockResolvedValue({
        validatedPath: '/test/file.md',
        contentType: PathContentType.File,
        caseDetails: {}
      } as MeldPath);
      vi.mocked(fileSystemServiceMock.exists).mockResolvedValue(true);
      vi.mocked(fileSystemServiceMock.readFile).mockResolvedValue(fixture.expected);
      vi.mocked(stateServiceMock.getCurrentFilePath).mockReturnValue('/test/current.md');
      
      const mockContext: DirectiveProcessingContext = {
        directiveNode: addNode,
        state: stateServiceMock,
        resolutionContext: {} as ResolutionContext,
        executionContext: {},
        formattingContext: {
          contextType: 'directive',
          nodeType: 'add',
          parentContext: undefined
        }
      };
      
      const result = await handler.handle(mockContext);
      
      expect(result.replacement).toBeDefined();
      const replacementNode = result.replacement?.[0];
      expect(replacementNode?.formattingMetadata).toMatchObject({
        isFromDirective: true,
        originalNodeType: 'Directive',
        preserveFormatting: true,
        contextType: 'directive',
        isOutputLiteral: true,
        nodeType: 'add'
      });
    });
  });
});