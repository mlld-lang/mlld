import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DirectiveNode } from 'meld-spec';
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
  isTransformationEnabled: vi.fn().mockReturnValue(false)
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

describe('EmbedDirectiveHandler Fixes', () => {
  let handler: EmbedDirectiveHandler;
  let clonedState: any;
  let childState: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Setup mock states
    childState = {
      setTextVar: vi.fn(),
      setDataVar: vi.fn(),
      setPathVar: vi.fn(),
      setCommand: vi.fn(),
      getAllTextVars: vi.fn().mockReturnValue({}),
      getAllDataVars: vi.fn().mockReturnValue({}),
      getAllPathVars: vi.fn().mockReturnValue({}),
      getAllCommands: vi.fn().mockReturnValue({})
    };

    clonedState = {
      setTextVar: vi.fn(),
      setDataVar: vi.fn(),
      setPathVar: vi.fn(),
      setCommand: vi.fn(),
      createChildState: vi.fn().mockReturnValue(childState),
      mergeChildState: vi.fn(),
      isTransformationEnabled: vi.fn().mockReturnValue(false)
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

  describe('Error Handling', () => {
    it('should throw DirectiveError when path is missing', async () => {
      // Create a directive node without a path
      const node = createEmbedDirectiveNode();
      const context = { currentFilePath: 'test.meld', state: mockStateService };

      // Execute and expect error
      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
      // The error is thrown directly, not logged
    });

    it('should throw DirectiveError when file does not exist', async () => {
      // Create a directive node with a path
      const node = createEmbedDirectiveNode('nonexistent.md');
      const context = { currentFilePath: 'test.meld', state: mockStateService };

      // Setup mocks
      mockResolutionService.resolveInContext.mockResolvedValue('nonexistent.md');
      mockFileSystemService.exists.mockResolvedValue(false);

      // Execute and expect error
      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
      await expect(handler.execute(node, context)).rejects.toThrow(/File not found/);
      expect(mockCircularityService.beginImport).toHaveBeenCalledWith('nonexistent.md');
      expect(mockFileSystemService.exists).toHaveBeenCalledWith('nonexistent.md');
    });

    it('should wrap non-DirectiveError exceptions in DirectiveError', async () => {
      // Create a directive node with a path
      const node = createEmbedDirectiveNode('test.md');
      const context = { currentFilePath: 'test.meld', state: mockStateService };

      // Setup mocks
      mockResolutionService.resolveInContext.mockResolvedValue('test.md');
      mockFileSystemService.exists.mockResolvedValue(true);
      mockFileSystemService.readFile.mockRejectedValue(new Error('Generic error'));

      // Execute and expect error
      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('Circular Dependency Tracking', () => {
    it('should always call endImport even if an error occurs', async () => {
      // Create a directive node with a path
      const node = createEmbedDirectiveNode('test.md');
      const context = { currentFilePath: 'test.meld', state: mockStateService };

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

    it('should handle errors in endImport gracefully', async () => {
      // Create a directive node with a path
      const node = createEmbedDirectiveNode('test.md');
      const context = { currentFilePath: 'test.meld', state: mockStateService };

      // Setup mocks
      mockResolutionService.resolveInContext.mockResolvedValue('test.md');
      mockFileSystemService.exists.mockResolvedValue(true);
      mockFileSystemService.readFile.mockResolvedValue('Test content');
      mockParserService.parse.mockResolvedValue([]);
      mockCircularityService.endImport.mockImplementation(() => {
        throw new Error('End import error');
      });

      // Execute and expect success despite endImport error
      const result = await handler.execute(node, context);
      
      // Verify that endImport was called and error was logged
      expect(mockCircularityService.endImport).toHaveBeenCalledWith('test.md');
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Error ending import tracking'),
        expect.any(Object)
      );
      
      // Verify that the operation completed successfully
      expect(result.state).toBe(clonedState);
    });

    it('should handle undefined resolvedPath in finally block', async () => {
      // Create a directive node without a path to trigger early error
      const node = createEmbedDirectiveNode();
      const context = { currentFilePath: 'test.meld', state: mockStateService };

      // Execute and expect error
      await expect(handler.execute(node, context)).rejects.toThrow();
      
      // Verify that endImport was not called (since resolvedPath was never defined)
      expect(mockCircularityService.endImport).not.toHaveBeenCalled();
    });
  });

  describe('File Existence Check', () => {
    it('should check if file exists before reading', async () => {
      // Create a directive node with a path
      const node = createEmbedDirectiveNode('test.md');
      const context = { currentFilePath: 'test.meld', state: mockStateService };

      // Setup mocks
      mockResolutionService.resolveInContext.mockResolvedValue('test.md');
      mockFileSystemService.exists.mockResolvedValue(true);
      mockFileSystemService.readFile.mockResolvedValue('Test content');
      mockParserService.parse.mockResolvedValue([]);

      // Execute
      await handler.execute(node, context);
      
      // Verify that exists was called before readFile
      expect(mockFileSystemService.exists).toHaveBeenCalledWith('test.md');
      expect(mockFileSystemService.readFile).toHaveBeenCalledWith('test.md');
    });
  });
}); 