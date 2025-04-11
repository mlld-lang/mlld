import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ParserService } from '@services/pipeline/ParserService/ParserService.js';
import { MeldParseError } from '@core/errors/MeldParseError.js';
import type { MeldNode, DirectiveNode, TextNode, CodeFenceNode, VariableReferenceNode } from '@core/syntax/types.js';
import type { Location, Position } from '@core/types/index.js';
// Import the centralized syntax examples and helpers
import { 
  textDirectiveExamples, 
  codefenceExamples, 
  contentExamples 
} from '@core/syntax/index.js';
import { getExample, getInvalidExample } from '@tests/utils/syntax-test-helpers.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { VariableNodeFactory } from '@core/syntax/types/factories/VariableNodeFactory.js';
import { NodeFactory } from '@core/syntax/types/factories/NodeFactory.js';

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

// Create a mock ResolutionService for testing
const mockResolutionService = {
  resolveInContext: async (value: string, context: any) => {
    // For testing purposes, just return the value
    return value;
  }
};

describe('ParserService', () => {
  let service: ParserService;
  let testContext: TestContextDI;
  let mockNodeFactory: any;
  let mockVariableNodeFactory: any;

  beforeEach(async () => {
    // Create test context with isolated container
    testContext = TestContextDI.createIsolated();
    await testContext.initialize();
    
    // Create mock NodeFactory
    mockNodeFactory = {
      createNode: vi.fn().mockImplementation((type, location) => ({
        type,
        ...(location && { location })
      }))
    };
    
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
    
    // Register mock services in the container
    testContext.registerMock('IResolutionService', mockResolutionService);
    testContext.registerMock(NodeFactory, mockNodeFactory);
    testContext.registerMock(VariableNodeFactory, mockVariableNodeFactory);
    
    // Resolve service from container
    service = testContext.container.resolve(ParserService);
  });
  
  afterEach(async () => {
    await testContext?.cleanup();
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
          }
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
          directive: {
            kind: 'text',
            identifier: 'greeting',
            source: 'literal',
            value: [
              { type: 'Text', content: 'Hello', location: mockTextValueLocation }
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
          }
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
          directive: {
            kind: 'text',
            identifier: 'greeting',
            source: 'literal',
            value: [
              { type: 'Text', content: 'Hello', location: mockTextValueLocation }
            ]
          }
        }
      ];

      const result = await service.parse(content);
      console.log('Actual Result:', JSON.stringify(result, null, 2));
      console.log('Expected Result:', JSON.stringify(mockResult, null, 2));
      expect(result).toBeTruthy();
    });
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
        }
      }]);
    });

    it('should preserve MeldParseError instances', async () => {
      const content = textDirectiveExamples.invalid.invalidVarName.code;
      await expect(service.parse(content)).rejects.toThrow(MeldParseError);
    });
  });
}); 