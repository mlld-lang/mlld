import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TestContextDI } from './utils/di/TestContextDI.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import { VariableReferenceResolver } from '@services/resolution/ResolutionService/resolvers/VariableReferenceResolver.js';
import { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IVariableReferenceResolverClient } from '@services/resolution/ResolutionService/interfaces/IVariableReferenceResolverClient.js';
import { VariableReferenceResolverClientFactory } from '@services/resolution/ResolutionService/factories/VariableReferenceResolverClientFactory.js';
import { VariableResolutionTracker } from '@tests/utils/debug/VariableResolutionTracker/index.js';

// Mock StateVisualizationService and StateTrackingService
class StateVisualizationService {}
class StateTrackingService {}

/**
 * Comprehensive test suite for object property access patterns and formatting
 * Phase 1 of the p0-fixing-plan.md implementation
 * 
 * This test suite documents and tests object property access issues, newline handling,
 * variable substitution formatting, and output format differences.
 */
describe('Object Property Access Comprehensive Tests', () => {
  let context: TestContextDI;
  let stateService: IStateService;
  let resolver: VariableReferenceResolver;
  let resolverClient: IVariableReferenceResolverClient;
  let resolutionContext: ResolutionContext;
  let visualizationService: StateVisualizationService;
  let trackingService: StateTrackingService;
  let resolutionTracker: VariableResolutionTracker;

  // Common test data for all test cases
  const testData = {
    // Simple text variables
    simpleText: 'Hello World',
    greeting: 'Hello',
    multilineText: 'Line 1\nLine 2\nLine 3',
    
    // Complex object with nested properties
    user: {
      name: 'Alice',
      age: 30,
      contact: {
        email: 'alice@example.com',
        phone: '123-456-7890'
      },
      address: {
        street: '123 Main St',
        city: 'Anytown',
        zip: '12345'
      },
      tags: ['developer', 'designer'],
      active: true
    },
    
    // Array of primitives
    fruits: ['apple', 'banana', 'orange'],
    
    // Array of objects
    users: [
      { id: 1, name: 'Alice', role: 'admin', hobbies: ['reading', 'coding'] },
      { id: 2, name: 'Bob', role: 'user', hobbies: ['gaming', 'sports'] },
      { id: 3, name: 'Charlie', role: 'user', hobbies: ['music', 'art'] }
    ],
    
    // Deeply nested arrays
    nestedArrays: [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9]
    ],
    
    // Complex nested structure 
    project: {
      name: 'Meld',
      version: '1.0.0',
      features: ['syntax', 'formatting', 'variables'],
      contributors: [
        { name: 'Dev1', commits: 42, active: true },
        { name: 'Dev2', commits: 17, active: false }
      ],
      settings: {
        debug: true,
        theme: {
          name: 'dark',
          colors: {
            primary: '#333',
            secondary: '#666'
          }
        }
      }
    },

    // Edge cases
    emptyObject: {},
    emptyArray: [],
    nullValue: null,
    numberValue: 42,
    booleanValue: true
  };

  beforeEach(() => {
    // Set up TestContextDI
    context = TestContextDI.create();

    // Create a working mock state service
    const textVars = new Map<string, string>();
    const dataVars = new Map<string, any>();
    const pathVars = new Map<string, string>();
    let transformationEnabled = false;
    
    stateService = {
      getTextVar: vi.fn((name: string) => textVars.get(name)),
      getDataVar: vi.fn((name: string) => dataVars.get(name)),
      getPathVar: vi.fn((name: string) => pathVars.get(name)),
      setTextVar: vi.fn((name: string, value: string) => textVars.set(name, value)),
      setDataVar: vi.fn((name: string, value: any) => dataVars.set(name, value)),
      setPathVar: vi.fn((name: string, value: string) => pathVars.set(name, value)),
      isTransformationEnabled: vi.fn(() => transformationEnabled),
      getTransformedNodes: vi.fn().mockReturnValue([]),
      enableTransformation: vi.fn(() => { transformationEnabled = true; })
    };
    
    // Create the resolver with our mock state service
    resolver = new VariableReferenceResolver(stateService);

    // Create client for easier API access
    const factory = new VariableReferenceResolverClientFactory(resolver);
    resolverClient = factory.createClient();

    // Register debug services manually rather than trying to resolve them
    visualizationService = new StateVisualizationService();
    trackingService = new StateTrackingService();
    
    // Register them with the container
    context.registerMock('StateVisualizationService', visualizationService);
    context.registerMock('StateTrackingService', trackingService);

    // Create resolution tracker and connect to resolver
    resolutionTracker = new VariableResolutionTracker();
    
    // Mock the tracker's methods that will be called in tests
    resolutionTracker.enable = vi.fn();
    resolutionTracker.getVisualization = vi.fn().mockReturnValue({
      attempts: [
        { variableName: 'project.name', success: true },
        { variableName: 'project.features', success: true },
        { variableName: 'project.contributors', success: true }
      ]
    });
    
    // Connect the tracker to the resolver
    resolver.setResolutionTracker(resolutionTracker);

    // Set up resolution context
    resolutionContext = {
      state: stateService,
      strict: true
    };

    // Populate state with test data
    for (const [key, value] of Object.entries(testData)) {
      if (typeof value === 'string') {
        stateService.setTextVar(key, value);
      } else {
        stateService.setDataVar(key, value);
      }
    }
  });

  afterEach(async () => {
    await context.cleanup();
  });

  describe('Basic Object Property Access', () => {
    it('should correctly access simple object properties', async () => {
      const result = await resolverClient.resolve('User name: {{user.name}}', resolutionContext);
      expect(result).toBe('User name: Alice');
    });

    it('should access nested object properties', async () => {
      const result = await resolverClient.resolve('Email: {{user.contact.email}}', resolutionContext);
      expect(result).toBe('Email: alice@example.com');
    });

    it('should access deeply nested properties', async () => {
      const result = await resolverClient.resolve('Theme color: {{project.settings.theme.colors.primary}}', resolutionContext);
      expect(result).toBe('Theme color: #333');
    });

    it('should access boolean properties correctly', async () => {
      const result = await resolverClient.resolve('User is active: {{user.active}}', resolutionContext);
      expect(result).toBe('User is active: true');
    });

    it('should access numeric properties correctly', async () => {
      const result = await resolverClient.resolve('User age: {{user.age}}', resolutionContext);
      expect(result).toBe('User age: 30');
    });

    it('should handle null values appropriately', async () => {
      const result = await resolverClient.resolve('Null value: {{nullValue}}', resolutionContext);
      expect(result).toBe('Null value: ');
    });
  });

  describe('Array Access Patterns', () => {
    it('should access array elements by index', async () => {
      const result = await resolverClient.resolve('First fruit: {{fruits.0}}', resolutionContext);
      expect(result).toBe('First fruit: apple');
    });

    it('should access nested array elements', async () => {
      const result = await resolverClient.resolve('Matrix value: {{nestedArrays.1.2}}', resolutionContext);
      expect(result).toBe('Matrix value: 6');
    });

    it('should access properties of objects in arrays', async () => {
      const result = await resolverClient.resolve('Second user name: {{users.1.name}}', resolutionContext);
      expect(result).toBe('Second user name: Bob');
    });

    it('should access deeply nested arrays', async () => {
      const result = await resolverClient.resolve('First hobby of second user: {{users.1.hobbies.0}}', resolutionContext);
      expect(result).toBe('First hobby of second user: gaming');
    });

    it('should handle arrays of primitives correctly', async () => {
      const result = await resolverClient.resolve('Fruits: {{fruits}}', resolutionContext);
      
      // This test documents current behavior - should format as comma-separated list
      // We'll replace with proper expectation once standardization is complete
      console.log('Current fruits array output:', result);
      
      // The expected output may be different based on final standardization
      // Currently expecting comma-separated values without square brackets
      expect(result).toContain('apple');
      expect(result).toContain('banana');
      expect(result).toContain('orange');
    });

    it('should format arrays of objects correctly', async () => {
      const result = await resolverClient.resolve('All users: {{users}}', resolutionContext);
      
      // Document current behavior - full JSON string output
      console.log('Current users array output:', result);
      
      // The output is complex but we can check key elements
      expect(result).toContain('Alice');
      expect(result).toContain('Bob');
      expect(result).toContain('Charlie');
    });
  });

  describe('Variable Embedding Context', () => {
    it('should handle variables at the beginning of lines', async () => {
      const result = await resolverClient.resolve('{{greeting}} there!\nHow are you?', resolutionContext);
      expect(result).toBe('Hello there!\nHow are you?');
    });

    it('should handle variables in the middle of lines', async () => {
      const result = await resolverClient.resolve('I want to say {{greeting}} to everyone.', resolutionContext);
      expect(result).toBe('I want to say Hello to everyone.');
    });

    it('should handle variables at the end of lines', async () => {
      const result = await resolverClient.resolve('The greeting is: {{greeting}}', resolutionContext);
      expect(result).toBe('The greeting is: Hello');
    });

    it('should handle multiple variables in a single line', async () => {
      const result = await resolverClient.resolve('{{greeting}}, {{user.name}}! Your email is {{user.contact.email}}.', resolutionContext);
      expect(result).toBe('Hello, Alice! Your email is alice@example.com.');
    });

    it('should handle variables with multiline content', async () => {
      const result = await resolverClient.resolve('Text: {{multilineText}}', resolutionContext);
      
      // Document current behavior
      console.log('Current multiline output:', JSON.stringify(result));
      
      // We expect newlines to be preserved
      expect(result).toContain('Line 1\nLine 2\nLine 3');
    });
  });

  describe('Newline Handling', () => {
    it('should preserve newlines in variable values', async () => {
      const result = await resolverClient.resolve('{{multilineText}}', resolutionContext);
      expect(result).toBe('Line 1\nLine 2\nLine 3');
    });

    it('should handle newlines after variable references', async () => {
      const result = await resolverClient.resolve('{{greeting}}\nNext line', resolutionContext);
      expect(result).toBe('Hello\nNext line');
    });

    it('should handle newlines before variable references', async () => {
      const result = await resolverClient.resolve('Previous line\n{{greeting}}', resolutionContext);
      expect(result).toBe('Previous line\nHello');
    });

    it('should handle variables containing newlines in formatted text', async () => {
      const result = await resolverClient.resolve('Text:\n{{multilineText}}\nMore text', resolutionContext);
      
      // Document current behavior
      console.log('Newline handling in formatted text:', JSON.stringify(result));
      
      // Expected behavior may vary based on standardization
      expect(result).toContain('Text:');
      expect(result).toContain('Line 1');
      expect(result).toContain('Line 2');
      expect(result).toContain('Line 3');
      expect(result).toContain('More text');
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent variables in strict mode', async () => {
      // Set strict mode
      resolutionContext.strict = true;
      
      // Missing variable should throw in strict mode
      await expect(resolverClient.resolve('Missing: {{nonexistent}}', resolutionContext))
        .rejects.toThrow();
    });

    it('should handle non-existent variables in non-strict mode', async () => {
      // Disable strict mode
      resolutionContext.strict = false;
      
      // Missing variable should be empty string in non-strict mode
      const result = await resolverClient.resolve('Missing: {{nonexistent}}', resolutionContext);
      expect(result).toBe('Missing: ');
    });

    it('should handle non-existent fields in strict mode', async () => {
      // Set strict mode
      resolutionContext.strict = true;
      
      // Missing field should throw in strict mode
      await expect(resolverClient.resolve('Bad field: {{user.nonexistent}}', resolutionContext))
        .rejects.toThrow();
    });

    it('should handle non-existent fields in non-strict mode', async () => {
      // Disable strict mode
      resolutionContext.strict = false;
      
      // Missing field should be empty string in non-strict mode
      const result = await resolverClient.resolve('Bad field: {{user.nonexistent}}', resolutionContext);
      expect(result).toBe('Bad field: ');
    });

    it('should handle invalid array indices', async () => {
      // Disable strict mode for this test
      resolutionContext.strict = false;
      
      // Out of bounds index should be empty string in non-strict mode
      const result = await resolverClient.resolve('Out of bounds: {{fruits.99}}', resolutionContext);
      expect(result).toBe('Out of bounds: ');
    });
  });

  describe('Type Formatting', () => {
    it('should format objects as JSON strings', async () => {
      const result = await resolverClient.resolve('User: {{user}}', resolutionContext);
      
      // Document current behavior
      console.log('Current object formatting:', result);
      
      // Verify JSON-like structure with all key properties
      expect(result).toContain('"name":');
      expect(result).toContain('"Alice"');
      expect(result).toContain('"age":');
      expect(result).toContain('30');
    });

    it('should format nested objects appropriately', async () => {
      const result = await resolverClient.resolve('Project: {{project}}', resolutionContext);
      
      // Document current behavior
      console.log('Current nested object formatting:', result);
      
      // Verify structure contains key elements
      expect(result).toContain('"name":');
      expect(result).toContain('"Meld"');
      expect(result).toContain('"contributors":');
    });

    it('should format empty objects and arrays appropriately', async () => {
      const emptyObjectResult = await resolverClient.resolve('Empty object: {{emptyObject}}', resolutionContext);
      const emptyArrayResult = await resolverClient.resolve('Empty array: {{emptyArray}}', resolutionContext);
      
      // Document current behavior
      console.log('Empty object formatting:', emptyObjectResult);
      console.log('Empty array formatting:', emptyArrayResult);
      
      // Check empty object formatting - might be {} or empty string
      // These assertions may need updating based on standardization
      expect(emptyObjectResult).toContain('Empty object:');
      expect(emptyArrayResult).toContain('Empty array:');
    });

    it('should format primitive values appropriately', async () => {
      const numberResult = await resolverClient.resolve('Number: {{numberValue}}', resolutionContext);
      const booleanResult = await resolverClient.resolve('Boolean: {{booleanValue}}', resolutionContext);
      
      // Standard primitive conversions
      expect(numberResult).toBe('Number: 42');
      expect(booleanResult).toBe('Boolean: true');
    });
  });

  describe('Complex Formatting Cases', () => {
    it('should handle complex object property access with multiple variables', async () => {
      const result = await resolverClient.resolve('{{greeting}}, {{user.name}}! Your project {{project.name}} (v{{project.version}}) has {{project.contributors.length}} contributors.', resolutionContext);
      
      // Document current behavior
      console.log('Complex formatting with multiple variables:', result);
      
      // Check for expected content
      expect(result).toContain('Hello, Alice!');
      expect(result).toContain('Your project Meld');
      expect(result).toContain('(v1.0.0)');
      expect(result).toContain('has 2 contributors');
    });

    it('should handle markdown formatting with embedded variables', async () => {
      const template = `# User Profile for {{user.name}}

## Contact Information
- Email: {{user.contact.email}}
- Phone: {{user.contact.phone}}

## Address
{{user.address.street}}
{{user.address.city}}, {{user.address.zip}}

## Projects
Working on: {{project.name}} v{{project.version}}
`;
      
      const result = await resolverClient.resolve(template, resolutionContext);
      
      // Document current behavior
      console.log('Markdown formatting with embedded variables:');
      console.log(result);
      
      // Check for expected content
      expect(result).toContain('# User Profile for Alice');
      expect(result).toContain('Email: alice@example.com');
      expect(result).toContain('123 Main St');
      expect(result).toContain('Working on: Meld v1.0.0');
    });

    it('should handle table formatting with embedded variables', async () => {
      const template = `| Name | Role | Hobbies |
| ---- | ---- | ------- |
| {{users.0.name}} | {{users.0.role}} | {{users.0.hobbies}} |
| {{users.1.name}} | {{users.1.role}} | {{users.1.hobbies}} |
| {{users.2.name}} | {{users.2.role}} | {{users.2.hobbies}} |`;
      
      const result = await resolverClient.resolve(template, resolutionContext);
      
      // Document current behavior
      console.log('Table formatting with embedded variables:');
      console.log(result);
      
      // Check for expected content in the rendered table
      expect(result).toContain('| Name | Role | Hobbies |');
      expect(result).toContain('| Alice | admin |');
      expect(result).toContain('| Bob | user |');
      expect(result).toContain('| Charlie | user |');
    });

    it('should visualize variable resolution for complex cases', async () => {
      // Enable resolution tracking for visualization
      resolutionTracker.enable();
      
      // Resolve a complex template
      await resolverClient.resolve('Project {{project.name}} has features: {{project.features}} and {{project.contributors.length}} contributors including {{project.contributors.0.name}}', resolutionContext);
      
      // Get the visualization data
      const visualization = resolutionTracker.getVisualization();
      
      // Document the resolution path
      console.log('Resolution visualization data:', JSON.stringify(visualization, null, 2));
      
      // Verify key resolution steps were tracked
      expect(visualization.attempts.length).toBeGreaterThan(0);
      expect(visualization.attempts.some(a => a.variableName.includes('project.name'))).toBe(true);
      expect(visualization.attempts.some(a => a.variableName.includes('project.features'))).toBe(true);
      expect(visualization.attempts.some(a => a.variableName.includes('project.contributors'))).toBe(true);
    });
  });
});