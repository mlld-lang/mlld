import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DirectiveNode, MeldNode } from '@core/syntax/types';
import { EmbedDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/EmbedDirectiveHandler';
import { DirectiveError } from '@services/pipeline/DirectiveService/errors/DirectiveError';
import { MeldFileNotFoundError } from '@core/errors/MeldFileNotFoundError';

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
  isTransformationEnabled: vi.fn()
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
      getAllTextVars: vi.fn().mockReturnValue({ 'testVar': 'testValue' }),
      getAllDataVars: vi.fn().mockReturnValue({ 'dataVar': { test: 'data' } }),
      getAllPathVars: vi.fn().mockReturnValue({ 'pathVar': '/test/path' }),
      getAllCommands: vi.fn().mockReturnValue({ 'cmdVar': 'echo test' }),
      isTransformationEnabled: vi.fn().mockReturnValue(false)
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
      // Create directive node with a path
      const node = createEmbedDirectiveNode('missing.md');
      const context = { currentFilePath: 'test.meld', state: mockStateService };

      // Setup mock to say file doesn't exist
      mockResolutionService.resolveInContext.mockResolvedValue('missing.md');
      mockFileSystemService.exists.mockResolvedValue(false);
      
      // Execute and expect error
      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
      
      // Verify service calls
      expect(mockResolutionService.resolveInContext).toHaveBeenCalledWith('missing.md', expect.anything());
      expect(mockFileSystemService.exists).toHaveBeenCalledWith('missing.md');
      
      // File system services should never be called for reading
      expect(mockFileSystemService.readFile).not.toHaveBeenCalled();
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

      // Execute
      await handler.execute(node, context);
      
      // Verify that exists was called before readFile
      expect(mockFileSystemService.exists).toHaveBeenCalledWith('test.md');
      expect(mockFileSystemService.readFile).toHaveBeenCalledWith('test.md');
      
      // Verify that parse is NOT called - embedded content should be treated as literal text
      expect(mockParserService.parse).not.toHaveBeenCalled();
      expect(mockInterpreterService.interpret).not.toHaveBeenCalled();
    });
  });

  describe('Variable Reference Handling', () => {
    it('should handle variable references without calling file system operations', async () => {
      // Create a variable reference directive node
      const variableNode = {
        type: 'Directive',
        directive: {
          kind: 'embed',
          path: {
            raw: '{{role.architect}}',
            isVariableReference: true,
            variable: {
              type: 'VariableReference',
              identifier: 'role',
              valueType: 'data',
              isVariableReference: true,
              fields: [{
                type: 'field',
                value: 'architect'
              }]
            }
          }
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 20 }
        }
      } as DirectiveNode;

      const context = { currentFilePath: 'test.meld', state: mockStateService };

      // Setup mocks
      mockResolutionService.resolveInContext.mockResolvedValue(
        'You are a senior architect skilled in assessing TypeScript codebases.'
      );

      // Execute
      const result = await handler.execute(variableNode, context);
      
      // Verify variable content was used directly
      expect(mockResolutionService.resolveInContext).toHaveBeenCalled();
      
      // Content should be treated as literal text - no parsing
      expect(mockParserService.parse).not.toHaveBeenCalled();
      
      // Verify file system was not used
      expect(mockFileSystemService.exists).not.toHaveBeenCalled();
      expect(mockFileSystemService.readFile).not.toHaveBeenCalled();
      
      // Verify circularity service was not used
      expect(mockCircularityService.beginImport).not.toHaveBeenCalled();
      expect(mockCircularityService.endImport).not.toHaveBeenCalled();
      
      // In transformation mode, we should get a replacement node
      if (result.replacement) {
        expect(result.replacement).toEqual({
          type: 'Text',
          content: 'You are a senior architect skilled in assessing TypeScript codebases.',
          location: variableNode.location,
          formattingMetadata: {
            isFromDirective: true,
            originalNodeType: 'Directive',
            preserveFormatting: true
          }
        });
      }
    });

    it('should distinguish between variable references and file paths', async () => {
      // Create a regular file path directive
      const fileNode = createEmbedDirectiveNode('test.md');
      
      // Create a variable reference directive
      const variableNode = {
        type: 'Directive',
        directive: {
          kind: 'embed',
          path: {
            raw: '{{content}}',
            isVariableReference: true,
            variable: {
              type: 'VariableReference',
              identifier: 'content',
              valueType: 'text',
              isVariableReference: true
            }
          }
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 20 }
        }
      } as DirectiveNode;

      const context = { currentFilePath: 'test.meld', state: mockStateService };

      // Setup different resolutions based on path type
      mockResolutionService.resolveInContext.mockImplementation((path) => {
        if (typeof path === 'string') {
          return Promise.resolve('test.md');
        } else if (path?.isVariableReference) {
          return Promise.resolve('Variable Content');
        }
        return Promise.resolve('');
      });
      
      mockFileSystemService.exists.mockResolvedValue(true);
      mockFileSystemService.readFile.mockResolvedValue('File Content');

      // Execute both directives
      const fileResult = await handler.execute(fileNode, context);
      const varResult = await handler.execute(variableNode, context);
      
      // Verify different behavior for the two types
      // File path: Should use file system
      expect(mockFileSystemService.exists).toHaveBeenCalledTimes(1);
      expect(mockFileSystemService.readFile).toHaveBeenCalledTimes(1);
      expect(mockCircularityService.beginImport).toHaveBeenCalledTimes(1);
      expect(mockCircularityService.endImport).toHaveBeenCalledTimes(1);
      
      // Parser should NOT be called for either - content is treated as literal text
      expect(mockParserService.parse).not.toHaveBeenCalled();
      
      // Both should return replacement nodes with literal content
      expect(fileResult.replacement).toEqual({
        type: 'Text',
        content: 'File Content',
        location: fileNode.location,
        formattingMetadata: {
          isFromDirective: true,
          originalNodeType: 'Directive',
          preserveFormatting: true
        }
      });
      
      expect(varResult.replacement).toEqual({
        type: 'Text',
        content: 'Variable Content',
        location: variableNode.location,
        formattingMetadata: {
          isFromDirective: true,
          originalNodeType: 'Directive',
          preserveFormatting: true
        }
      });
    });
  });
}); 