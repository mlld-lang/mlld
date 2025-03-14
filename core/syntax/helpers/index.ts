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

/**
 * Creates a DirectiveNode from example code string
 * 
 * @param code - The directive code to parse
 * @returns The parsed DirectiveNode
 */
export async function createNodeFromExample(code: string): Promise<any> {
  try {
    const { parse } = await import('@core/ast');
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

export { meld };
export * from './types'; 