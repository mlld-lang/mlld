import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DirectiveNode, TextNode } from 'meld-spec';
import { EmbedDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/EmbedDirectiveHandler.js';
import { DirectiveError } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';

// Mock dependencies
const mockValidationService = {
  validate: vi.fn()
};

const mockResolutionService = {
  resolveInContext: vi.fn(),
  extractSection: vi.fn()
};

const mockStateService = {
  clone: vi.fn(),
  createChildState: vi.fn(),
  mergeChildState: vi.fn(),
  isTransformationEnabled: vi.fn().mockReturnValue(true) // Transformation mode enabled
};

const mockCircularityService = {
  beginImport: vi.fn(),
  endImport: vi.fn(),
  isInStack: vi.fn()
};

const mockFileSystemService = {
  exists: vi.fn(),
  readFile: vi.fn()
};

const mockParserService = {
  parse: vi.fn()
};

const mockInterpreterService = {
  interpret: vi.fn()
};

const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};

// Helper to create a directive node
function createEmbedDirectiveNode(path?: string): DirectiveNode {
  return {
    type: 'Directive',
    directive: {
      kind: 'embed',
      path: path
    },
    location: {
      start: { line: 1, column: 1 },
      end: { line: 1, column: 20 }
    }
  } as DirectiveNode;
}

describe('EmbedDirectiveHandler Transformation Fixes', () => {
  let handler: EmbedDirectiveHandler;
  let clonedState: any;
  let childState: any;
  let parentState: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Setup mock states
    childState = {
      setTextVar: vi.fn(),
      setDataVar: vi.fn(),
      setPathVar: vi.fn(),
      setCommand: vi.fn(),
      getAllTextVars: vi.fn().mockReturnValue({ 'testVar': 'testValue' }),
      getAllDataVars: vi.fn().mockReturnValue({ 'dataVar': { test: 'data' } }),
      getAllPathVars: vi.fn().mockReturnValue({ 'pathVar': '/test/path' }),
      getAllCommands: vi.fn().mockReturnValue({ 'cmdVar': 'echo test' }),
      isTransformationEnabled: vi.fn().mockReturnValue(true)
    };

    clonedState = {
      setTextVar: vi.fn(),
      setDataVar: vi.fn(),
      setPathVar: vi.fn(),
      setCommand: vi.fn(),
      createChildState: vi.fn().mockReturnValue(childState),
      mergeChildState: vi.fn(),
      isTransformationEnabled: vi.fn().mockReturnValue(true)
    };

    parentState = {
      setTextVar: vi.fn(),
      setDataVar: vi.fn(),
      setPathVar: vi.fn(),
      setCommand: vi.fn()
    };

    mockStateService.clone.mockReturnValue(clonedState);
    mockStateService.createChildState.mockReturnValue(childState);
    mockInterpreterService.interpret.mockResolvedValue(childState);

    // Create handler
    handler = new EmbedDirectiveHandler(
      mockValidationService as any,
      mockResolutionService as any,
      mockStateService as any,
      mockCircularityService as any,
      mockFileSystemService as any,
      mockParserService as any,
      mockInterpreterService as any,
      mockLogger as any
    );
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Transformation Mode', () => {
    it('should return a replacement node with file content', async () => {
      // Create a directive node with a path
      const node = createEmbedDirectiveNode('test.md');
      const context = { 
        currentFilePath: 'test.meld', 
        state: mockStateService,
        parentState: parentState // Use the properly defined parent state
      };

      // Setup mocks
      mockResolutionService.resolveInContext.mockResolvedValue('test.md');
      mockFileSystemService.exists.mockResolvedValue(true);
      mockFileSystemService.readFile.mockResolvedValue('Test content');
      mockParserService.parse.mockResolvedValue([]);

      // Execute
      const result = await handler.execute(node, context);
      
      // Verify replacement node
      expect(result.replacement).toBeDefined();
      expect((result.replacement as TextNode).type).toBe('Text');
      expect((result.replacement as TextNode).content).toBe('Test content');
    });

    it('should propagate variables to parent state in transformation mode', async () => {
      // Create a directive node with a path
      const node = createEmbedDirectiveNode('test.md');
      const context = { 
        currentFilePath: 'test.meld', 
        state: mockStateService,
        parentState: parentState
      };

      // Setup mocks
      mockResolutionService.resolveInContext.mockResolvedValue('test.md');
      mockFileSystemService.exists.mockResolvedValue(true);
      mockFileSystemService.readFile.mockResolvedValue('Test content');
      mockParserService.parse.mockResolvedValue([]);

      // Execute
      await handler.execute(node, context);
      
      // Verify variables were propagated to parent state
      expect(parentState.setTextVar).toHaveBeenCalledWith('testVar', 'testValue');
      expect(parentState.setDataVar).toHaveBeenCalledWith('dataVar', { test: 'data' });
      expect(parentState.setPathVar).toHaveBeenCalledWith('pathVar', '/test/path');
      expect(parentState.setCommand).toHaveBeenCalledWith('cmdVar', 'echo test');
    });
  });

  describe('Error Handling in Transformation Mode', () => {
    it('should throw DirectiveError when file does not exist', async () => {
      // Create a directive node with a path
      const node = createEmbedDirectiveNode('nonexistent.md');
      const context = { 
        currentFilePath: 'test.meld', 
        state: mockStateService,
        parentState: parentState
      };

      // Setup mocks
      mockResolutionService.resolveInContext.mockResolvedValue('nonexistent.md');
      mockFileSystemService.exists.mockResolvedValue(false);

      // Execute and expect error
      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
      await expect(handler.execute(node, context)).rejects.toThrow(/File not found/);
    });

    it('should always call endImport even if an error occurs in transformation mode', async () => {
      // Create a directive node with a path
      const node = createEmbedDirectiveNode('test.md');
      const context = { 
        currentFilePath: 'test.meld', 
        state: mockStateService,
        parentState: parentState
      };

      // Setup mocks
      mockResolutionService.resolveInContext.mockResolvedValue('test.md');
      mockFileSystemService.exists.mockResolvedValue(true);
      mockFileSystemService.readFile.mockRejectedValue(new Error('Read error'));

      // Execute and expect error
      await expect(handler.execute(node, context)).rejects.toThrow();
      
      // Verify that endImport was called
      expect(mockCircularityService.beginImport).toHaveBeenCalledWith('test.md');
      expect(mockCircularityService.endImport).toHaveBeenCalledWith('test.md');
    });
  });
}); 