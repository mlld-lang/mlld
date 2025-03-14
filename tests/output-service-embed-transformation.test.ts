import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OutputService } from '@services/pipeline/OutputService/OutputService.js';
import { DirectiveNode, TextNode, MeldNode } from '@core/syntax/types.js';

// Mock dependency for IStateService
const createMockState = (transformationEnabled = false, transformedNodes: MeldNode[] = []) => {
  return {
    getAllTextVars: vi.fn().mockReturnValue(new Map()),
    getAllDataVars: vi.fn().mockReturnValue(new Map()),
    getTextVar: vi.fn(),
    getDataVar: vi.fn(),
    isTransformationEnabled: vi.fn().mockReturnValue(transformationEnabled),
    getTransformedNodes: vi.fn().mockReturnValue(transformedNodes),
    transformNode: vi.fn(),
    shouldTransform: vi.fn().mockReturnValue(true),
    getTransformationOptions: vi.fn().mockReturnValue({})
  };
};

// Mock dependency for IResolutionService
const createMockResolutionService = () => {
  return {
    resolveInContext: vi.fn(),
    resolveText: vi.fn((text) => Promise.resolve(text)),
    resolveDataVariable: vi.fn(),
    resolvePathVariable: vi.fn(),
    extractSection: vi.fn()
  };
};

describe('OutputService Embed Transformation Bug Fix', () => {
  let outputService: OutputService;
  let mockState: any;
  let mockResolutionService: any;

  beforeEach(() => {
    vi.resetAllMocks();
    outputService = new OutputService();
    mockResolutionService = createMockResolutionService();
    mockState = createMockState();
    outputService.initialize(mockState, mockResolutionService);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Embed Directive Processing', () => {
    // Test case 1: Basic transformation should work
    it('should replace embed directive with transformed content when exact line match exists', async () => {
      // Setup mock state with transformation enabled
      const transformedState = createMockState(true, [
        {
          type: 'Text',
          content: 'Embedded content from file',
          location: {
            start: { line: 5, column: 1 },
            end: { line: 5, column: 30 }
          }
        } as TextNode
      ]);

      outputService.initialize(transformedState);

      // Create a directive node that matches the transformed node's line number
      const embedDirective: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'embed',
          path: 'file.md'
        },
        location: {
          start: { line: 5, column: 1 },
          end: { line: 5, column: 20 }
        }
      };

      // Convert the node to markdown with nodeToMarkdown to test just the directive handling
      const result = await outputService.nodeToMarkdown(embedDirective, transformedState);

      // Verify the output contains the embedded content, not a placeholder
      expect(result.trim()).toBe('Embedded content from file');
      expect(result).not.toContain('[directive output placeholder]');
    });
    
    // Test case 2: The bug scenario - line numbers don't match exactly
    it('should replace embed directive with transformed content even when line numbers differ slightly', async () => {
      // Setup transformed node with a DIFFERENT line number than the original directive
      const transformedState = createMockState(true, [
        {
          type: 'Text',
          content: 'Embedded content from file',
          location: {
            start: { line: 6, column: 1 }, // Note: line 6 instead of line 5
            end: { line: 6, column: 30 }
          }
        } as TextNode
      ]);

      outputService.initialize(transformedState);

      // Create a directive node at line 5
      const embedDirective: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'embed',
          path: 'file.md'
        },
        location: {
          start: { line: 5, column: 1 },
          end: { line: 5, column: 20 }
        }
      };

      // Test the nodeToMarkdown method directly
      const result = await outputService.nodeToMarkdown(embedDirective, transformedState);

      // With our fix, this should now find the closest node (line 6) even though it's not an exact match
      expect(result.trim()).toBe('Embedded content from file');
      expect(result).not.toContain('[directive output placeholder]');
    });

    // Test case 3: Multiple transformed nodes, should find the closest matching one
    it('should find the closest transformed node when multiple exist', async () => {
      // Setup multiple transformed nodes - these are what would be in the state's transformed nodes
      const transformedState = createMockState(true, [
        {
          type: 'Text',
          content: 'Wrong content from line 2',
          location: {
            start: { line: 2, column: 1 },
            end: { line: 2, column: 30 }
          }
        } as TextNode,
        {
          type: 'Text',
          content: 'Correct embedded content',
          location: {
            start: { line: 6, column: 1 }, // Close to original line 5
            end: { line: 6, column: 30 }
          }
        } as TextNode,
        {
          type: 'Text',
          content: 'Wrong content from line 10',
          location: {
            start: { line: 10, column: 1 },
            end: { line: 10, column: 30 }
          }
        } as TextNode
      ]);

      outputService.initialize(transformedState);

      // Create a directive node at line 5 - this is what we'll process 
      // (in reality, we wouldn't process the Text nodes directly, they're just in the transformed nodes array)
      const embedDirective: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'embed',
          path: 'file.md'
        },
        location: {
          start: { line: 5, column: 1 },
          end: { line: 5, column: 20 }
        }
      };

      // IMPORTANT: We only convert the directive node, not all the transformed nodes
      // This is because in the real code, we iterate through the original nodes
      // and look up their transformed versions
      const result = await outputService.nodeToMarkdown(embedDirective, transformedState);

      // Should match with the closest node (line 6)
      expect(result.trim()).toBe('Correct embedded content');
      expect(result).not.toContain('[directive output placeholder]');
      expect(result).not.toContain('Wrong content from line 2');
      expect(result).not.toContain('Wrong content from line 10');
    });

    // Test case 4: Run directive for comparison (currently works correctly)
    it('should properly transform run directives (for comparison with embed)', async () => {
      // Setup mock state with transformation enabled and a transformed run directive
      const transformedState = createMockState(true, [
        {
          type: 'Text',
          content: 'Output from run command',
          location: {
            start: { line: 5, column: 1 },
            end: { line: 5, column: 30 }
          }
        } as TextNode
      ]);

      outputService.initialize(transformedState);

      // Create a run directive node
      const runDirective: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'run',
          command: 'echo "test"'
        },
        location: {
          start: { line: 5, column: 1 },
          end: { line: 5, column: 20 }
        }
      };

      // Test the nodeToMarkdown method directly
      const result = await outputService.nodeToMarkdown(runDirective, transformedState);

      // Verify the output contains the command output, not a placeholder
      expect(result.trim()).toBe('Output from run command');
      expect(result).not.toContain('[run directive output placeholder]');
    });

    // Test case 5: For completeness - non-transformation mode still returns placeholder
    it('should return placeholder in non-transformation mode', async () => {
      // Setup mock state with transformation disabled
      const nonTransformedState = createMockState(false);
      outputService.initialize(nonTransformedState);

      // Create a directive node
      const embedDirective: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'embed',
          path: 'file.md'
        },
        location: {
          start: { line: 5, column: 1 },
          end: { line: 5, column: 20 }
        }
      };

      // Test the nodeToMarkdown method directly
      const result = await outputService.nodeToMarkdown(embedDirective, nonTransformedState);

      // Verify the output contains the placeholder
      expect(result.trim()).toBe('[directive output placeholder]');
    });
  });
});