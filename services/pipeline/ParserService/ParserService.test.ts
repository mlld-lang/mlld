import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ParserService } from './ParserService.js';
import { MeldParseError } from '@core/errors/MeldParseError.js';
import type { MeldNode, DirectiveNode, TextNode, CodeFenceNode } from 'meld-spec';
import type { Location, Position } from '@core/types/index.js';
// Import the centralized syntax examples and helpers
import { 
  textDirectiveExamples, 
  codefenceExamples, 
  contentExamples 
} from '@core/syntax/index.js';
import { getExample, getInvalidExample } from '@tests/utils/syntax-test-helpers.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { container } from 'tsyringe';

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

// Run tests with both DI and non-DI modes
describe.each([
  { useDI: true, name: 'with DI' },
  { useDI: false, name: 'without DI' }
])('ParserService %s', ({ useDI }) => {
  let service: ParserService;
  let testContext: TestContextDI;

  beforeEach(() => {
    // Save original DI setting
    const originalDISetting = process.env.USE_DI;
    
    // Set up DI mode for tests
    if (useDI) {
      process.env.USE_DI = 'true';
      testContext = TestContextDI.create({ isolatedContainer: true });
      
      // Register mock services in the container
      container.registerInstance('IResolutionService', mockResolutionService);
      
      // Resolve service from container
      service = container.resolve(ParserService);
    } else {
      process.env.USE_DI = 'false';
      testContext = TestContextDI.create({ isolatedContainer: true });
      service = new ParserService();
    }
    
    // Restore original DI setting
    process.env.USE_DI = originalDISetting;
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
      const mockResult = [
        {
          type: 'Directive',
          directive: {
            kind: 'text',
            identifier: 'greeting',
            source: 'literal',
            value: 'Hello',
          },
          location: {
            start: { line: 1, column: 2 },
            end: { line: 1, column: 25 },
          },
        },
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
          content: "```js\nconst greeting = 'Hello, world!';\nconsole.log(greeting);\n```",
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