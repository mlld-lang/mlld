import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import { OutputService } from '@services/pipeline/OutputService/OutputService.js';
import { MeldOutputError } from '@core/errors/MeldOutputError.js';
import type { MeldNode } from '@core/syntax/types/index.js';
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
import { ResolutionServiceClientFactory } from '@services/resolution/ResolutionService/factories/ResolutionServiceClientFactory.js';
import { createResolutionServiceMock, createStateServiceMock } from '@tests/utils/mocks/serviceMocks';
import { VariableResolutionError } from '@core/errors/VariableResolutionError.js';
import { VariableType } from '@core/types/variables.js';
import { createLLMXML } from 'llmxml';
import type { IVariableReference } from '@core/syntax/types/interfaces/IVariableReference.js';
import { outputLogger as logger } from '@core/utils/logger.js';
import { container, type DependencyContainer } from 'tsyringe';

// Use the correctly imported run directive examples
const runDirectiveExamples = runDirectiveExamplesModule;

describe('OutputService', () => {
  let testContainer: DependencyContainer;
  let service: OutputService;
  let state: DeepMockProxy<IStateService>;
  let resolutionService: DeepMockProxy<IResolutionService>;
  let mockVariableNodeFactory: DeepMockProxy<VariableNodeFactory>;

  beforeEach(async () => {
    testContainer = container.createChildContainer();
    
    state = mockDeep<IStateService>();
    resolutionService = mockDeep<IResolutionService>();
    mockVariableNodeFactory = mockDeep<VariableNodeFactory>();
    
    testContainer.registerInstance<IStateService>('IStateService', state);
    testContainer.registerInstance<IResolutionService>('IResolutionService', resolutionService);
    testContainer.registerInstance(VariableNodeFactory, mockVariableNodeFactory);
    testContainer.registerInstance('DependencyContainer', testContainer);

    vi.mocked(state.isTransformationEnabled).mockReturnValue(true);
    vi.mocked(state.getTransformedNodes).mockReturnValue([]);
    vi.mocked(state.shouldTransform).mockReturnValue(true);
    
    testContainer.register(OutputService, { useClass: OutputService });

    service = testContainer.resolve(OutputService);
  });

  afterEach(async () => {
    testContainer?.dispose();
    vi.restoreAllMocks();
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

      vi.mocked(state.getTransformedNodes).mockReturnValue(nodes);

      const output = await service.convert(nodes, state, 'markdown');
      expect(output).toBe('Hello world\n');
    });

    it('should output pre-resolved text nodes correctly', async () => {
      const preResolvedContent = 'Hello Alice!';
      const nodes: MeldNode[] = [
        createTextNode(preResolvedContent, createLocation(1, 1)) 
      ];
      vi.mocked(state.getTransformedNodes).mockReturnValue(nodes);

      const output = await service.convert(nodes, state, 'markdown');
      expect(output).toBe(preResolvedContent); 
    });

    it.skip('should include state variables when requested', async () => {
      vi.mocked(state as any).getAllTextVars.mockReturnValue(new Map([['greeting', { name: 'greeting', type: VariableType.TEXT, value: 'hello' }]]));
      vi.mocked(state as any).getAllDataVars.mockReturnValue(new Map([['count', { name: 'count', type: VariableType.DATA, value: 42 }]]));

      const nodes: MeldNode[] = [
        createTextNode('Content', createLocation(1, 1))
      ];

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

      vi.mocked(state.getTransformedNodes).mockReturnValue(nodes);

      const preserved = await service.convert(nodes, state, 'markdown', {
        preserveFormatting: true
      });
      expect(preserved).toBe('\n  Hello  \n  World  \n');

      const cleaned = await service.convert(nodes, state, 'markdown', {
        preserveFormatting: false
      });
      expect(cleaned).toBe('\n  Hello  \n  World  \n');
    });
  });

  describe('XML Output', () => {
    it('should preserve text content', async () => {
      const nodes: MeldNode[] = [
        createTextNode('Hello world', createLocation(1, 1))
      ];

      vi.mocked(state.getTransformedNodes).mockReturnValue(nodes);

      const output = await service.convert(nodes, state, 'xml');
      expect(output).toContain('Hello world');
    });

    it('should preserve code fence content', async () => {
      const fenceContent = '```typescript\nconst x = 1;\n```';
      const nodes: MeldNode[] = [
        createCodeFenceNode(fenceContent, 'typescript', createLocation(1, 1))
      ];

      vi.mocked(state.getTransformedNodes).mockReturnValue(nodes);

      const output = await service.convert(nodes, state, 'xml');
      expect(output).toContain('const x = 1;');
      expect(output).toContain('```typescript');
    });

    it.skip('should preserve state variables when requested', async () => {
      vi.mocked(state as any).getAllTextVars.mockReturnValue(new Map([['greeting', { name: 'greeting', type: VariableType.TEXT, value: 'hello' }]]));
      vi.mocked(state as any).getAllDataVars.mockReturnValue(new Map([['count', { name: 'count', type: VariableType.DATA, value: 42 }]]));

      const nodes: MeldNode[] = [
        createTextNode('Content', createLocation(1, 1))
      ];

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

  describe('Direct Container Resolution and Field Access', () => {
    it('should handle field access with direct field access fallback', async () => {
      const mockState = mockDeep<IStateService>();
      vi.mocked(mockState.getVariable).mockImplementation((name, type?) => {
        if (name === 'user' && (!type || type === VariableType.DATA)) {
          return { type: VariableType.DATA, name: 'user', value: { name: 'Claude', details: { role: 'AI Assistant' }, metrics: [10] } } as any;
        }
        return undefined;
      });

      const textNode = createTextNode(
        'User: Claude, Role: AI Assistant, Capability: 10',
        createLocation(1, 1)
      );
      
      vi.mocked(state.isTransformationEnabled).mockReturnValue(true);
      vi.mocked(state.getTransformedNodes).mockReturnValue([textNode]);
      vi.mocked(mockState.isTransformationEnabled).mockReturnValue(true);
      vi.mocked(mockState.getTransformedNodes).mockReturnValue([textNode]);
      
      const output = await service.convert([textNode], mockState, 'markdown'); 
      
      const cleanOutput = output.trim().replace(/\s+/g, ' ');
      
      expect(cleanOutput).toContain('User: Claude');
      expect(cleanOutput).toContain('Role: AI Assistant');
      expect(cleanOutput).toContain('Capability: 10');
    });
    
    it('should gracefully handle errors in field access', async () => {
      const mockStateForError = mockDeep<IStateService>();
      vi.mocked(mockStateForError.getVariable).mockImplementation((name, type?) => {
        if (name === 'user' && (!type || type === VariableType.DATA)) return undefined;
        return undefined;
      });
      vi.mocked(mockStateForError.isTransformationEnabled).mockReturnValue(true);
      
      resolutionService.resolveText.mockRejectedValue(new Error('Resolution error'));
      
      const textNode = createTextNode(
        'User: {{user.name}}, Role: {{user.details.role}}',
        createLocation(1, 1)
      );
      vi.mocked(mockStateForError.getTransformedNodes).mockReturnValue([textNode]);

      const output = await service.convert([textNode], mockStateForError, 'markdown');
      
      expect(output).toContain('User:'); 
    });
  
    it('should not duplicate code fence markers in markdown output (regression #10.2.4)', async () => {
      const content = '```javascript\nconst name = "Claude";\nconst greet = () => `Hello, ${name}`;\n```';
      const nodes: MeldNode[] = [
        createCodeFenceNode(content, 'javascript', createLocation(1, 1))
      ];

      vi.mocked(state.getTransformedNodes).mockReturnValue(nodes);

      const output = await service.convert(nodes, state, 'markdown');

      expect(output).toContain(content);
      expect(output).toContain('const name = "Claude";');
      const fenceMarkerCount = (output.match(/```/g) || []).length;
      expect(fenceMarkerCount).toBe(2);
    });

    it('should not duplicate code fence markers in XML output (regression #10.2.4)', async () => {
      const content = '```typescript\ninterface User { name: string; age: number; }\n```';
      const nodes: MeldNode[] = [
        createCodeFenceNode(content, 'typescript', createLocation(1, 1))
      ];

      vi.mocked(state.getTransformedNodes).mockReturnValue(nodes);

      const output = await service.convert(nodes, state, 'xml');

      expect(output).toContain('interface User');
      expect(output).toContain('interface User');
    });

    it('should handle a document with mixed content and code fences (regression #10.2.4)', async () => {
      const codeFenceContent = '```javascript\nconst greeting = () => "Hello";\n```';
      const nodes: MeldNode[] = [
        createTextNode('Text before code\n', createLocation(1, 1)),
        createCodeFenceNode(codeFenceContent, 'javascript', createLocation(2, 1)),
        createTextNode('\nText after code', createLocation(4, 1))
      ];

      vi.mocked(state.getTransformedNodes).mockReturnValue(nodes);

      const output = await service.convert(nodes, state, 'markdown');

      expect(output).toContain('Text before code');
      expect(output).toContain(codeFenceContent);
      expect(output).toContain('Text after code');
      
      const fenceMarkerCount = (output.match(/```/g) || []).length;
      expect(fenceMarkerCount).toBe(2);
    });
  });

  describe('Directive boundary handling', () => {
    beforeEach(() => {
      service = new OutputService(state, resolutionService, undefined, mockVariableNodeFactory);
      
      vi.mocked(state.isTransformationEnabled).mockReturnValue(true);
      vi.mocked(state.getVariable).mockImplementation((name, type?) => {
        return undefined;
      });
    });

    it('should maintain proper spacing at directive-to-text boundary', async () => {
      const nodes: MeldNode[] = [
        createDirectiveNode('text', [{ name: 'name', value: 'value' }], createLocation(1, 1)),
        createTextNode('This is a block-level text.\nIt has multiple lines.', createLocation(2, 1))
      ];

      vi.mocked(state.isTransformationEnabled).mockReturnValue(true);
      vi.mocked(state.getTransformedNodes).mockReturnValue(nodes);
      
      const result = await service.convert(nodes, state, 'markdown');
      
      expect(result).toContain('This is a block-level text.');
      expect(result).toContain('It has multiple lines.');
      
      expect(result).not.toContain('\n\n\n');
    });

    it('should maintain proper spacing at text-to-directive boundary', async () => {
      const nodes: MeldNode[] = [
        createTextNode('This is inline text.', createLocation(1, 1)),
        createDirectiveNode('text', [{ name: 'name', value: 'value' }], createLocation(2, 1))
      ];

      vi.mocked(state.isTransformationEnabled).mockReturnValue(true);
      vi.mocked(state.getTransformedNodes).mockReturnValue(nodes);
      
      const result = await service.convert(nodes, state, 'markdown');
      
      expect(result).toContain('This is inline text.');
      
      expect(result).not.toContain('\n\n\n');
    });

    it('should handle adjacent directives correctly', async () => {
      const nodes: MeldNode[] = [
        createDirectiveNode('text', [{ name: 'var1', value: 'value1' }], createLocation(1, 1)),
        createDirectiveNode('text', [{ name: 'var2', value: 'value2' }], createLocation(2, 1)),
        createDirectiveNode('text', [{ name: 'var3', value: 'value3' }], createLocation(3, 1))
      ];

      vi.mocked(state.isTransformationEnabled).mockReturnValue(true);
      vi.mocked(state.getTransformedNodes).mockReturnValue(nodes);
      
      const result = await service.convert(nodes, state, 'markdown');
      
      expect(result).not.toContain('\n\n\n');
    });

    it('should respect output-literal mode at directive boundaries', async () => {
      const transformedNodes: MeldNode[] = [
        createTextNode('\n', createLocation(1, 1)),
        createTextNode('Hello World!', createLocation(2, 1))
      ];

      vi.mocked(state.isTransformationEnabled).mockReturnValue(true);
      vi.mocked(state.getTransformedNodes).mockReturnValue(transformedNodes);
      
      const result = await service.convert(transformedNodes, state, 'markdown');
      
      expect(result).toBe('\nHello World!');
    });
  });

  describe('Prettier Integration', () => {
    it('should call formatWithPrettier when pretty option is true', async () => {
      const nodes = [
        createTextNode('# Simple content', createLocation(1, 1))
      ];
      
      vi.mocked(state.getTransformedNodes).mockReturnValue(nodes);
      vi.mocked(state.isTransformationEnabled).mockReturnValue(true);
      
      const prettierUtils = await import('@core/utils/prettierUtils.js');
      const formatSpy = vi.spyOn(prettierUtils, 'formatWithPrettier');
      formatSpy.mockResolvedValue('# Formatted content');
      
      await service.convert(nodes, state, 'markdown', {
        pretty: true
      });
      
      expect(formatSpy).toHaveBeenCalled();
      expect(formatSpy).toHaveBeenCalledWith(expect.any(String), 'markdown');
      
      formatSpy.mockRestore();
    });
    
    it('should use the correct parser for XML format', async () => {
      const nodes = [
        createTextNode('<tag>content</tag>', createLocation(1, 1))
      ];
      
      vi.mocked(state.getTransformedNodes).mockReturnValue(nodes);
      vi.mocked(state.isTransformationEnabled).mockReturnValue(true);
      
      const prettierUtils = await import('@core/utils/prettierUtils.js');
      const formatSpy = vi.spyOn(prettierUtils, 'formatWithPrettier');
      formatSpy.mockResolvedValue('<tag>\n  content\n</tag>');
      
      await service.convert(nodes, state, 'xml', {
        pretty: true
      });
      
      expect(formatSpy).toHaveBeenCalledWith(expect.any(String), 'html');
      
      formatSpy.mockRestore();
    });
    
    it('should not call formatWithPrettier when pretty option is false', async () => {
      const nodes = [
        createTextNode('# Simple content', createLocation(1, 1))
      ];
      
      vi.mocked(state.getTransformedNodes).mockReturnValue(nodes);
      vi.mocked(state.isTransformationEnabled).mockReturnValue(true);
      
      const prettierUtils = await import('@core/utils/prettierUtils.js');
      const formatSpy = vi.spyOn(prettierUtils, 'formatWithPrettier');
      
      await service.convert(nodes, state, 'markdown', {
        pretty: false
      });
      
      expect(formatSpy).not.toHaveBeenCalled();
      
      formatSpy.mockRestore();
    });
  });
}); 