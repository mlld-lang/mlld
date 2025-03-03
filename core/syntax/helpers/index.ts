import { meld } from '@core/syntax/helpers/dedent';
import { SyntaxExample, InvalidSyntaxExample } from '@core/syntax/helpers/types';

/**
 * Creates a valid syntax example
 * 
 * @param description - Description of what the example demonstrates
 * @param codeTemplate - Template string containing the example code
 * @param values - Values to interpolate into the template
 * @returns A SyntaxExample object
 */
export function createExample(
  description: string,
  codeTemplate: TemplateStringsArray | string,
  ...values: any[]
): SyntaxExample {
  const code = typeof codeTemplate === 'string' 
    ? codeTemplate 
    : meld(codeTemplate, ...values);
    
  return {
    code,
    description
  };
}

/**
 * Creates an invalid syntax example with expected error information
 * 
 * @param description - Description of what the invalid example demonstrates
 * @param codeTemplate - Template string containing the invalid code
 * @param expectedError - Information about the expected error
 * @param values - Values to interpolate into the template
 * @returns An InvalidSyntaxExample object
 */
export function createInvalidExample(
  description: string,
  codeTemplate: TemplateStringsArray | string,
  expectedError: InvalidSyntaxExample['expectedError'],
  ...values: any[]
): InvalidSyntaxExample {
  const code = typeof codeTemplate === 'string' 
    ? codeTemplate 
    : meld(codeTemplate, ...values);
    
  return {
    code,
    description,
    expectedError
  };
}

/**
 * Combines multiple examples into a single example
 * 
 * @param description - Description of the combined example
 * @param examples - Individual examples to combine
 * @returns A combined SyntaxExample object
 */
export function combineExamples(
  description: string,
  ...examples: SyntaxExample[]
): SyntaxExample {
  return {
    code: examples.map(ex => ex.code).join('\n'),
    description
  };
}

export { meld };
export * from './types'; 