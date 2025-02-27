// Mock the logger before any imports
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};

vi.mock('../../../../core/utils/logger', () => ({
  embedLogger: mockLogger
}));

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DirectiveNode, DirectiveData, MeldNode } from 'meld-spec';
import { EmbedDirectiveHandler, type ILogger } from './EmbedDirectiveHandler.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { createLocation } from '@tests/utils/testFactories.js';

// Direct usage of meld-ast instead of mock factories
const createRealParserService = () => {
  // Create the parse function
  const parseFunction = async (content: string): Promise<MeldNode[]> => {
    // Use the real meld-ast parser with dynamic import 
    try {
      const { parse } = await import('meld-ast');
      const result = await parse(content, {
        trackLocations: true,
        validateNodes: true,
        // @ts-expect-error - structuredPaths is used but may be missing from typings
        structuredPaths: true
      });
      return result.ast || [];
    } catch (error) {
      console.error('Error parsing with meld-ast:', error);
      throw error;
    }
  };
  
  // Create a spy for the parse function
  const parseSpy = vi.fn(parseFunction);
  
  return {
    parse: parseSpy,
    parseWithLocations: vi.fn(parseFunction)
  };
};

// Helper to create a real embed directive node using meld-ast
const createRealEmbedDirective = async (path: string, section?: string, options: any = {}): Promise<DirectiveNode> => {
  const embedText = `@embed [ path = "${path}"${section ? `, section = "${section}"` : ''}${options.headingLevel ? `, headingLevel = ${options.headingLevel}` : ''}${options.underHeader ? `, underHeader = "${options.underHeader}"` : ''} ]`;
  
  const { parse } = await import('meld-ast');
  const result = await parse(embedText, {
    trackLocations: true,
    validateNodes: true,
    // @ts-expect-error - structuredPaths is used but may be missing from typings
    structuredPaths: true
  });
  
  const nodes = result.ast || [];
  // The first node should be our embed directive
  const directiveNode = nodes[0] as DirectiveNode;
  
  // Ensure properties are explicitly set in the directive
  if (directiveNode.directive) {
    if (section) {
      directiveNode.directive.section = section;
    }
    
    if (options.headingLevel !== undefined) {
      directiveNode.directive.headingLevel = options.headingLevel;
    }
    
    if (options.underHeader) {
      directiveNode.directive.underHeader = options.underHeader;
    }
  }
  
  return directiveNode;
};

interface EmbedDirective extends DirectiveData {
  kind: 'embed';
  path: string | { raw: string; structured?: any; normalized?: string };
  section?: string;
  headingLevel?: number;
  underHeader?: string;
  fuzzy?: number;
  names?: string[];
  items?: string[];
}

describe('EmbedDirectiveHandler', () => {
  let handler: EmbedDirectiveHandler;
  let validationService: IValidationService;
  let resolutionService: IResolutionService;
  let stateService: IStateService;
  let circularityService: ICircularityService;
  let fileSystemService: IFileSystemService;
  let parserService: ReturnType<typeof createRealParserService>;
  let interpreterService: IInterpreterService;
  let clonedState: IStateService;
  let childState: IStateService;

  beforeEach(() => {
    validationService = {
      validate: vi.fn()
    } as unknown as IValidationService;

    childState = {
      setTextVar: vi.fn(),
      setDataVar: vi.fn(),
      setPathVar: vi.fn(),
      setCommand: vi.fn(),
      clone: vi.fn(),
      mergeChildState: vi.fn(),
      isTransformationEnabled: vi.fn().mockReturnValue(false)
    } as unknown as IStateService;

    clonedState = {
      setTextVar: vi.fn(),
      setDataVar: vi.fn(),
      setPathVar: vi.fn(),
      setCommand: vi.fn(),
      createChildState: vi.fn().mockReturnValue(childState),
      mergeChildState: vi.fn(),
      clone: vi.fn(),
      isTransformationEnabled: vi.fn().mockReturnValue(false)
    } as unknown as IStateService;

    stateService = {
      setTextVar: vi.fn(),
      setDataVar: vi.fn(),
      setPathVar: vi.fn(),
      setCommand: vi.fn(),
      clone: vi.fn().mockReturnValue(clonedState),
      createChildState: vi.fn().mockReturnValue(childState),
      isTransformationEnabled: vi.fn().mockReturnValue(false)
    } as unknown as IStateService;

    resolutionService = {
      resolveInContext: vi.fn(),
      extractSection: vi.fn()
    } as unknown as IResolutionService;

    circularityService = {
      beginImport: vi.fn(),
      endImport: vi.fn()
    } as unknown as ICircularityService;

    fileSystemService = {
      exists: vi.fn(),
      readFile: vi.fn(),
      dirname: vi.fn().mockReturnValue('/workspace'),
      join: vi.fn().mockImplementation((...args) => args.join('/')),
      normalize: vi.fn().mockImplementation(path => path)
    } as unknown as IFileSystemService;

    parserService = createRealParserService();

    interpreterService = {
      interpret: vi.fn().mockResolvedValue(childState)
    } as unknown as IInterpreterService;

    handler = new EmbedDirectiveHandler(
      validationService,
      resolutionService,
      stateService,
      circularityService,
      fileSystemService,
      parserService,
      interpreterService,
      mockLogger
    );
  });

  describe('basic embed functionality', () => {
    it('should handle basic embed without modifiers', async () => {
      const node = await createRealEmbedDirective('doc.md');
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('doc.md');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue('Test content');

      const result = await handler.execute(node, context);

      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(stateService.clone).toHaveBeenCalled();
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object)
      );
      expect(fileSystemService.exists).toHaveBeenCalled();
      expect(fileSystemService.readFile).toHaveBeenCalled();
      expect(parserService.parse).toHaveBeenCalledWith('Test content');
      expect(interpreterService.interpret).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          initialState: childState,
          filePath: 'doc.md',
          mergeState: true
        })
      );
      expect(clonedState.mergeChildState).toHaveBeenCalledWith(childState);
      expect(result.state).toBe(clonedState);
    });

    it('should handle embed with section', async () => {
      const node = await createRealEmbedDirective('doc.md', 'Introduction');
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext)
        .mockResolvedValueOnce('doc.md')
        .mockResolvedValueOnce('Introduction');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue('# Content');
      vi.mocked(resolutionService.extractSection).mockResolvedValue('# Introduction\nContent');

      const result = await handler.execute(node, context);

      expect(stateService.clone).toHaveBeenCalled();
      expect(resolutionService.extractSection).toHaveBeenCalledWith(
        '# Content',
        'Introduction',
        undefined
      );
      expect(clonedState.mergeChildState).toHaveBeenCalledWith(childState);
      expect(result.state).toBe(clonedState);
    });

    it('should handle embed with heading level', async () => {
      const node = await createRealEmbedDirective('doc.md', undefined, {
        headingLevel: 2
      });
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('doc.md');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue('Test content');

      const result = await handler.execute(node, context);

      expect(stateService.clone).toHaveBeenCalled();
      expect(clonedState.mergeChildState).toHaveBeenCalledWith(childState);
      expect(result.state).toBe(clonedState);
    });

    it('should handle embed with under header', async () => {
      const node = await createRealEmbedDirective('doc.md', undefined, {
        underHeader: 'My Header'
      });
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('doc.md');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue('Test content');

      const result = await handler.execute(node, context);

      expect(stateService.clone).toHaveBeenCalled();
      expect(clonedState.mergeChildState).toHaveBeenCalledWith(childState);
      expect(result.state).toBe(clonedState);
    });
  });

  describe('error handling', () => {
    it('should handle file not found', async () => {
      const node = await createRealEmbedDirective('missing.meld');
      const context = {
        currentFilePath: 'test.meld',
        state: stateService,
        parentState: undefined
      };

      vi.mocked(fileSystemService.exists).mockResolvedValue(false);

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
      expect(circularityService.endImport).toHaveBeenCalled();
    });

    it('should handle invalid heading level', async () => {
      const node = await createRealEmbedDirective('test.meld', undefined, {
        headingLevel: 7 // invalid level
      });
      const context = {
        currentFilePath: 'test.meld',
        state: stateService,
        parentState: undefined
      };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('test.meld');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue('Test content');

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
      expect(circularityService.endImport).toHaveBeenCalled();
    });

    it('should handle section extraction errors', async () => {
      const node = await createRealEmbedDirective('test.meld', 'missing');
      const context = {
        currentFilePath: 'test.meld',
        state: stateService,
        parentState: undefined
      };

      vi.mocked(resolutionService.resolveInContext)
        .mockResolvedValueOnce('test.meld')
        .mockResolvedValueOnce('missing');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue('# Content');
      vi.mocked(resolutionService.extractSection).mockRejectedValue(
        new Error('Section not found')
      );

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
      expect(circularityService.endImport).toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should always end import tracking', async () => {
      const node = await createRealEmbedDirective('content.md');
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('content.md');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue('content');

      await handler.execute(node, context);
      expect(circularityService.endImport).toHaveBeenCalled();
    });

    it('should end import tracking even on error', async () => {
      const node = await createRealEmbedDirective('error.md');
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('error.md');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockRejectedValue(new Error('Some error'));

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
      expect(circularityService.endImport).toHaveBeenCalled();
    });
  });
}); 