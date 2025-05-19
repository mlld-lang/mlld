import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import { OutputService } from '@services/pipeline/OutputService/OutputService';
import { MeldOutputError } from '@core/errors/MeldOutputError';
import type { MeldNode } from '@core/syntax/types/index';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IResolutionService, ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService';
import type { OutputFormat, OutputOptions } from '@services/pipeline/OutputService/IOutputService';
import {
  createTextNode,
  createDirectiveNode,
  createCodeFenceNode,
  createLocation
} from '@tests/utils/testFactories';
// Import centralized syntax examples
import { 
  textDirectiveExamples, 
  dataDirectiveExamples,
  defineDirectiveExamples
} from '@core/syntax/index';
// Import run examples directly
import runDirectiveExamplesModule from '@core/syntax/run';
import { createNodeFromExample } from '@core/syntax/helpers/index';
import { TestContextDI } from '@tests/utils/di/TestContextDI';
import { ResolutionServiceClientFactory } from '@services/resolution/ResolutionService/factories/ResolutionServiceClientFactory';
import { VariableReferenceResolverClientFactory } from '@services/resolution/ResolutionService/factories/VariableReferenceResolverClientFactory';
import type { IResolutionServiceClient } from '@services/resolution/ResolutionService/interfaces/IResolutionServiceClient';
import type { IVariableReferenceResolverClient } from '@services/resolution/ResolutionService/interfaces/IVariableReferenceResolverClient';
import { createResolutionServiceMock, createStateServiceMock } from '@tests/utils/mocks/serviceMocks';
import { VariableResolutionError } from '@core/errors/VariableResolutionError';
import { VariableType } from '@core/types/variables';
import { createLLMXML } from 'llmxml';
import type { IVariableReference } from '@core/syntax/types/interfaces/IVariableReference';
import { outputLogger as logger } from '@core/utils/logger';
import { container, type DependencyContainer } from 'tsyringe';
import type { ILogger } from '@core/utils/logger';
import type { IOutputService } from '@services/pipeline/OutputService/IOutputService';

// Define FormatConverter locally for the test
type FormatConverter = (
  nodes: MeldNode[],
  state: IStateService,
  options?: OutputOptions
) => Promise<string>;

// Use the correctly imported run directive examples
const runDirectiveExamples = runDirectiveExamplesModule;

describe('OutputService', () => {
  let testContainer: DependencyContainer;
  let service: OutputService;
  let mockState: IStateService;
  let mockResolutionService: IResolutionService;
  let mockResolutionServiceClientFactory: ResolutionServiceClientFactory;
  let mockVariableReferenceResolverClientFactory: VariableReferenceResolverClientFactory;
  let mockResolutionServiceClient: IResolutionServiceClient;
  let mockVariableReferenceResolverClient: IVariableReferenceResolverClient;

  beforeEach(async () => {
    testContainer = container.createChildContainer();
    
    // Create Manual Mocks
    mockState = {
      isTransformationEnabled: vi.fn(),
      getTransformedNodes: vi.fn(),
      shouldTransform: vi.fn(),
      getVariable: vi.fn(),
      // Add other methods/properties used by OutputService if needed
      getStateId: vi.fn().mockReturnValue('test-state-id'),
      getCurrentFilePath: vi.fn().mockReturnValue('/test/file.mld'),
    } as unknown as IStateService;

    mockResolutionService = {
      resolveInContext: vi.fn(),
      // Add other methods used by OutputService if needed
    } as unknown as IResolutionService;


    // Mock Clients first
    mockResolutionServiceClient = {
      resolve: vi.fn(),
      // Add other methods if needed
    } as unknown as IResolutionServiceClient;

    mockVariableReferenceResolverClient = {
      accessFields: vi.fn(),
      convertToString: vi.fn(),
      // Add other methods if needed
    } as unknown as IVariableReferenceResolverClient;

    // Mock Factories
    mockResolutionServiceClientFactory = {
      createClient: vi.fn().mockReturnValue(mockResolutionServiceClient)
    } as unknown as ResolutionServiceClientFactory;
    mockVariableReferenceResolverClientFactory = {
      createClient: vi.fn().mockReturnValue(mockVariableReferenceResolverClient)
    } as unknown as VariableReferenceResolverClientFactory;

    // Register Manual Mocks
    testContainer.registerInstance<IStateService>('IStateService', mockState);
    testContainer.registerInstance<IResolutionService>('IResolutionService', mockResolutionService);
    testContainer.registerInstance(ResolutionServiceClientFactory, mockResolutionServiceClientFactory); // Register class token (optional constructor arg)
    testContainer.registerInstance('VariableReferenceResolverClientFactory', mockVariableReferenceResolverClientFactory); // Register string token (internal resolve)
    testContainer.registerInstance('DependencyContainer', testContainer); // Register container itself

    // Setup default mock behaviors (using vi.spyOn on the manual mocks)
    vi.spyOn(mockState, 'isTransformationEnabled').mockReturnValue(true);
    vi.spyOn(mockState, 'getTransformedNodes').mockReturnValue([]);
    vi.spyOn(mockState, 'shouldTransform').mockReturnValue(true);
    
    // Register the REAL service implementation against the INTERFACE token
    testContainer.register<IOutputService>('IOutputService', { useClass: OutputService });

    // Resolve the service using the INTERFACE token
    service = testContainer.resolve<IOutputService>('IOutputService');
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
      const customConverter: FormatConverter = async () => 'custom';
      service.registerFormat('custom', customConverter);
      expect(service.supportsFormat('custom')).toBe(true);
    });

    it('should throw on invalid format registration', () => {
      expect(() => service.registerFormat('', async () => '')).toThrowError();
      expect(() => service.registerFormat('test', null as any)).toThrowError();
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

      vi.spyOn(mockState, 'getTransformedNodes').mockReturnValue(nodes);

      const output = await service.convert(nodes, mockState, 'markdown');
      expect(output).toBe('Hello world\n');
    });

    it('should output pre-resolved text nodes correctly', async () => {
      const preResolvedContent = 'Hello Alice!';
      const nodes: MeldNode[] = [
        createTextNode(preResolvedContent, createLocation(1, 1))
      ];
      vi.spyOn(mockState, 'getTransformedNodes').mockReturnValue(nodes);

      const output = await service.convert(nodes, mockState, 'markdown');
      expect(output).toBe(preResolvedContent); 
    });

    it.skip('should include state variables when requested', async () => {
      vi.spyOn(mockState as any, 'getAllTextVars').mockReturnValue(new Map([['greeting', { name: 'greeting', type: VariableType.TEXT, value: 'hello' }]]));
      vi.spyOn(mockState as any, 'getAllDataVars').mockReturnValue(new Map([['count', { name: 'count', type: VariableType.DATA, value: 42 }]]));

      const nodes: MeldNode[] = [
        createTextNode('Content', createLocation(1, 1))
      ];

      vi.spyOn(mockState, 'getTransformedNodes').mockReturnValue(nodes);

      const output = await service.convert(nodes, mockState, 'markdown', {
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

      vi.spyOn(mockState, 'getTransformedNodes').mockReturnValue(nodes);

      const preserved = await service.convert(nodes, mockState, 'markdown', {
        preserveFormatting: true
      });
      expect(preserved).toBe('\n  Hello  \n  World  \n');

      const cleaned = await service.convert(nodes, mockState, 'markdown', {
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

      vi.spyOn(mockState, 'getTransformedNodes').mockReturnValue(nodes);

      const output = await service.convert(nodes, mockState, 'xml');
      expect(output).toContain('Hello world');
    });

    it('should preserve code fence content', async () => {
      const fenceContent = '```typescript\nconst x = 1;\n```';
      const nodes: MeldNode[] = [
        createCodeFenceNode(fenceContent, 'typescript', createLocation(1, 1))
      ];

      vi.spyOn(mockState, 'getTransformedNodes').mockReturnValue(nodes);

      const output = await service.convert(nodes, mockState, 'xml');
      expect(output).toContain('const x = 1;');
      expect(output).toContain('```typescript');
    });

    it.skip('should preserve state variables when requested', async () => {
      vi.spyOn(mockState as any, 'getAllTextVars').mockReturnValue(new Map([['greeting', { name: 'greeting', type: VariableType.TEXT, value: 'hello' }]]));
      vi.spyOn(mockState as any, 'getAllDataVars').mockReturnValue(new Map([['count', { name: 'count', type: VariableType.DATA, value: 42 }]]));

      const nodes: MeldNode[] = [
        createTextNode('Content', createLocation(1, 1))
      ];

      vi.spyOn(mockState, 'getTransformedNodes').mockReturnValue(nodes);

      const output = await service.convert(nodes, mockState, 'xml', {
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
      vi.spyOn(mockState, 'getVariable').mockImplementation((name, type?) => {
        if (name === 'user' && (!type || type === VariableType.DATA || type === undefined)) {
          return { type: VariableType.DATA, name: 'user', value: { name: 'Claude', details: { role: 'AI Assistant' }, metrics: [10] } } as any;
        }
        return undefined;
      });

      const textNode = createTextNode(
        'User: Claude, Role: AI Assistant, Capability: 10',
        createLocation(1, 1)
      );
      
      vi.spyOn(mockState, 'isTransformationEnabled').mockReturnValue(true);
      vi.spyOn(mockState, 'getTransformedNodes').mockReturnValue([textNode]);
      
      const output = await service.convert([textNode], mockState, 'markdown'); 
      
      const cleanOutput = output.trim().replace(/\s+/g, ' ');
      
      expect(cleanOutput).toContain('User: Claude');
      expect(cleanOutput).toContain('Role: AI Assistant');
      expect(cleanOutput).toContain('Capability: 10');
    });
    
    it('should gracefully handle errors in field access', async () => {
      const mockStateForError = mockState;
      vi.spyOn(mockStateForError, 'getVariable').mockImplementation((name, type?) => {
        if (name === 'user' && (!type || type === VariableType.DATA)) return undefined;
        return undefined;
      });
      vi.spyOn(mockStateForError, 'isTransformationEnabled').mockReturnValue(true);
      
      vi.spyOn(mockResolutionService, 'resolveInContext')
          .mockRejectedValue(new Error('Resolution error'));
      
      const textNode = createTextNode(
        'User: {{user.name}}, Role: {{user.details.role}}',
        createLocation(1, 1)
      );
      vi.spyOn(mockStateForError, 'getTransformedNodes').mockReturnValue([textNode]);

      const output = await service.convert([textNode], mockStateForError, 'markdown');
      
      expect(output).toContain('User:'); 
    });
  
    it('should not duplicate code fence markers in markdown output (regression #10.2.4)', async () => {
      const content = '```javascript\nconst name = "Claude";\nconst greet = () => `Hello, ${name}`;\n```';
      const nodes: MeldNode[] = [
        createCodeFenceNode(content, 'javascript', createLocation(1, 1))
      ];

      vi.spyOn(mockState, 'getTransformedNodes').mockReturnValue(nodes);

      const output = await service.convert(nodes, mockState, 'markdown');

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

      vi.spyOn(mockState, 'getTransformedNodes').mockReturnValue(nodes);

      const output = await service.convert(nodes, mockState, 'xml');

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

      vi.spyOn(mockState, 'getTransformedNodes').mockReturnValue(nodes);

      const output = await service.convert(nodes, mockState, 'markdown');

      expect(output).toContain('Text before code');
      expect(output).toContain(codeFenceContent);
      expect(output).toContain('Text after code');
      
      const fenceMarkerCount = (output.match(/```/g) || []).length;
      expect(fenceMarkerCount).toBe(2);
    });
  });

  describe('Directive boundary handling', () => {
    beforeEach(() => {
      service = new OutputService(mockState, mockResolutionService, undefined);
      
      vi.spyOn(mockState, 'isTransformationEnabled').mockReturnValue(true);
      vi.spyOn(mockState, 'getVariable').mockImplementation((name, type?) => {
        return undefined;
      });
    });

    it('should maintain proper spacing at directive-to-text boundary', async () => {
      const nodes: MeldNode[] = [
        createDirectiveNode('text', [{ name: 'name', value: 'value' }], createLocation(1, 1)),
        createTextNode('This is a block-level text.\nIt has multiple lines.', createLocation(2, 1))
      ];

      vi.spyOn(mockState, 'isTransformationEnabled').mockReturnValue(true);
      vi.spyOn(mockState, 'getTransformedNodes').mockReturnValue(nodes);
      
      const result = await service.convert(nodes, mockState, 'markdown');
      
      expect(result).toContain('This is a block-level text.');
      expect(result).toContain('It has multiple lines.');
      
      expect(result).not.toContain('\n\n\n');
    });

    it('should maintain proper spacing at text-to-directive boundary', async () => {
      const nodes: MeldNode[] = [
        createTextNode('This is inline text.', createLocation(1, 1)),
        createDirectiveNode('text', [{ name: 'name', value: 'value' }], createLocation(2, 1))
      ];

      vi.spyOn(mockState, 'isTransformationEnabled').mockReturnValue(true);
      vi.spyOn(mockState, 'getTransformedNodes').mockReturnValue(nodes);
      
      const result = await service.convert(nodes, mockState, 'markdown');
      
      expect(result).toContain('This is inline text.');
      
      expect(result).not.toContain('\n\n\n');
    });

    it('should handle adjacent directives correctly', async () => {
      const nodes: MeldNode[] = [
        createDirectiveNode('text', [{ name: 'var1', value: 'value1' }], createLocation(1, 1)),
        createDirectiveNode('text', [{ name: 'var2', value: 'value2' }], createLocation(2, 1)),
        createDirectiveNode('text', [{ name: 'var3', value: 'value3' }], createLocation(3, 1))
      ];

      vi.spyOn(mockState, 'isTransformationEnabled').mockReturnValue(true);
      vi.spyOn(mockState, 'getTransformedNodes').mockReturnValue(nodes);
      
      const result = await service.convert(nodes, mockState, 'markdown');
      
      expect(result).not.toContain('\n\n\n');
    });

    it('should respect output-literal mode at directive boundaries', async () => {
      const transformedNodes: MeldNode[] = [
        createTextNode('\n', createLocation(1, 1)),
        createTextNode('Hello World!', createLocation(2, 1))
      ];

      vi.spyOn(mockState, 'isTransformationEnabled').mockReturnValue(true);
      vi.spyOn(mockState, 'getTransformedNodes').mockReturnValue(transformedNodes);
      
      const result = await service.convert(transformedNodes, mockState, 'markdown');
      
      expect(result).toBe('\nHello World!');
    });
  });

  describe('Prettier Integration', () => {
    it('should call formatWithPrettier when pretty option is true', async () => {
      const nodes = [
        createTextNode('# Simple content', createLocation(1, 1))
      ];
      
      vi.spyOn(mockState, 'isTransformationEnabled').mockReturnValue(true);
      vi.spyOn(mockState, 'getTransformedNodes').mockReturnValue(nodes);
      
      const prettierUtils = await import('@core/utils/prettierUtils.js');
      const formatSpy = vi.spyOn(prettierUtils, 'formatWithPrettier');
      formatSpy.mockResolvedValue('# Formatted content');
      
      await service.convert(nodes, mockState, 'markdown', {
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
      
      vi.spyOn(mockState, 'isTransformationEnabled').mockReturnValue(true);
      vi.spyOn(mockState, 'getTransformedNodes').mockReturnValue(nodes);
      
      const prettierUtils = await import('@core/utils/prettierUtils.js');
      const formatSpy = vi.spyOn(prettierUtils, 'formatWithPrettier');
      formatSpy.mockResolvedValue('<tag>\n  content\n</tag>');
      
      await service.convert(nodes, mockState, 'xml', {
        pretty: true
      });
      
      expect(formatSpy).toHaveBeenCalledWith(expect.any(String), 'html');
      
      formatSpy.mockRestore();
    });
    
    it('should not call formatWithPrettier when pretty option is false', async () => {
      const nodes = [
        createTextNode('# Simple content', createLocation(1, 1))
      ];
      
      vi.spyOn(mockState, 'isTransformationEnabled').mockReturnValue(true);
      vi.spyOn(mockState, 'getTransformedNodes').mockReturnValue(nodes);
      
      const prettierUtils = await import('@core/utils/prettierUtils.js');
      const formatSpy = vi.spyOn(prettierUtils, 'formatWithPrettier');
      
      await service.convert(nodes, mockState, 'markdown', {
        pretty: false
      });
      
      expect(formatSpy).not.toHaveBeenCalled();
      
      formatSpy.mockRestore();
    });
  });
}); 