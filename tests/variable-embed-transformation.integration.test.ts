import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestContextDI } from '@tests/utils/di/TestContextDI';
import type { MeldNode, TextNode } from '@core/syntax/types/shared-types';
import { 
  embedDirectiveExamples, 
  textDirectiveExamples,
  dataDirectiveExamples, 
  combineExamples
} from '@core/syntax/index';
import { main } from '@api/index';
import type { Services } from '@core/types/services';

describe('Variable-Based Embed Transformation Integration Tests', () => {
  let context: TestContextDI;

  beforeEach(async () => {
    context = TestContextDI.create();
    await context.initialize();
    
    // Enable transformation with specific options
    context.enableTransformation({
      variables: true,
      directives: true,
      commands: true,
      imports: true
    });
  });

  afterEach(async () => {
    await context?.cleanup();
  });

  describe('Basic variable embed transformation', () => {
    it('should correctly transform a variable-based embed directive with a text variable', async () => {
      // Using the withVariableContent example from embedDirectiveExamples
      const textVarExample = textDirectiveExamples.atomic.simpleString;
      const embedExample = embedDirectiveExamples.atomic.withVariableContent;
      
      // Combine examples with additional content
      const content = combineExamples(
        'Text variable with embed',
        textVarExample,
        { code: '\n# Document with Variable Embed\n', description: 'Heading' },
        embedExample,
        { code: '\nAdditional content', description: 'Footer' }
      ).code;

      // Write content to a file
      const testFilePath = 'variable-embed-test-1.meld';
      await context.services.filesystem.writeFile(testFilePath, content);
      
      // Process the file with transformation enabled and specify markdown format
      const result = await main(testFilePath, {
        transformation: true,
        format: 'markdown',
        services: context.services as unknown as Partial<Services>,
        fs: context.services.filesystem
      });
      
      // Verify the output contains the embedded content
      expect(result).toContain('# Document with Variable Embed');
      expect(result).toContain('Additional content');
      
      // Make sure the directive itself is not visible in the output
      expect(result).not.toContain('@embed');
    });

    it('should correctly transform a variable-based embed directive with a data variable', async () => {
      // Using the withDataVariableContent example from embedDirectiveExamples
      const dataExample = dataDirectiveExamples.atomic.simpleObject;
      const dataReferenceExample = dataDirectiveExamples.atomic.fieldReference;
      const embedExample = embedDirectiveExamples.atomic.withDataVariableContent;
      
      // Create a custom data example for our specific test
      const customDataExample = {
        code: `@data config = {
  "title": "My Document",
  "author": "Test User"
}`,
        description: 'Custom data object'
      };
      
      // Combine examples
      const content = combineExamples(
        'Data variable with embed',
        customDataExample,
        { code: '\n# {{config.title}}\n', description: 'Heading with data reference' },
        { code: '@embed {{config.author}}\n', description: 'Embed with data reference' },
        { code: '\nCreated by the author above.', description: 'Footer' }
      ).code;

      // Write content to a file
      const testFilePath = 'variable-embed-test-2.meld';
      await context.services.filesystem.writeFile(testFilePath, content);
      
      // Process the file with transformation enabled and specify markdown format
      const result = await main(testFilePath, {
        transformation: true,
        format: 'markdown',
        services: context.services as unknown as Partial<Services>,
        fs: context.services.filesystem
      });
      
      // Verify the output contains the embedded content
      expect(result).toContain('# My Document');
      expect(result).toContain('Test User');
      expect(result).toContain('Created by the author above.');
      
      // Make sure the directive itself is not visible in the output
      expect(result).not.toContain('@embed');
    });
  });

  describe('Field access in variable embed transformation', () => {
    it('should correctly transform an embed directive with complex object field access', async () => {
      // Create a custom data example with nested objects for field access testing
      const customDataExample = {
        code: `@data userData = {
  "user": {
    "name": "Jane Doe",
    "profile": {
      "bio": "Software engineer with 5 years of experience.",
      "skills": ["TypeScript", "React", "Node.js"],
      "contact": {
        "email": "jane.doe@example.com",
        "phone": "555-1234"
      }
    }
  }
}`,
        description: 'Complex nested data object'
      };
      
      // Combine with embed directives
      const content = combineExamples(
        'Complex field access',
        customDataExample,
        { code: '\n# User Profile\n', description: 'Main heading' },
        { code: '@embed {{userData.user.profile.bio}}\n', description: 'Bio embed' },
        { code: '\n## Contact Information\n', description: 'Contact heading' },
        { code: '@embed {{userData.user.profile.contact.email}}\n', description: 'Email embed' },
        { code: '\n## Skills\n', description: 'Skills heading' },
        { code: '@embed {{userData.user.profile.skills}}', description: 'Skills embed' }
      ).code;

      // Write content to a file
      const testFilePath = 'variable-embed-test-3.meld';
      await context.services.filesystem.writeFile(testFilePath, content);
      
      // Process the file with transformation enabled and specify markdown format
      const result = await main(testFilePath, {
        transformation: true,
        format: 'markdown',
        services: context.services as unknown as Partial<Services>,
        fs: context.services.filesystem
      });
      
      // Verify the output contains the embedded content with proper field access
      expect(result).toContain('# User Profile');
      expect(result).toContain('Software engineer with 5 years of experience.');
      expect(result).toContain('## Contact Information');
      expect(result).toContain('jane.doe@example.com');
      expect(result).toContain('## Skills');
      
      // For array content, verify it's included in some form
      expect(result).toContain('TypeScript');
      expect(result).toContain('React');
      expect(result).toContain('Node.js');
      
      // Make sure the directives are not visible in the output
      expect(result).not.toContain('@embed');
    });

    it('should correctly format arrays and objects in variable embeds', async () => {
      // Create a custom data example with arrays and nested objects
      const customDataExample = {
        code: `@data complexData = {
  "nestedObject": {
    "array": [1, 2, 3, 4, 5],
    "deepNested": {
      "moreNested": {
        "evenMore": {
          "finalLevel": "Found me!"
        }
      }
    }
  },
  "mixedArray": [
    {"name": "Item 1"},
    {"name": "Item 2"},
    42,
    "string item"
  ]
}`,
        description: 'Complex data with arrays and nested objects'
      };
      
      // Combine with embed directives
      const content = combineExamples(
        'Array and object formatting',
        customDataExample,
        { code: '\n## Array Embedding\n', description: 'Array heading' },
        { code: '@embed {{complexData.nestedObject.array}}\n', description: 'Array embed' },
        { code: '\n## Mixed Array\n', description: 'Mixed array heading' },
        { code: '@embed {{complexData.mixedArray}}\n', description: 'Mixed array embed' },
        { code: '\n## Deep Nesting\n', description: 'Deep nesting heading' },
        { code: '@embed {{complexData.nestedObject.deepNested.moreNested.evenMore.finalLevel}}\n', description: 'Deep nested field' },
        { code: '\n## Full Object\n', description: 'Full object heading' },
        { code: '@embed {{complexData}}', description: 'Full object embed' }
      ).code;

      // Write content to a file
      const testFilePath = 'variable-embed-test-4.meld';
      await context.services.filesystem.writeFile(testFilePath, content);
      
      // Process the file with transformation enabled and specify markdown format
      const result = await main(testFilePath, {
        transformation: true,
        format: 'markdown',
        services: context.services as unknown as Partial<Services>,
        fs: context.services.filesystem
      });
      
      // Verify array formatting
      expect(result).toContain('## Array Embedding');
      expect(result).toContain('1');
      expect(result).toContain('2');
      expect(result).toContain('3');
      expect(result).toContain('4');
      expect(result).toContain('5');
      
      // Verify mixed array formatting
      expect(result).toContain('## Mixed Array');
      expect(result).toContain('Item 1');
      expect(result).toContain('Item 2');
      expect(result).toContain('42');
      expect(result).toContain('string item');
      
      // Verify deep nesting access
      expect(result).toContain('## Deep Nesting');
      expect(result).toContain('Found me!');
      
      // Verify full object embedding with proper formatting
      expect(result).toContain('## Full Object');
      expect(result).toContain('nestedObject');
      expect(result).toContain('mixedArray');
      
      // Make sure the directives are not visible in the output
      expect(result).not.toContain('@embed');
    });
  });
}); 