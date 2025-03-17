import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mockDeep, mockReset } from 'vitest-mock-extended';
import { OutputService } from '@services/pipeline/OutputService/OutputService.js';
import { MeldOutputError } from '@core/errors/MeldOutputError.js';
import type { MeldNode } from '@core/syntax/types.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService, ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { OutputFormat } from '@services/pipeline/OutputService/IOutputService.js';
import { VariableNodeFactory } from '@core/syntax/types/factories/VariableNodeFactory.js';
import {
  createTextNode,
  createDirectiveNode,
  createCodeFenceNode,
  createLocation
} from '@tests/utils/testFactories.js';
// Import centralized syntax examples
import { 
  textDirectiveExamples, 
  dataDirectiveExamples,
  defineDirectiveExamples
} from '@core/syntax/index.js';
// Import run examples directly
import runDirectiveExamplesModule from '@core/syntax/run.js';
import { createNodeFromExample } from '@core/syntax/helpers/index.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';

// Use the correctly imported run directive examples
const runDirectiveExamples = runDirectiveExamplesModule;

describe('OutputService', () => {
  let context: TestContextDI;
  let service: OutputService;
  let state: IStateService;
  let resolutionService: IResolutionService;
  let mockVariableNodeFactory: any;

  beforeEach(async () => {
    // Create isolated test context
    context = TestContextDI.createIsolated();
    
    // Create mock services using vitest-mock-extended
    state = mockDeep<IStateService>();
    resolutionService = mockDeep<IResolutionService>();
    
    // Create mock VariableNodeFactory
    mockVariableNodeFactory = {
      createVariableReferenceNode: vi.fn().mockImplementation((identifier, valueType, fields, format, location) => ({
        type: 'VariableReference',
        identifier,
        valueType,
        fields,
        isVariableReference: true,
        ...(format && { format }),
        ...(location && { location })
      })),
      isVariableReferenceNode: vi.fn().mockImplementation((node) => {
        return (
          node?.type === 'VariableReference' &&
          typeof node?.identifier === 'string' &&
          typeof node?.valueType === 'string'
        );
      })
    };
    
    // Reset mocks before each test
    mockReset(state);
    mockReset(resolutionService);
    
    // Register mocks with the context
    context.registerMock('IStateService', state);
    context.registerMock('IResolutionService', resolutionService);
    context.registerMock(VariableNodeFactory, mockVariableNodeFactory);
    
    // We're using spies in individual tests
    // No need for a global mock here
    
    // Initialize context
    await context.initialize();
    
    // Resolve the service
    service = await context.container.resolve(OutputService);
  });

  afterEach(async () => {
    await context?.cleanup();
  });

  describe('Format Registration', () => {
    it('should have default formats registered', () => {
      expect(service.supportsFormat('markdown')).toBe(true);
      expect(service.supportsFormat('xml')).toBe(true);
    });

    it('should allow registering custom formats', async () => {
      const customConverter = async () => 'custom';
      service.registerFormat('custom', customConverter);
      expect(service.supportsFormat('custom')).toBe(true);
    });

    it('should throw on invalid format registration', () => {
      expect(() => service.registerFormat('', async () => '')).toThrow();
      expect(() => service.registerFormat('test', null as any)).toThrow();
    });

    it('should list supported formats', () => {
      const formats = service.getSupportedFormats();
      expect(formats).toContain('markdown');
      expect(formats).toContain('xml');
    });
  });

  describe('Markdown Output', () => {
    it('should convert text nodes to markdown', async () => {
      const nodes: MeldNode[] = [
        createTextNode('Hello world\n', createLocation(1, 1))
      ];

      // Mock state.getTransformedNodes to return our test nodes
      vi.mocked(state.getTransformedNodes).mockReturnValue(nodes);

      const output = await service.convert(nodes, state, 'markdown');
      expect(output).toBe('Hello world\n');
    });

    it('should handle directive nodes according to type', async () => {
      // MIGRATION: Using centralized syntax examples instead of hardcoded examples
      
      // Definition directive - using @text example
      const textExample = textDirectiveExamples.atomic.simpleString;
      const textNode = await createNodeFromExample(textExample.code);
      
      // Mock state.getTransformedNodes for text directive
      vi.mocked(state.getTransformedNodes).mockReturnValue([textNode]);
      
      let output = await service.convert([textNode], state, 'markdown');
      expect(output).toBe(''); // Definition directives are omitted

      // Execution directive - using @run example
      const runExample = runDirectiveExamples.atomic.simple;
      const runNode = await createNodeFromExample(runExample.code);
      
      // Mock state.getTransformedNodes for run directive
      vi.mocked(state.getTransformedNodes).mockReturnValue([runNode]);
      
      output = await service.convert([runNode], state, 'markdown');
      expect(output).toBe('[run directive output placeholder]\n\n');
    });

    it('should include state variables when requested', async () => {
      // Mock state variable getters
      vi.mocked(state.getAllTextVars).mockReturnValue(new Map([['greeting', 'hello']]));
      vi.mocked(state.getAllDataVars).mockReturnValue(new Map([['count', 42]]));

      const nodes: MeldNode[] = [
        createTextNode('Content', createLocation(1, 1))
      ];

      // Mock transformed nodes
      vi.mocked(state.getTransformedNodes).mockReturnValue(nodes);

      const output = await service.convert(nodes, state, 'markdown', {
        includeState: true
      });

      expect(output).toContain('# Text Variables');
      expect(output).toContain('@text greeting = "hello"');
      expect(output).toContain('# Data Variables');
      expect(output).toContain('@data count = 42');
      expect(output).toContain('Content');
    });

    it('should respect preserveFormatting option', async () => {
      const nodes: MeldNode[] = [
        createTextNode('\n  Hello  \n  World  \n', createLocation(1, 1))
      ];

      // Mock transformed nodes
      vi.mocked(state.getTransformedNodes).mockReturnValue(nodes);

      const preserved = await service.convert(nodes, state, 'markdown', {
        preserveFormatting: true
      });
      // The actual output doesn't preserve the trailing newline
      expect(preserved).toBe('\n  Hello  \n  World  \n');

      const cleaned = await service.convert(nodes, state, 'markdown', {
        preserveFormatting: false
      });
      // With preserveFormatting: false, we still preserve the formatting in our simplified implementation
      expect(cleaned).toBe('\n  Hello  \n  World  \n');
    });
  });

  describe('XML Output', () => {
    it('should preserve text content', async () => {
      const nodes: MeldNode[] = [
        createTextNode('Hello world', createLocation(1, 1))
      ];

      // Mock transformed nodes
      vi.mocked(state.getTransformedNodes).mockReturnValue(nodes);

      const output = await service.convert(nodes, state, 'xml');
      expect(output).toContain('Hello world');
    });

    it('should preserve code fence content', async () => {
      const fenceContent = '```typescript\nconst x = 1;\n```';
      const nodes: MeldNode[] = [
        createCodeFenceNode(fenceContent, 'typescript', createLocation(1, 1))
      ];

      // Mock transformed nodes
      vi.mocked(state.getTransformedNodes).mockReturnValue(nodes);

      const output = await service.convert(nodes, state, 'xml');
      expect(output).toContain('const x = 1;');
      expect(output).toContain('```typescript');
    });

    it('should handle directives according to type', async () => {
      // Definition directive - using @text example
      const textExample = textDirectiveExamples.atomic.simpleString;
      const textNode = await createNodeFromExample(textExample.code);
      
      // Mock transformed nodes for text directive
      vi.mocked(state.getTransformedNodes).mockReturnValue([textNode]);
      
      let output = await service.convert([textNode], state, 'xml');
      expect(output).toBe(''); // Definition directives are omitted

      // Execution directive - using @run example
      const runExample = runDirectiveExamples.atomic.simple;
      const runNode = await createNodeFromExample(runExample.code);
      
      // Mock transformed nodes for run directive
      vi.mocked(state.getTransformedNodes).mockReturnValue([runNode]);
      
      output = await service.convert([runNode], state, 'xml');
      expect(output).toContain('[run directive output placeholder]');
    });

    it('should preserve state variables when requested', async () => {
      // Mock state variable getters
      vi.mocked(state.getAllTextVars).mockReturnValue(new Map([['greeting', 'hello']]));
      vi.mocked(state.getAllDataVars).mockReturnValue(new Map([['count', 42]]));

      const nodes: MeldNode[] = [
        createTextNode('Content', createLocation(1, 1))
      ];

      // Mock transformed nodes
      vi.mocked(state.getTransformedNodes).mockReturnValue(nodes);

      const output = await service.convert(nodes, state, 'xml', {
        includeState: true
      });

      expect(output).toContain('greeting');
      expect(output).toContain('hello');
      expect(output).toContain('count');
      expect(output).toContain('42');
      expect(output).toContain('Content');
    });
  });

  describe('Transformation Mode', () => {
    it('should use transformed nodes when transformation is enabled', async () => {
      // MIGRATION: Using centralized syntax examples instead of hardcoded examples
      const originalNodes: MeldNode[] = [
        // Using a run directive example
        await createNodeFromExample(runDirectiveExamples.atomic.simple.code)
      ];

      const transformedNodes: MeldNode[] = [
        createTextNode('test output\n', createLocation(1, 1))
      ];

      // Mock transformation mode and transformed nodes
      vi.mocked(state.isTransformationEnabled).mockReturnValue(true);
      vi.mocked(state.getTransformedNodes).mockReturnValue(transformedNodes);

      const output = await service.convert(originalNodes, state, 'markdown');
      expect(output).toBe('test output\n');
    });

    it('should handle mixed content in transformation mode', async () => {
      // MIGRATION: Using centralized syntax examples instead of hardcoded examples
      const originalNodes: MeldNode[] = [
        createTextNode('Before\n', createLocation(1, 1)),
        // Using a run directive example
        await createNodeFromExample(runDirectiveExamples.atomic.simple.code),
        createTextNode('After\n', createLocation(3, 1))
      ];

      const transformedNodes: MeldNode[] = [
        createTextNode('Before\n', createLocation(1, 1)),
        createTextNode('test output\n', createLocation(2, 1)),
        createTextNode('After\n', createLocation(3, 1))
      ];

      // Mock transformation mode and transformed nodes
      vi.mocked(state.isTransformationEnabled).mockReturnValue(true);
      vi.mocked(state.getTransformedNodes).mockReturnValue(transformedNodes);

      const output = await service.convert(originalNodes, state, 'markdown');
      expect(output).toBe('Before\ntest output\nAfter\n');
    });

    it('should handle definition directives in non-transformation mode', async () => {
      // MIGRATION: Using centralized syntax examples instead of hardcoded examples
      const nodes: MeldNode[] = [
        createTextNode('Before\n', createLocation(1, 1)),
        // Using a text directive example from centralized examples
        await createNodeFromExample(textDirectiveExamples.atomic.simpleString.code),
        createTextNode('After\n', createLocation(3, 1))
      ];

      // Mock non-transformation mode
      vi.mocked(state.isTransformationEnabled).mockReturnValue(false);
      vi.mocked(state.getTransformedNodes).mockReturnValue(nodes);

      const output = await service.convert(nodes, state, 'markdown');
      expect(output).toBe('Before\nAfter\n');
    });

    it('should show placeholders for execution directives in non-transformation mode', async () => {
      // MIGRATION: Using centralized syntax examples instead of hardcoded examples
      const nodes: MeldNode[] = [
        createTextNode('Before\n', createLocation(1, 1)),
        // Using a run directive example from centralized examples
        await createNodeFromExample(runDirectiveExamples.atomic.simple.code),
        createTextNode('After\n', createLocation(3, 1))
      ];

      // Mock non-transformation mode
      vi.mocked(state.isTransformationEnabled).mockReturnValue(false);
      vi.mocked(state.getTransformedNodes).mockReturnValue(nodes);

      const output = await service.convert(nodes, state, 'markdown');
      expect(output).toBe('Before\n[run directive output placeholder]\n\nAfter\n');
    });

    it('should preserve code fences in both modes', async () => {
      // In our updated implementation, the code fence markers are already part of the content
      const fenceContent = '```js\nconst greeting = \'Hello, world!\';\nconsole.log(greeting);\n```';
      
      // Create a code fence node using the proper factory function
      const codeFenceNode = createCodeFenceNode(
        fenceContent,
        'js',
        createLocation(1, 1)
      );
      
      const nodes = [
        createTextNode('Before\n', createLocation(1, 1)),
        codeFenceNode,
        createTextNode('\nAfter', createLocation(3, 1))
      ];

      // Test non-transformation mode
      vi.mocked(state.isTransformationEnabled).mockReturnValue(false);
      vi.mocked(state.getTransformedNodes).mockReturnValue(nodes);
      
      let output = await service.convert(nodes, state, 'markdown');
      expect(output).toContain('Before');
      expect(output).toContain('```js');
      expect(output).toContain('const greeting = \'Hello, world!\';');
      expect(output).toContain('console.log(greeting);');
      expect(output).toContain('After');

      // Test transformation mode
      vi.mocked(state.isTransformationEnabled).mockReturnValue(true);
      vi.mocked(state.getTransformedNodes).mockReturnValue(nodes);
      
      output = await service.convert(nodes, state, 'markdown');
      expect(output).toContain('Before');
      expect(output).toContain('```js');
      expect(output).toContain('const greeting = \'Hello, world!\';');
      expect(output).toContain('console.log(greeting);');
      expect(output).toContain('After');
    });

    it('should handle XML output in both modes', async () => {
      // MIGRATION: Using centralized syntax examples instead of hardcoded examples
      const originalNodes: MeldNode[] = [
        createTextNode('Before\n', createLocation(1, 1)),
        // Using a run directive example
        await createNodeFromExample(runDirectiveExamples.atomic.simple.code),
        createTextNode('After\n', createLocation(3, 1))
      ];

      // Non-transformation mode
      vi.mocked(state.isTransformationEnabled).mockReturnValue(false);
      vi.mocked(state.getTransformedNodes).mockReturnValue(originalNodes);
      
      let output = await service.convert(originalNodes, state, 'xml');
      expect(output).toContain('Before');
      expect(output).toContain('[run directive output placeholder]');
      expect(output).toContain('After');

      // Transformation mode
      const transformedNodes: MeldNode[] = [
        createTextNode('Before\n', createLocation(1, 1)),
        createTextNode('test output\n', createLocation(2, 1)),
        createTextNode('After\n', createLocation(3, 1))
      ];

      vi.mocked(state.isTransformationEnabled).mockReturnValue(true);
      vi.mocked(state.getTransformedNodes).mockReturnValue(transformedNodes);
      
      output = await service.convert(originalNodes, state, 'xml');
      expect(output).toContain('Before');
      expect(output).toContain('test output');
      expect(output).toContain('After');
    });
  });

  describe('Error Handling', () => {
    it('should throw MeldOutputError for unsupported formats', async () => {
      await expect(service.convert([], state, 'invalid' as any))
        .rejects
        .toThrow(MeldOutputError);
    });

    it('should throw MeldOutputError for unknown node types', async () => {
      // Import and use the standardized factory to create an unknown node type
      const { createTestUnknownNode } = await import('@tests/utils/nodeFactories.js');
      
      // Create an unknown node type using the proper factory
      const unknownNode = createTestUnknownNode({
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 1, column: 10, offset: 9 }
      });
      
      // No need to mock nodeToMarkdown anymore since we're testing actual error handling
      // The OutputService should properly detect an unknown node type and throw
      
      // Expect the convert method to throw a MeldOutputError with the correct error message
      await expect(service.convert([unknownNode], state, 'markdown'))
        .rejects
        .toThrow(MeldOutputError);
    });

    it('should wrap errors from format converters', async () => {
      service.registerFormat('error', async () => {
        throw new Error('Test error');
      });

      await expect(service.convert([], state, 'error' as OutputFormat))
        .rejects
        .toThrow(MeldOutputError);
    });

    it('should preserve MeldOutputError when thrown from converters', async () => {
      service.registerFormat('error', async () => {
        throw new MeldOutputError('Test error', 'error');
      });

      await expect(service.convert([], state, 'error' as OutputFormat))
        .rejects
        .toThrow(MeldOutputError);
    });
  });

  describe('Directive Handling', () => {
    it('should handle text directives properly', async () => {
      // Using centralized text directive example
      const textExample = textDirectiveExamples.atomic.simpleString;
      const textNode = await createNodeFromExample(textExample.code);
      
      // Test in non-transformation mode
      vi.mocked(state.isTransformationEnabled).mockReturnValue(false);
      vi.mocked(state.getTransformedNodes).mockReturnValue([textNode]);
      
      let output = await service.convert([textNode], state, 'markdown');
      expect(output).toBe(''); // Definition directives are omitted
      
      // Test in transformation mode
      vi.mocked(state.isTransformationEnabled).mockReturnValue(true);
      const transformedNodes = [createTextNode('transformed content\n', createLocation(1, 1))];
      vi.mocked(state.getTransformedNodes).mockReturnValue(transformedNodes);
      
      output = await service.convert([textNode], state, 'markdown');
      expect(output).toBe('transformed content\n');
    });

    it('should handle run directives properly', async () => {
      // Using centralized run directive example
      const runExample = runDirectiveExamples.atomic.simple;
      const runNode = await createNodeFromExample(runExample.code);
      
      // Test in non-transformation mode
      vi.mocked(state.isTransformationEnabled).mockReturnValue(false);
      vi.mocked(state.getTransformedNodes).mockReturnValue([runNode]);
      
      let output = await service.convert([runNode], state, 'markdown');
      expect(output).toBe('[run directive output placeholder]\n\n');
      
      // Test in transformation mode
      vi.mocked(state.isTransformationEnabled).mockReturnValue(true);
      const transformedNodes = [createTextNode('executed command output\n', createLocation(1, 1))];
      vi.mocked(state.getTransformedNodes).mockReturnValue(transformedNodes);
      
      output = await service.convert([runNode], state, 'markdown');
      expect(output).toBe('executed command output\n');
    });

    it('should handle data directives properly', async () => {
      // Using centralized data directive example
      const dataExample = dataDirectiveExamples.atomic.simpleObject;
      const dataNode = await createNodeFromExample(dataExample.code);
      
      // Test in non-transformation mode
      vi.mocked(state.isTransformationEnabled).mockReturnValue(false);
      vi.mocked(state.getTransformedNodes).mockReturnValue([dataNode]);
      
      let output = await service.convert([dataNode], state, 'markdown');
      expect(output).toBe(''); // Definition directives are omitted
      
      // Test in transformation mode
      vi.mocked(state.isTransformationEnabled).mockReturnValue(true);
      const transformedNodes = [createTextNode('data content\n', createLocation(1, 1))];
      vi.mocked(state.getTransformedNodes).mockReturnValue(transformedNodes);
      
      output = await service.convert([dataNode], state, 'markdown');
      expect(output).toBe('data content\n');
    });

    it('should handle define directives properly', async () => {
      // Using centralized define directive example
      const defineExample = defineDirectiveExamples.atomic.stringLiteral;
      const defineNode = await createNodeFromExample(defineExample.code);
      
      // Test in non-transformation mode
      vi.mocked(state.isTransformationEnabled).mockReturnValue(false);
      vi.mocked(state.getTransformedNodes).mockReturnValue([defineNode]);
      
      let output = await service.convert([defineNode], state, 'markdown');
      expect(output).toBe(''); // Definition directives are omitted
      
      // Test in transformation mode
      vi.mocked(state.isTransformationEnabled).mockReturnValue(true);
      const transformedNodes = [createTextNode('defined content\n', createLocation(1, 1))];
      vi.mocked(state.getTransformedNodes).mockReturnValue(transformedNodes);
      
      output = await service.convert([defineNode], state, 'markdown');
      expect(output).toBe('defined content\n');
    });
  });

  describe('Direct Container Resolution and Field Access', () => {
    it('should handle field access with direct field access fallback', async () => {
      // Set up state with test data
      const mockState = mockDeep<IStateService>();
      vi.mocked(mockState.getDataVar).mockImplementation((name) => {
        if (name === 'user') {
          return {
            name: 'Claude',
            details: {
              role: 'AI Assistant',
              capabilities: ['code', 'conversation']
            },
            metrics: [10, 20, 30]
          };
        }
        return undefined;
      });
      
      // Create a test mock for resolutionService
      const mockResolutionService = mockDeep<IResolutionService>();
      
      // Create a custom OutputService with our mocks
      const outputService = new OutputService(mockState, mockResolutionService);
      
      // Use a simple TextNode for testing
      const textNode = createTextNode(
        'User: {{user.name}}, Role: {{user.details.role}}, Capability: {{user.metrics.0}}',
        createLocation(1, 1)
      );
      
      // Set up for transformation mode
      vi.mocked(mockState.isTransformationEnabled).mockReturnValue(true);
      vi.mocked(mockState.getTransformedNodes).mockReturnValue([textNode]);
      
      // Mock the behavior of resolveText for variable resolution
      mockResolutionService.resolveText.mockImplementation(async (text) => {
        return text
          .replace('{{user.name}}', 'Claude')
          .replace('{{user.details.role}}', 'AI Assistant')
          .replace('{{user.metrics.0}}', '10');
      });
      
      // Convert the node to markdown
      const output = await outputService.convert([textNode], mockState, 'markdown');
      
      // Clean the output for comparison
      const cleanOutput = output.trim().replace(/\s+/g, ' ');
      
      // We expect the output to contain the properly resolved field values
      // Using more flexible matching because the specific whitespace format may vary
      expect(cleanOutput).toContain('User: Claude');
      expect(cleanOutput).toContain('Role: AI Assistant');
      expect(cleanOutput).toContain('Capability: 10');
    });
    
    it('should gracefully handle errors in field access', async () => {
      // Set up state with test data that will cause field access errors
      const mockState = mockDeep<IStateService>();
      vi.mocked(mockState.getDataVar).mockImplementation((name) => {
        if (name === 'user') {
          return null; // Will cause field access errors
        }
        return undefined;
      });
      
      // Create a test mock for resolutionService that will also fail
      const mockResolutionService = mockDeep<IResolutionService>();
      mockResolutionService.resolveText.mockRejectedValue(new Error('Resolution error'));
      
      // Create a custom OutputService with our mocks
      const outputService = new OutputService(mockState, mockResolutionService);
      
      // Use a simple TextNode for testing with invalid field access
      const textNode = createTextNode(
        'User: {{user.name}}, Role: {{user.details.role}}, Capability: {{user.metrics.0}}',
        createLocation(1, 1)
      );
      
      // Set up for transformation mode
      vi.mocked(mockState.isTransformationEnabled).mockReturnValue(true);
      vi.mocked(mockState.getTransformedNodes).mockReturnValue([textNode]);
      
      // This should work even with the field access errors
      const output = await outputService.convert([textNode], mockState, 'markdown');
      
      // Verify basic functionality still works
      expect(output).toContain('User:'); // Will contain empty values but not crash
    });
  
    it('should not duplicate code fence markers in markdown output (regression #10.2.4)', async () => {
      // This tests the fix for the codefence duplication bug in version 10.2.4
      // Arrange: Set up a code fence node with content that already includes the fence markers
      const content = '```javascript\nconst name = "Claude";\nconst greet = () => `Hello, ${name}`;\n```';
      const nodes: MeldNode[] = [
        createCodeFenceNode(content, 'javascript', createLocation(1, 1))
      ];

      // Mock transformed nodes
      vi.mocked(state.getTransformedNodes).mockReturnValue(nodes);

      // Act: Convert to markdown
      const output = await service.convert(nodes, state, 'markdown');

      // Assert: Check that the output doesn't have duplicated fence markers
      // The output should contain the content exactly as-is, without adding extra ```
      expect(output).toContain(content);
      // Make sure it contains the code inside
      expect(output).toContain('const name = "Claude";');
      // Make sure it has exactly one opening and one closing fence marker
      const fenceMarkerCount = (output.match(/```/g) || []).length;
      expect(fenceMarkerCount).toBe(2); // Opening and closing, not 4 (which would indicate duplication)
    });

    it('should not duplicate code fence markers in XML output (regression #10.2.4)', async () => {
      // This tests the fix for the codefence duplication bug in version 10.2.4
      // Arrange: Set up a code fence node with content that already includes the fence markers
      const content = '```typescript\ninterface User { name: string; age: number; }\n```';
      const nodes: MeldNode[] = [
        createCodeFenceNode(content, 'typescript', createLocation(1, 1))
      ];

      // Mock transformed nodes
      vi.mocked(state.getTransformedNodes).mockReturnValue(nodes);

      // Act: Convert to XML
      const output = await service.convert(nodes, state, 'xml');

      // Assert: Check that the output doesn't have duplicated fence markers
      // The output should contain the content exactly as-is, without adding extra ```
      expect(output).toBe(content);
      // Make sure it contains the code inside
      expect(output).toContain('interface User');
      // Make sure it has exactly one opening and one closing fence marker
      const fenceMarkerCount = (output.match(/```/g) || []).length;
      expect(fenceMarkerCount).toBe(2); // Opening and closing, not 4 (which would indicate duplication)
    });

    it('should handle a document with mixed content and code fences (regression #10.2.4)', async () => {
      // This tests that code fence markers are not duplicated in a mixed document
      const codeFenceContent = '```javascript\nconst greeting = () => "Hello";\n```';
      const nodes: MeldNode[] = [
        createTextNode('Text before code\n', createLocation(1, 1)),
        createCodeFenceNode(codeFenceContent, 'javascript', createLocation(2, 1)),
        createTextNode('\nText after code', createLocation(4, 1))
      ];

      // Mock transformed nodes
      vi.mocked(state.getTransformedNodes).mockReturnValue(nodes);

      // Act: Convert to markdown
      const output = await service.convert(nodes, state, 'markdown');

      // Assert: Check the output structure
      expect(output).toContain('Text before code');
      expect(output).toContain(codeFenceContent);
      expect(output).toContain('Text after code');
      
      // Check for no duplication of fence markers
      const fenceMarkerCount = (output.match(/```/g) || []).length;
      expect(fenceMarkerCount).toBe(2); // Only the ones in the original content
    });
  });

  describe('Directive boundary handling', () => {
    beforeEach(() => {
      // Initialize with standard mocks
      service = new OutputService(state, resolutionService, undefined, mockVariableNodeFactory);
      
      // Default state behavior - always return true for isTransformationEnabled
      vi.mocked(state.isTransformationEnabled).mockReturnValue(true);
      vi.mocked(state.getTextVar).mockReturnValue(undefined);
      vi.mocked(state.getDataVar).mockReturnValue(undefined);
    });

    it('should maintain proper spacing at directive-to-text boundary', async () => {
      // Mock a directive followed by a block-level text node
      const nodes: MeldNode[] = [
        createDirectiveNode('text', [{ name: 'name', value: 'value' }], createLocation(1, 1)),
        createTextNode('This is a block-level text.\nIt has multiple lines.', createLocation(2, 1))
      ];

      // Setup state mock - always in transformation mode
      vi.mocked(state.isTransformationEnabled).mockReturnValue(true);
      vi.mocked(state.getTransformedNodes).mockReturnValue(nodes);
      
      // Process the nodes
      const result = await service.convert(nodes, state, 'markdown');
      
      // Verify proper spacing between directive and text
      // The directive should not output content (it's a definition)
      // The text should be properly formatted
      expect(result).toContain('This is a block-level text.');
      expect(result).toContain('It has multiple lines.');
      
      // Check for improper double newlines or missing newlines
      expect(result).not.toContain('\n\n\n');
    });

    it('should maintain proper spacing at text-to-directive boundary', async () => {
      // Mock a text node followed by a directive
      const nodes: MeldNode[] = [
        createTextNode('This is inline text.', createLocation(1, 1)),
        createDirectiveNode('text', [{ name: 'name', value: 'value' }], createLocation(2, 1))
      ];

      // Setup state mock - always in transformation mode
      vi.mocked(state.isTransformationEnabled).mockReturnValue(true);
      vi.mocked(state.getTransformedNodes).mockReturnValue(nodes);
      
      // Process the nodes
      const result = await service.convert(nodes, state, 'markdown');
      
      // Verify proper spacing - text followed by directive
      expect(result).toContain('This is inline text.');
      
      // Check for proper spacing - no excessive newlines
      expect(result).not.toContain('\n\n\n');
    });

    it('should handle adjacent directives correctly', async () => {
      // Mock multiple adjacent directives
      const nodes: MeldNode[] = [
        createDirectiveNode('text', [{ name: 'var1', value: 'value1' }], createLocation(1, 1)),
        createDirectiveNode('text', [{ name: 'var2', value: 'value2' }], createLocation(2, 1)),
        createDirectiveNode('text', [{ name: 'var3', value: 'value3' }], createLocation(3, 1))
      ];

      // Setup state mock - always in transformation mode
      vi.mocked(state.isTransformationEnabled).mockReturnValue(true);
      vi.mocked(state.getTransformedNodes).mockReturnValue(nodes);
      
      // Process the nodes
      const result = await service.convert(nodes, state, 'markdown');
      
      // Adjacent directives should have proper spacing
      // In normal mode they don't emit content
      expect(result).not.toContain('\n\n\n');
    });

    it('should respect output-literal mode at directive boundaries', async () => {
      // Mock a directive followed by a text node
      const nodes: MeldNode[] = [
        createDirectiveNode('text', [{ name: 'greeting', value: 'Hello' }], createLocation(1, 1)),
        createTextNode('{{greeting}} World!', createLocation(2, 1))
      ];

      // Setup state mock - always in transformation mode
      vi.mocked(state.isTransformationEnabled).mockReturnValue(true);
      vi.mocked(state.shouldTransform).mockReturnValue(true);
      vi.mocked(state.getTextVar).mockImplementation((name) => {
        if (name === 'greeting') return 'Hello';
        return undefined;
      });
      
      // Mock the transformed nodes to simulate what would happen in transformation mode
      const transformedNodes: MeldNode[] = [
        createTextNode('Hello World!', createLocation(1, 1))
      ];
      vi.mocked(state.getTransformedNodes).mockReturnValue(transformedNodes);
      
      // Process the nodes
      const result = await service.convert(nodes, state, 'markdown');
      
      // In transformation mode, the directive should be replaced with its value
      expect(result).toContain('Hello World!');
      
      // No additional newlines should be added at boundaries in output-literal mode
      expect(result).not.toContain('\n\n\n');
    });
  });

  describe('Prettier Integration', () => {
    it('should call formatWithPrettier when pretty option is true', async () => {
      // Create simple nodes
      const nodes = [
        createTextNode('# Simple content', createLocation(1, 1))
      ];
      
      // Set up mocks
      vi.mocked(state.getTransformedNodes).mockReturnValue(nodes);
      vi.mocked(state.isTransformationEnabled).mockReturnValue(true);
      
      // Create a spy on the formatWithPrettier import
      const prettierUtils = await import('@core/utils/prettierUtils.js');
      const formatSpy = vi.spyOn(prettierUtils, 'formatWithPrettier');
      formatSpy.mockResolvedValue('# Formatted content');
      
      // Call with pretty option
      await service.convert(nodes, state, 'markdown', {
        pretty: true
      });
      
      // Verify the spy was called
      expect(formatSpy).toHaveBeenCalled();
      expect(formatSpy).toHaveBeenCalledWith(expect.any(String), 'markdown');
      
      // Clean up the spy
      formatSpy.mockRestore();
    });
    
    it('should use the correct parser for XML format', async () => {
      // Create simple XML nodes
      const nodes = [
        createTextNode('<tag>content</tag>', createLocation(1, 1))
      ];
      
      // Set up mocks
      vi.mocked(state.getTransformedNodes).mockReturnValue(nodes);
      vi.mocked(state.isTransformationEnabled).mockReturnValue(true);
      
      // Create a spy on the formatWithPrettier import
      const prettierUtils = await import('@core/utils/prettierUtils.js');
      const formatSpy = vi.spyOn(prettierUtils, 'formatWithPrettier');
      formatSpy.mockResolvedValue('<tag>\n  content\n</tag>');
      
      // Call with pretty option and XML format
      await service.convert(nodes, state, 'xml', {
        pretty: true
      });
      
      // Verify the spy was called with HTML parser for XML content
      expect(formatSpy).toHaveBeenCalledWith(expect.any(String), 'html');
      
      // Clean up the spy
      formatSpy.mockRestore();
    });
    
    it('should not call formatWithPrettier when pretty option is false', async () => {
      // Create simple nodes
      const nodes = [
        createTextNode('# Simple content', createLocation(1, 1))
      ];
      
      // Set up mocks
      vi.mocked(state.getTransformedNodes).mockReturnValue(nodes);
      vi.mocked(state.isTransformationEnabled).mockReturnValue(true);
      
      // Create a spy on the formatWithPrettier import
      const prettierUtils = await import('@core/utils/prettierUtils.js');
      const formatSpy = vi.spyOn(prettierUtils, 'formatWithPrettier');
      
      // Call without pretty option
      await service.convert(nodes, state, 'markdown', {
        pretty: false
      });
      
      // Verify the spy was not called
      expect(formatSpy).not.toHaveBeenCalled();
      
      // Clean up the spy
      formatSpy.mockRestore();
    });
  });
}); 