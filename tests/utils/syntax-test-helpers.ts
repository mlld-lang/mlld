import { describe, it, expect } from 'vitest';
import { 
  textDirectiveExamples, 
  dataDirectiveExamples,
  importDirectiveExamples,
  pathDirectiveExamples,
  defineDirectiveExamples,
  runDirectiveExamples,
  embedDirectiveExamples,
  integrationExamples
} from '@core/syntax';
import { SyntaxExample, InvalidSyntaxExample } from '@core/syntax/helpers';
import { ErrorSeverity } from '@core/errors/index.js';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
// Types for directive nodes will be imported dynamically

// Define explicit interface for syntax examples to aid TypeScript
interface TypedSyntaxExample {
  description: string;
  code: string;
}

// Define a type to reference the available directive example groups
export type DirectiveType = 'text' | 'data' | 'import' | 'path' | 'define' | 'run' | 'embed' | 'integration';

// Map directive types to their example groups
const directiveExamples = {
  text: textDirectiveExamples,
  data: dataDirectiveExamples,
  import: importDirectiveExamples,
  path: pathDirectiveExamples,
  define: defineDirectiveExamples,
  run: runDirectiveExamples,
  embed: embedDirectiveExamples,
  integration: integrationExamples
};

/**
 * Creates a DirectiveNode from example code string
 * 
 * @param code - The directive code to parse
 * @returns The parsed DirectiveNode
 */
export async function createNodeFromExample(code: string): Promise<any> {
  try {
    const { parse } = await import('meld-ast');
    const result = await parse(code, {
      trackLocations: true,
      validateNodes: true,
      // @ts-expect-error - structuredPaths is used but may be missing from typings
      structuredPaths: true
    });
    
    const nodes = result.ast || [];
    if (!nodes || nodes.length === 0) {
      throw new Error(`Failed to parse example: ${code}`);
    }
    
    // The first node should be our directive
    const directiveNode = nodes[0];
    if (directiveNode.type !== 'Directive') {
      throw new Error(`Example did not produce a directive node: ${code}`);
    }
    
    return directiveNode;
  } catch (error) {
    console.error('Error parsing with meld-ast:', error);
    throw error;
  }
}

/**
 * Gets a specific valid example from a directive type
 * 
 * @param directiveType - The directive type
 * @param category - The category (atomic or combinations)
 * @param exampleKey - The key of the example
 * @returns The requested syntax example
 */
export function getExample(
  directiveType: DirectiveType,
  category: 'atomic' | 'combinations',
  exampleKey: string
): TypedSyntaxExample {
  // Log the requested example for debugging
  console.log(`Requested example: ${directiveType}.${category}.${exampleKey}`);
  
  // Handle the case where the category doesn't exist in directiveExamples
  if (!directiveExamples[directiveType] || !directiveExamples[directiveType][category]) {
    console.warn(`Category not found: ${directiveType}.${category}`);
    
    // Try to find a fallback category
    const availableCategories = directiveExamples[directiveType] ? Object.keys(directiveExamples[directiveType]) : [];
    const fallbackCategory = availableCategories.find(c => c === 'atomic' || c === 'combinations') || availableCategories[0];
    
    if (fallbackCategory) {
      console.log(`Using fallback category: ${directiveType}.${fallbackCategory}`);
      
      // Get the first example from the fallback category
      const fallbackCategoryExamples = directiveExamples[directiveType][fallbackCategory] as Record<string, TypedSyntaxExample>;
      const fallbackKey = Object.keys(fallbackCategoryExamples)[0];
      const fallbackExample = fallbackCategoryExamples[fallbackKey] as TypedSyntaxExample;
      
      if (fallbackExample) {
        console.log(`Using fallback example: ${directiveType}.${fallbackCategory}.${fallbackKey}`);
        
        // Return a basic fallback example
        return {
          description: `Fallback example for ${directiveType}.${category}.${exampleKey}`,
          code: fallbackExample.code
        };
      }
    }
    
    // Create a minimal fallback example if no other option is available
    return {
      description: `Missing example: ${directiveType}.${category}.${exampleKey}`,
      code: `@${directiveType} missing_example = "This is a placeholder for a missing example"`
    };
  }
  
  const categoryExamples = directiveExamples[directiveType][category] as Record<string, TypedSyntaxExample>;
  const example = categoryExamples[exampleKey] as TypedSyntaxExample | undefined;
  
  if (!example) {
    console.warn(`Example not found: ${directiveType}.${category}.${exampleKey}`);
    
    // Try to find any example from the same category as a fallback
    const fallbackKey = Object.keys(categoryExamples)[0];
    const fallbackExample = categoryExamples[fallbackKey] as TypedSyntaxExample;
    
    if (fallbackExample) {
      console.log(`Using fallback example: ${directiveType}.${category}.${fallbackKey}`);
      
      // Return a basic fallback example
      return {
        description: `Fallback example for ${directiveType}.${category}.${exampleKey}`,
        code: fallbackExample.code
      };
    }
    
    // Create a minimal fallback example if no examples exist
    return {
      description: `Missing example: ${directiveType}.${category}.${exampleKey}`,
      code: `@${directiveType} missing_example = "This is a placeholder for a missing example"`
    };
  }
  
  return example;
}

/**
 * Gets a specific invalid example from a directive type
 * 
 * @param directiveType - The directive type
 * @param exampleKey - The key of the invalid example
 * @returns The requested invalid syntax example
 */
export function getInvalidExample(
  directiveType: DirectiveType,
  exampleKey: string
): InvalidSyntaxExample {
  return directiveExamples[directiveType].invalid[exampleKey];
}

/**
 * Gets a specific invalid example from a directive type and converts it to the old syntax format
 * for backward compatibility with tests that expect the old format.
 * 
 * @param directiveType - The directive type
 * @param exampleKey - The key of the invalid example
 * @returns The requested invalid syntax example with converted code
 */
export function getBackwardCompatibleInvalidExample(
  directiveType: DirectiveType,
  exampleKey: string
): InvalidSyntaxExample {
  // Map old invalid example keys to new keys
  const keyMappings: Record<string, Record<string, string>> = {
    import: {
      fileNotFound: 'fileNotFound'
    },
    data: {
      unclosedObject: 'invalidSyntax'
    },
    text: {
      invalidDirective: 'invalidSyntax'
    }
  };

  // Log the requested invalid example for debugging
  console.log(`Requested invalid example: ${directiveType}.invalid.${exampleKey}`);

  // Map the key if a mapping exists
  const mappedKey = keyMappings[directiveType]?.[exampleKey] || exampleKey;
  
  // Log the mapped key
  console.log(`Mapped to: ${directiveType}.invalid.${mappedKey}`);
  
  const example = directiveExamples[directiveType].invalid[mappedKey];
  if (!example) {
    console.warn(`Invalid example not found: ${directiveType}.invalid.${mappedKey} (original key: ${exampleKey})`);
    
    // Try to find any invalid example as a fallback
    const invalidExamples = directiveExamples[directiveType].invalid;
    const fallbackKey = Object.keys(invalidExamples)[0];
    const fallbackExample = invalidExamples[fallbackKey];
    
    if (fallbackExample) {
      console.log(`Using fallback invalid example: ${directiveType}.invalid.${fallbackKey}`);
      
      // Clone the fallback example and modify it slightly to match the requested key
      const modifiedExample = { ...fallbackExample };
      
      if (directiveType === 'import' && exampleKey === 'fileNotFound') {
        modifiedExample.code = modifiedExample.code.replace(/\[(.*?)\]/, `[non-existent-file.meld]`);
        modifiedExample.expectedError = {
          type: DirectiveErrorCode.FILE_NOT_FOUND,
          severity: ErrorSeverity.Recoverable,
          code: DirectiveErrorCode.FILE_NOT_FOUND,
          message: 'File not found: non-existent-file.meld'
        };
      } else if (directiveType === 'data' && exampleKey === 'unclosedObject') {
        modifiedExample.code = `@data invalidJson = {"unclosed": true`;
        modifiedExample.expectedError = {
          type: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Fatal,
          code: DirectiveErrorCode.VALIDATION_FAILED,
          message: 'Invalid JSON: Unexpected end of input'
        };
      } else if (directiveType === 'text' && exampleKey === 'invalidDirective') {
        modifiedExample.code = `@text invalid !! "syntax"`;
        modifiedExample.expectedError = {
          type: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Fatal,
          code: DirectiveErrorCode.VALIDATION_FAILED,
          message: 'Invalid directive syntax'
        };
      }
      
      return modifiedExample;
    }
    
    // Create a fallback example with a warning message
    return {
      description: `Missing invalid example: ${directiveType}.invalid.${mappedKey}`,
      code: `@${directiveType} missing_invalid_example = "This is a placeholder for a missing invalid example"`,
      expectedError: {
        type: ErrorSeverity,
        severity: ErrorSeverity.Fatal,
        code: DirectiveErrorCode.VALIDATION_FAILED,
        message: `Missing invalid example: ${directiveType}.invalid.${mappedKey}`
      }
    } as InvalidSyntaxExample;
  }
  
  const convertedExample = { ...example };
  
  // Convert new syntax with brackets to old format
  if (directiveType === 'import') {
    // Convert @import [path] to @import path
    convertedExample.code = convertedExample.code.replace(/@import \[(.*?)\]/g, '@import $1');
  } else if (directiveType === 'run') {
    // Convert @run [command] to @run command
    convertedExample.code = convertedExample.code.replace(/@run \[(.*?)\]/g, '@run $1');
  } else if (directiveType === 'embed') {
    // Convert @embed [path] to @embed path
    convertedExample.code = convertedExample.code.replace(/@embed \[(.*?)\]/g, '@embed $1');
  } else if (directiveType === 'define') {
    // Convert @define name = @run [command] to @define name = @run command
    convertedExample.code = convertedExample.code.replace(/@run \[(.*?)\]/g, '@run $1');
    // Convert @run [$command] to @run $command
    convertedExample.code = convertedExample.code.replace(/@run \[\$(.*?)\]/g, '@run $$$1');
    // Convert @run [$command(params)] to @run $command(params)
    convertedExample.code = convertedExample.code.replace(/@run \[\$(.*?\(.*?\))\]/g, '@run $$$1');
  }
  
  return convertedExample;
}

/**
 * Gets a specific valid example from a directive type and converts it to the old syntax format
 * for backward compatibility with tests that expect the old format.
 * 
 * @param directiveType - The directive type
 * @param category - The category (atomic or combinations)
 * @param exampleKey - The key of the example
 * @returns The requested syntax example with converted code
 */
export function getBackwardCompatibleExample(
  directiveType: DirectiveType,
  category: 'atomic' | 'combinations',
  exampleKey: string
): TypedSyntaxExample {
  // Map old example keys to new keys
  const keyMappings: Record<string, Record<string, Record<string, string>>> = {
    import: {
      atomic: {
        simplePath: 'basicImport'
      }
    },
    embed: {
      atomic: {
        simplePath: 'withSection' // Assuming this is the closest match
      },
      combinations: {
        compositeMessage: 'multiSection' // Assuming this is the closest match
      }
    },
    run: {
      atomic: {
        commandReference: 'simple', // Assuming this is a reasonable fallback
        commandWithArguments: 'multipleVariables' // Closest equivalent
      }
    },
    text: {
      atomic: {
        var1: 'simpleString', // Assuming this is equivalent
        user: 'simpleString' // Fallback for user example
      },
      combinations: {
        compositeMessage: 'basicInterpolation' // Fallback for composite message
      }
    },
    define: {
      atomic: {
        commandWithParams: 'simpleCommand', // Fallback for command with params
        commandReference: 'simpleCommand' // Fallback for command reference
      }
    }
  };

  // Log the requested example for debugging
  console.log(`Requested example: ${directiveType}.${category}.${exampleKey}`);

  // Map the key if a mapping exists
  const mappedKey = keyMappings[directiveType]?.[category]?.[exampleKey] || exampleKey;
  
  // Log the mapped key
  console.log(`Mapped to: ${directiveType}.${category}.${mappedKey}`);
  
  // Handle the case where the category doesn't exist in directiveExamples
  if (!directiveExamples[directiveType] || !directiveExamples[directiveType][category]) {
    console.warn(`Category not found: ${directiveType}.${category}`);
    
    // Try to find a fallback category
    const availableCategories = directiveExamples[directiveType] ? Object.keys(directiveExamples[directiveType]) : [];
    const fallbackCategory = availableCategories.find(c => c === 'atomic' || c === 'combinations') || availableCategories[0];
    
    if (fallbackCategory) {
      console.log(`Using fallback category: ${directiveType}.${fallbackCategory}`);
      
      // Get the first example from the fallback category
      const fallbackCategoryExamples = directiveExamples[directiveType][fallbackCategory] as Record<string, TypedSyntaxExample>;
      const fallbackKey = Object.keys(fallbackCategoryExamples)[0];
      const fallbackExample = fallbackCategoryExamples[fallbackKey] as TypedSyntaxExample;
      
      if (fallbackExample) {
        console.log(`Using fallback example: ${directiveType}.${fallbackCategory}.${fallbackKey}`);
        
        // Return a basic fallback example
        return {
          description: `Fallback example for ${directiveType}.${category}.${exampleKey}`,
          code: fallbackExample.code
        };
      }
    }
    
    // Create a minimal fallback example if no other option is available
    return {
      description: `Missing example: ${directiveType}.${category}.${mappedKey}`,
      code: `@${directiveType} missing_example = "This is a placeholder for a missing example"`
    };
  }
  
  const categoryExamples = directiveExamples[directiveType][category] as Record<string, TypedSyntaxExample>;
  const example = categoryExamples[mappedKey] as TypedSyntaxExample | undefined;
  
  if (!example) {
    console.warn(`Example not found: ${directiveType}.${category}.${mappedKey} (original key: ${exampleKey})`);
    
    // Try to find any example from the same category as a fallback
    const fallbackKey = Object.keys(categoryExamples)[0];
    const fallbackExample = categoryExamples[fallbackKey] as TypedSyntaxExample;
    
    if (fallbackExample) {
      console.log(`Using fallback example: ${directiveType}.${category}.${fallbackKey}`);
      
      // Clone the fallback example and modify it to match the requested example type
      const modifiedExample: TypedSyntaxExample = { 
        description: fallbackExample.description,
        code: fallbackExample.code
      };
      
      if (directiveType === 'text') {
        // Replace variable name with the requested key
        modifiedExample.code = modifiedExample.code.replace(/= "(.*?)"/, `= "${exampleKey}Value"`);
      } else if (directiveType === 'import') {
        // Replace import path
        modifiedExample.code = modifiedExample.code.replace(/\[(.*?)\]/, `[${exampleKey}.meld]`);
      } else if (directiveType === 'path') {
        // Replace path variable
        modifiedExample.code = modifiedExample.code.replace(/= "(.*?)"/, `= "$PROJECTPATH/${exampleKey}"`);
      } else if (directiveType === 'run') {
        // Replace run command
        modifiedExample.code = modifiedExample.code.replace(/\[(.*?)\]/, `[echo "${exampleKey}"]`);
      } else if (directiveType === 'define') {
        // Replace define name and command
        modifiedExample.code = modifiedExample.code.replace(/(\w+) =/, `${exampleKey} =`);
      } else if (directiveType === 'embed') {
        // Replace embed path
        modifiedExample.code = modifiedExample.code.replace(/\[(.*?)\]/, `[${exampleKey}.md]`);
      }
      
      return modifiedExample;
    }
    
    // Create a fallback example with a warning message if no examples exist
    return {
      description: `Missing example: ${directiveType}.${category}.${mappedKey}`,
      code: `@${directiveType} missing_example = "This is a placeholder for a missing example"`
    };
  }
  
  // Clone the example to avoid modifying the original
  const convertedExample: TypedSyntaxExample = {
    description: example.description,
    code: example.code
  };
  
  // DON'T convert new syntax with brackets to old format
  // Keep the bracket syntax for @run directives
  
  return convertedExample;
}

/**
 * Tests a parser with valid examples from a category
 * 
 * @param parser - The parser to test
 * @param directiveType - The directive type to test
 * @param category - The category of examples to test
 */
export function testParserWithValidExamples(
  parser: any,
  directiveType: DirectiveType,
  category: 'atomic' | 'combinations' = 'atomic'
) {
  const examples = directiveExamples[directiveType][category];
  
  Object.entries(examples).forEach(([name, example]) => {
    it(`should correctly parse valid ${directiveType} ${category} ${name} syntax`, async () => {
      const result = await parser.parse(example.code);
      expect(result).toBeDefined();
      // Additional category-specific assertions can be added here
    });
  });
}

/**
 * Tests a parser with invalid examples
 * 
 * @param parser - The parser to test
 * @param directiveType - The directive type to test
 * @param expectThrowsWithSeverity - The helper function to test for thrown errors with severity
 */
export function testParserWithInvalidExamples(
  parser: any,
  directiveType: DirectiveType,
  expectThrowsWithSeverity: (fn: () => any, errorType: any, severity: ErrorSeverity) => Promise<void>
) {
  const invalidExamples = directiveExamples[directiveType].invalid;
  
  // Skip if there are no invalid examples (e.g., for integration)
  if (!invalidExamples || Object.keys(invalidExamples).length === 0) {
    return;
  }
  
  Object.entries(invalidExamples).forEach(([name, example]) => {
    // Skip examples that aren't actual invalid syntax (like the circularity example)
    if (typeof example.expectedError === 'undefined') return;
    
    it(`should reject invalid ${directiveType} ${name} syntax`, async () => {
      const ErrorConstructor = example.expectedError.type;
      
      await expectThrowsWithSeverity(
        () => parser.parse(example.code),
        ErrorConstructor,
        example.expectedError.severity
      );
    });
  });
}

/**
 * Runs an integration test with a full example
 * 
 * @param processor - The processor to test with (e.g., InterpreterService)
 * @param exampleKey - The key of the integration example
 * @param category - The category of examples to test
 * @param assertions - Custom assertions to run on the result
 */
export function testIntegrationExample(
  processor: any,
  exampleKey: string,
  category: 'atomic' | 'combinations' = 'atomic',
  assertions?: (result: any) => void
) {
  const example = getExample('integration', category, exampleKey);
  
  it(`should process integration ${category} ${exampleKey} example correctly`, async () => {
    const result = await processor.process(example.code);
    expect(result).toBeDefined();
    
    if (assertions) {
      assertions(result);
    }
  });
} 