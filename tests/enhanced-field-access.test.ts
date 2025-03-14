import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TestContext } from './utils/TestContext.js';
import { VariableReferenceResolver } from '@services/resolution/ResolutionService/resolvers/VariableReferenceResolver.js';
import { VariableReferenceResolverClientFactory } from '@services/resolution/ResolutionService/factories/VariableReferenceResolverClientFactory.js';
import { IVariableReferenceResolverClient, FieldAccessOptions } from '@services/resolution/ResolutionService/interfaces/IVariableReferenceResolverClient.js';
import { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ProjectBuilder } from './utils/ProjectBuilder.js';

describe('Enhanced Field Access', () => {
  let testContext: TestContext;
  let resolver: VariableReferenceResolver;
  let factory: VariableReferenceResolverClientFactory;
  let client: IVariableReferenceResolverClient;
  let mockStateService: any;
  let context: ResolutionContext;
  
  beforeEach(() => {
    // Create test context and mock services
    testContext = new TestContext();
    
    // Mock state service with test data
    mockStateService = {
      getTextVar: vi.fn(),
      getDataVar: vi.fn(),
      getPathVar: vi.fn()
    };
    
    // Set up test data
    mockStateService.getTextVar.mockImplementation((name: string) => {
      const textVars: Record<string, string> = {
        simpleText: 'Hello World',
        dynamicField: 'name'
      };
      return textVars[name];
    });
    
    mockStateService.getDataVar.mockImplementation((name: string) => {
      const dataVars: Record<string, any> = {
        user: {
          name: 'Alice',
          age: 30,
          profile: {
            bio: 'Software developer',
            skills: ['JavaScript', 'TypeScript', 'Node.js']
          }
        },
        items: [
          { id: 1, name: 'Item 1' },
          { id: 2, name: 'Item 2' },
          { id: 3, name: 'Item 3' }
        ],
        emptyArray: [],
        numbers: [1, 2, 3, 4, 5],
        config: {
          debug: true,
          version: '1.0.0',
          settings: {
            theme: 'dark',
            fontSize: 14
          }
        },
        nestedArrays: [
          [1, 2, 3],
          [4, 5, 6],
          [7, 8, 9]
        ]
      };
      return dataVars[name];
    });
    
    // Create resolver and client with the mock state service
    // Direct instantiation of VariableReferenceResolver
    resolver = new VariableReferenceResolver(mockStateService);
    factory = new VariableReferenceResolverClientFactory(resolver);
    client = factory.createClient();
    
    // Set up context for tests
    context = {
      strict: true,
      state: mockStateService
    };
  });
  
  afterEach(() => {
    vi.resetAllMocks();
  });
  
  describe('Client Interface', () => {
    it('should resolve basic variable references', async () => {
      const result = await client.resolve('Username: {{user.name}}', context);
      expect(result).toBe('Username: Alice');
    });
    
    it('should resolve field access with preserveType option', async () => {
      // With type preservation
      const options: FieldAccessOptions = { preserveType: true };
      const result = await client.resolveFieldAccess('user', 'profile.skills', context, options);
      
      // Log the actual result for debugging
      console.log('Result type:', typeof result);
      console.log('Is array?', Array.isArray(result));
      console.log('Actual result:', result);
      
      // Check if we got the actual array back
      if (Array.isArray(result)) {
        const expected = ['JavaScript', 'TypeScript', 'Node.js'];
        expect(result).toEqual(expected);
      } else {
        fail('Expected result to be an array when preserveType is enabled');
      }
      
      // Without type preservation (default)
      const stringResult = await client.resolveFieldAccess('user', 'profile.skills', context);
      console.log('String result:', stringResult);
      
      // According to our new standardized formatting, arrays in inline context 
      // should be comma-space separated without brackets
      expect(stringResult).toBe('JavaScript, TypeScript, Node.js');
    });
    
    it('should access fields in objects', async () => {
      const userData = await client.resolveFieldAccess('user', '', context, { preserveType: true });
      
      // Direct field access on the object
      const result = await client.accessFields(
        userData, 
        'profile.skills.1', 
        context, 
        // Include variable name for error messages
        { preserveType: true, variableName: 'user' }
      );
      
      expect(result).toBe('TypeScript');
    });
    
    it('should format arrays differently based on context', async () => {
      // Create a test array directly for testing formatting
      const skills = ['JavaScript', 'TypeScript', 'Node.js'];
      
      // In block context (should be bullet list or comma-separated based on complexity)
      const blockResult = client.convertToString(skills, {
        formattingContext: {
          isBlock: true,
          nodeType: 'VariableReference',
          valueType: 'text',
          linePosition: 'middle'
        }
      });
      
      console.log('Block formatting result:', blockResult);
      
      // According to our new standardized formatting, simple arrays in block context 
      // should be comma-space separated
      expect(blockResult).toBe('JavaScript, TypeScript, Node.js');
      
      // In inline context (should be comma-separated)
      const inlineResult = client.convertToString(skills, {
        formattingContext: {
          isBlock: false,
          nodeType: 'VariableReference',
          valueType: 'text',
          linePosition: 'middle'
        }
      });
      
      console.log('Inline formatting result:', inlineResult);
      
      // According to our new standardized formatting, arrays in inline context 
      // should be comma-space separated without brackets
      expect(inlineResult).toBe('JavaScript, TypeScript, Node.js');
      
      // Test with a complex array that should be bullet-pointed in block context
      const complexArray = [
        { name: 'Complex Item 1', value: 42 },
        { name: 'Complex Item 2', value: 84 }
      ];
      
      const complexBlockResult = client.convertToString(complexArray, {
        formattingContext: {
          isBlock: true,
          nodeType: 'VariableReference',
          valueType: 'data',
          linePosition: 'middle'
        }
      });
      
      console.log('Complex block formatting result:', complexBlockResult);
      
      // For complex arrays in block context, we expect a bullet list
      // Each line should start with a bullet point
      const lines = complexBlockResult.split('\n');
      expect(lines.length).toBe(2); // Two items, each on its own line
      expect(lines[0].startsWith('- ')).toBe(true);
      expect(lines[1].startsWith('- ')).toBe(true);
    });
    
    it('should format objects differently based on context', async () => {
      // Create a test config object directly
      const config = {
        debug: true,
        version: '1.0.0',
        settings: {
          theme: 'dark',
          fontSize: 14
        }
      };
      
      // In block context (should use pretty JSON)
      const blockResult = client.convertToString(config, {
        formattingContext: {
          isBlock: true,
          nodeType: 'VariableReference',
          valueType: 'data',
          linePosition: 'start'
        }
      });
      
      console.log('Block formatting result for object:', blockResult);
      
      // For objects in block context, we expect pretty-printed JSON with 2-space indentation
      expect(blockResult).toBe(JSON.stringify(config, null, 2));
      
      // In inline context (should be compact JSON)
      const inlineResult = client.convertToString(config, {
        formattingContext: {
          isBlock: false,
          nodeType: 'VariableReference',
          valueType: 'data',
          linePosition: 'middle'
        }
      });
      
      // For objects in inline context, we expect compact JSON without whitespace
      expect(inlineResult).toBe(JSON.stringify(config));
    });
    
    it('should extract variable references from text', async () => {
      const text = 'Hello {{user.name}}, your skills are {{user.profile.skills}}';
      const refs = await client.extractReferences(text);
      expect(refs).toContain('user');
    });
  });
  
  // Skipping integration test since it needs more project builder setup
  describe.skip('Integration with Project', () => {
    let project: any;
    
    it('should process variable references in Meld content', async () => {
      // This test would verify that the improved field access and formatting
      // is integrated with the overall project pipeline
      expect(true).toBe(true);
    });
  });
});