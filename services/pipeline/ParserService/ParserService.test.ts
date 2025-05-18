import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ParserService } from '@services/pipeline/ParserService/ParserService';
import { MeldParseError } from '@core/errors/MeldParseError';
import type { MeldNode, DirectiveNode, TextNode, CodeFenceNode, VariableReferenceNode } from '@core/ast/types';
import type { Location, Position } from '@core/types/index';
// Import the centralized syntax examples and helpers
import { 
  textDirectiveExamples, 
  codefenceExamples, 
  contentExamples 
} from '@core/syntax/index';
import { getExample, getInvalidExample } from '@tests/utils/syntax-test-helpers';
import { VariableNodeFactory } from '@core/syntax/types/factories/VariableNodeFactory';
import { NodeFactory } from '@core/syntax/types/factories/NodeFactory';
import { container, type DependencyContainer } from 'tsyringe';
import { mock, mockDeep } from 'vitest-mock-extended';
import type { IResolutionServiceClient } from '@services/resolution/ResolutionService/interfaces/IResolutionServiceClient';
import { ResolutionServiceClientFactory } from '@services/resolution/ResolutionService/factories/ResolutionServiceClientFactory';

// Define a type that combines the meld-spec Location with our filePath
type LocationWithFilePath = {
  start: { line: number | undefined; column: number | undefined };
  end: { line: number | undefined; column: number | undefined };
  filePath?: string;
};

// Helper function to create test locations
function createTestLocation(startLine: number | undefined, startColumn: number | undefined, endLine: number | undefined, endColumn: number | undefined, filePath?: string): LocationWithFilePath {
  return {
    start: { line: startLine, column: startColumn },
    end: { line: endLine, column: endColumn },
    filePath
  };
}

// Type guard for Location
function isLocation(value: any): value is LocationWithFilePath {
  return (
    value &&
    typeof value === 'object' &&
    'start' in value &&
    'end' in value &&
    'filePath' in value
  );
}

// Type guard for checking if a location has a filePath
function hasFilePath(location: any): location is LocationWithFilePath {
  return (
    location &&
    typeof location === 'object' &&
    'start' in location &&
    'end' in location &&
    'filePath' in location
  );
}

describe('ParserService', () => {
  let service: ParserService;
  let testContainer: DependencyContainer;
  let mockNodeFactory: NodeFactory;
  let mockVariableNodeFactory: VariableNodeFactory;
  let mockResolutionClient: IResolutionServiceClient;
  let mockResolutionClientFactory: ResolutionServiceClientFactory;

  beforeEach(async () => {
    testContainer = container.createChildContainer();
    
    // --- Mocks & Real Instances ---
    mockNodeFactory = new NodeFactory(); 
    mockVariableNodeFactory = new VariableNodeFactory(mockNodeFactory); 
    mockResolutionClient = mock<IResolutionServiceClient>();
    // mockResolutionClientFactory = mock<ResolutionServiceClientFactory>(); // OLD MOCK
    // Configure factory mock to return the client mock directly
    mockResolutionClientFactory = {
        createClient: vi.fn().mockReturnValue(mockResolutionClient)
    } as unknown as ResolutionServiceClientFactory;
    // vi.spyOn(mockResolutionClientFactory, 'createClient').mockReturnValue(mockResolutionClient); // REMOVED SPY
    
    // --- Registration --- 
    testContainer.registerInstance(NodeFactory, mockNodeFactory);
    testContainer.registerInstance(VariableNodeFactory, mockVariableNodeFactory);
    testContainer.registerInstance(ResolutionServiceClientFactory, mockResolutionClientFactory);
    testContainer.registerInstance('DependencyContainer', testContainer);
    
    // Register the service under test
    testContainer.register(ParserService, { useClass: ParserService });

    // --- Resolve --- 
    service = testContainer.resolve(ParserService);
  });
  
  afterEach(async () => {
    testContainer?.dispose();
    vi.clearAllMocks();
  });

  describe('parse', () => {
    it('should parse text content', async () => {
      const content = contentExamples.atomic.simpleParagraph.code;
      
      const mockResult = [
        {
          type: 'Text',
          content: 'This is a simple paragraph of text.',
          location: {
            start: { line: 1, column: 1 },
            end: { line: 1, column: 36 }
          },
          nodeId: expect.any(String)
        }
      ];

      const result = await service.parse(content);
      expect(result).toEqual(mockResult);
    });

    it('should parse directive content', async () => {
      const content = textDirectiveExamples.atomic.simpleString.code;
      const mockLocation = { start: { line: 1, column: 2 }, end: { line: 1, column: 25 } };
      const mockTextValueLocation = { start: { line: 1, column: 19 }, end: { line: 1, column: 24 } };

      const mockResult = [
        {
          type: 'Directive',
          location: mockLocation,
          nodeId: expect.any(String),
          directive: {
            kind: 'text',
            identifier: 'greeting',
            source: 'literal',
            value: [
              { type: 'Text', content: 'Hello', location: mockTextValueLocation, nodeId: expect.any(String) }
            ]
          }
        }
      ];

      const result = await service.parse(content);
      expect(result).toEqual(mockResult);
    });

    it('should parse code fence content', async () => {
      const content = codefenceExamples.atomic.simpleCodeFence.code;
      const mockResult = [
        {
          type: 'CodeFence',
          language: 'js',
          content: '```js\nconst greeting = \'Hello, world!\';\nconsole.log(greeting);\n```',
          location: {
            start: { line: 1, column: 1 },
            end: { line: 4, column: 4 },
          },
          nodeId: expect.any(String)
        },
      ];

      const result = await service.parse(content);
      expect(result).toEqual(mockResult);
    });

    it('should parse code fence without language', async () => {
      const content = codefenceExamples.atomic.withoutLanguage.code;
      const mockResult = [
        {
          type: 'CodeFence',
          language: undefined,
          content: '```\nThis is a code block without a language specified.\n```',
          location: {
            start: { line: 1, column: 1 },
            end: { line: 3, column: 4 }
          },
          nodeId: expect.any(String)
        }
      ];
      
      const result = await service.parse(content);
      expect(result).toEqual(mockResult);
    });

    it('should treat directives as literal text in code fences', async () => {
      const content = codefenceExamples.combinations.withDirectives.code;
      const result = await service.parse(content);
      
      expect(result).toHaveLength(3);
      expect(result[0].type).toBe('Directive');
      expect(result[1].type).toBe('Text');
      expect(result[2].type).toBe('CodeFence');
      const codeFence = result[2] as CodeFenceNode;
      expect(codeFence.content).toContain('```{{language}}');
      expect(codeFence.content).toContain('console.log');
    });

    it('should handle nested code fences', async () => {
      const content = codefenceExamples.combinations.nestedFences.code;
      const result = await service.parse(content);
      
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('CodeFence');
      expect((result[0] as CodeFenceNode).content).toContain('```js');
      expect((result[0] as CodeFenceNode).content).toContain('console.log');
    });

    it('should parse code fences with equal backtick counts', async () => {
      const content = codefenceExamples.combinations.equalBacktickCounts.code;
      const result = await service.parse(content);
      
      expect(result).toHaveLength(3);
      expect(result[0].type).toBe('CodeFence');
      expect((result[0] as CodeFenceNode).content).toBe('```\nouter\n```');
      expect(result[1].type).toBe('Text');
      expect((result[1] as TextNode).content).toBe('inner\n');
      expect(result[2].type).toBe('CodeFence');
      expect((result[2] as CodeFenceNode).content).toBe('```\n\n```');
    });

    it('should parse mixed content', async () => {
      const content = contentExamples.atomic.simpleParagraph.code;
      const result = await service.parse(content);
      
      // Verify we have at least one text node
      expect(result.length).toBeGreaterThan(0);
      const types = new Set(result.map(node => node.type));
      expect(types.has('Text')).toBe(true);
      
      // Check that the nodes have proper location information
      result.forEach(node => {
        expect(node.location).toBeDefined();
        expect(node.location.start).toBeDefined();
        expect(node.location.end).toBeDefined();
      });
    });

    it('should handle empty content', async () => {
      const result = await service.parse('');
      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });

    it('should throw MeldParseError with location for invalid directive', async () => {
      const content = contentExamples.invalid.unknownDirective.code;
      
      await expect(service.parse(content)).rejects.toThrow(MeldParseError);
      await expect(service.parse(content)).rejects.toThrow(/Parse error/);
    });

    it('should throw MeldParseError for malformed directive', async () => {
      const content = textDirectiveExamples.invalid.unclosedString.code;
      
      await expect(service.parse(content)).rejects.toThrow(MeldParseError);
      await expect(service.parse(content)).rejects.toThrow(/Parse error/);
    });

    it('should parse variable references', async () => {
      const content = `Hello {{greeting}}`;
      const result = await service.parse(content);
      
      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('Text');
      expect(result[1].type).toBe('VariableReference');
      expect((result[1] as VariableReferenceNode).identifier).toBe('greeting');
      expect((result[1] as VariableReferenceNode).valueType).toBe('text');
    });

    it('should parse variable references with fields', async () => {
      const content = `User: {{user.name}}, ID: {{user.id}}`;
      const result = await service.parse(content);
      
      expect(result).toHaveLength(4);
      expect(result[1].type).toBe('VariableReference');
      expect((result[1] as VariableReferenceNode).identifier).toBe('user');
      expect((result[1] as VariableReferenceNode).fields).toEqual([
        { type: 'field', value: 'name' }
      ]);
      expect(result[3].type).toBe('VariableReference');
      expect((result[3] as VariableReferenceNode).identifier).toBe('user');
      expect((result[3] as VariableReferenceNode).fields).toEqual([
        { type: 'field', value: 'id' }
      ]);
    });

    it('should parse variable references with array indices', async () => {
      const content = `First item: {{items[0]}}, Second: {{items[1]}}`;
      const result = await service.parse(content);
      
      expect(result).toHaveLength(4);
      expect(result[1].type).toBe('VariableReference');
      expect((result[1] as VariableReferenceNode).identifier).toBe('items');
      expect((result[1] as VariableReferenceNode).fields).toEqual([
        { type: 'index', value: 0 }
      ]);
      expect(result[3].type).toBe('VariableReference');
      expect((result[3] as VariableReferenceNode).identifier).toBe('items');
      expect((result[3] as VariableReferenceNode).fields).toEqual([
        { type: 'index', value: 1 }
      ]);
    });

    it('should parse variable references with nested fields and indices', async () => {
      const content = `Deep access: {{data.users[0].profile.name}}`;
      const result = await service.parse(content);
      
      expect(result).toHaveLength(2);
      expect(result[1].type).toBe('VariableReference');
      expect((result[1] as VariableReferenceNode).identifier).toBe('data');
      expect((result[1] as VariableReferenceNode).fields).toEqual([
        { type: 'field', value: 'users' },
        { type: 'index', value: 0 },
        { type: 'field', value: 'profile' },
        { type: 'field', value: 'name' }
      ]);
    });

    it('should parse a simple text directive', async () => {
      const content = '@text greeting = "Hello"';
      const mockLocation = { start: { line: 1, column: 1 }, end: { line: 1, column: 25 } };
      const mockTextValueLocation = { start: { line: 1, column: 19 }, end: { line: 1, column: 24 } };
      
      const mockResult = [
        {
          type: 'Directive',
          location: mockLocation,
          nodeId: expect.any(String),
          directive: {
            kind: 'text',
            identifier: 'greeting',
            source: 'literal',
            value: [
              { type: 'Text', content: 'Hello', location: mockTextValueLocation, nodeId: expect.any(String) }
            ]
          }
        }
      ];

      const result = await service.parse(content);
      console.log('Actual Result:', JSON.stringify(result, null, 2));
      console.log('Expected Result:', JSON.stringify(mockResult, null, 2));
      expect(result).toBeTruthy();
    });

    // <<< ADD Test for @run with interpolation >>>
    it('should parse @run directive with interpolated values in brackets', async () => {
      const service = testContainer.resolve<ParserService>('IParserService');
      const content = '@run [echo {{greeting}}]'; // Minimal case
      let ast: MeldNode[] | undefined;
      let error: Error | undefined;

      try {
        // Use parse to get the AST
        ast = await service.parse(content, 'test.mld'); 
      } catch (e) {
        error = e instanceof Error ? e : new Error(String(e));
      }

      // Log results for debugging
      console.log('Parser Test (@run interpolation): Error:', error);
      console.log('Parser Test (@run interpolation): AST:', JSON.stringify(ast, null, 2));

      // Assertions
      expect(error).toBeUndefined(); // Expect NO parse error
      expect(ast).toBeDefined();
      expect(ast).toHaveLength(1);
      expect(ast![0].type).toBe('Directive');
      const directiveNode = ast![0] as DirectiveNode;
      expect(directiveNode.directive.kind).toBe('run');
      expect(directiveNode.directive.subtype).toBe('runCommand');
      // Verify the command is an InterpolatableValue array
      expect(Array.isArray(directiveNode.directive.command)).toBe(true);
      const commandParts = directiveNode.directive.command as InterpolatableValue;
      expect(commandParts).toHaveLength(2);
      expect(commandParts[0].type).toBe('Text');
      expect((commandParts[0] as TextNode).content).toBe('echo ');
      expect(commandParts[1].type).toBe('VariableReference');
      expect((commandParts[1] as VariableReferenceNode).identifier).toBe('greeting');
    });
    // <<< END Test >>>
  });

  describe('parseWithLocations', () => {
    it('should include file path in locations', async () => {
      const content = contentExamples.atomic.simpleParagraph.code;
      const filePath = 'test.meld';
      const result = await service.parseWithLocations(content, filePath);
      
      // Check that all nodes have the file path in their location
      result.forEach(node => {
        expect(node.location).toBeDefined();
        expect(node.location.filePath).toBe(filePath);
      });
      
      // Check that we have at least one text node
      expect(result.some(node => node.type === 'Text')).toBe(true);
    });

    it('should preserve original locations when adding filePath', async () => {
      const content = textDirectiveExamples.atomic.simpleString.code;
      const filePath = 'test.meld';

      const result = await service.parseWithLocations(content, filePath);
      
      expect(result[0].location).toEqual(expect.objectContaining({
        start: expect.objectContaining({ line: 1 }),
        end: expect.objectContaining({ line: 1 }),
        filePath
      }));
    });

    it('should include filePath in error for invalid content', async () => {
      const content = textDirectiveExamples.invalid.invalidVarName.code;
      const filePath = 'test.meld';
      
      await expect(service.parseWithLocations(content, filePath)).rejects.toThrow(MeldParseError);
      await expect(service.parseWithLocations(content, filePath)).rejects.toThrow(/Parse error/);
    });
  });

  describe('error handling', () => {
    it('should handle unknown errors gracefully', async () => {
      const content = contentExamples.atomic.simpleParagraph.code;
      const result = await service.parse(content);
      expect(result).toEqual([{
        type: 'Text',
        content: 'This is a simple paragraph of text.',
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 36 }
        },
        nodeId: expect.any(String)
      }]);
    });

    it('should preserve MeldParseError instances', async () => {
      const content = textDirectiveExamples.invalid.invalidVarName.code;
      await expect(service.parse(content)).rejects.toThrow(MeldParseError);
    });
  });
}); 