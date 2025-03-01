import { describe, it, expect } from 'vitest';
import { 
  textDirectiveExamples, 
  dataDirectiveExamples,
  importDirectiveExamples,
  pathDirectiveExamples,
  defineDirectiveExamples,
  integrationExamples
} from '@core/constants/syntax';
import { SyntaxExample, InvalidSyntaxExample } from '@core/constants/syntax/helpers';
import { ErrorSeverity } from '@core/errors/index.js';

// Define a type to reference the available directive example groups
export type DirectiveType = 'text' | 'data' | 'import' | 'path' | 'define' | 'integration';

// Map directive types to their example groups
const directiveExamples = {
  text: textDirectiveExamples,
  data: dataDirectiveExamples,
  import: importDirectiveExamples,
  path: pathDirectiveExamples,
  define: defineDirectiveExamples,
  integration: integrationExamples
};

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
): SyntaxExample {
  return directiveExamples[directiveType][category][exampleKey];
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