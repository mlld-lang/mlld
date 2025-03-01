# Meld Syntax Example Consolidation Strategy

## Overview

This document outlines a strategy for consolidating all Meld syntax examples identified in the syntax audit into a composable system where complex examples can build upon simpler ones. This approach supports the 1.0 release while enabling progressive enhancements.

## Core Principles

1. **Atomic Examples**: Create small, focused examples that demonstrate one concept clearly
2. **Composition**: Build complex examples by composing simpler ones
3. **Progressive Complexity**: Organize examples from simple to complex
4. **Consistent Structure**: Use uniform organization across all directive types
5. **Test-Driven**: Ensure examples meet testing needs
6. **Ship Now, Enhance Later**: Focus on essentials for 1.0, plan for enhancements

## Example Architecture

### 1. Primary Building Blocks (Atomic Examples)

Create fundamental examples for each directive type:

```typescript
// text.ts - Basic Examples
export const basicDefinitions = {
  simpleString: createExample(
    'Basic text directive with string literal',
    `@text greeting = "Hello"`
  ),
  
  simpleTemplate: createExample(
    'Basic text directive with template literal',
    `@text message = \`Template content\``
  )
};

// More examples for other directives following the same pattern
```

### 2. Composition System (Ship 1.0)

For 1.0, implement a simple concatenation-based approach:

```typescript
/**
 * Combines multiple examples into a single example
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
```

Example usage:

```typescript
// From text.ts
export const combinedExamples = {
  interpolation: combineExamples(
    'Text interpolation with multiple variables',
    basicDefinitions.simpleString,
    createExample('Second variable', `@text subject = "World"`),
    createExample(
      'Interpolated message',
      `@text message = \`{{greeting}}, {{subject}}!\``
    )
  )
};
```

### 3. Context Management System (Post-1.0)

After 1.0, enhance with a context-aware composition system:

```typescript
/**
 * An example with execution context
 */
export interface ContextualExample extends SyntaxExample {
  /** Variables defined by this example */
  defines?: string[];
  /** Variables referenced by this example */
  references?: string[];
  /** Tags for categorization */
  tags?: string[];
}

/**
 * Creates examples that build upon each other
 */
export function composeWithContext(
  description: string,
  baseExamples: ContextualExample[],
  additionalCode: string
): ContextualExample {
  // Ensure references from new code are defined in baseExamples
  // Track variables defined in final example
  // Build code combining baseExamples and additionalCode
  
  return {
    code: combinedCode,
    description,
    defines: allDefinedVars,
    references: allReferencedVars
  };
}
```

## Consolidation Strategy by Example Types

### 1. Directive Type Examples

#### Text Directive

**Basic Examples**:
- Simple string definition
- Template string definition
- String with escaped characters

**Intermediate Examples**:
- Text referencing variables
- Text with multiple interpolations

**Advanced Examples**:
- Text referencing nested object properties
- Text combining multiple complex references

#### Data Directive

**Basic Examples**:
- Simple object definition
- Simple array definition
- Primitive value (number)

**Intermediate Examples**:
- Nested objects
- Arrays of objects

**Advanced Examples**:
- Complex nested structures
- Mixed array types

#### Similar pattern for other directives (Path, Import, Run, Embed, Define)

### 2. Variable Reference Examples

**Basic References**:
- Direct variable reference (`{{variable}}`)

**Field Access**:
- Object property access (`{{object.property}}`)
- Nested property access (`{{object.nested.property}}`)

**Array Access**:
- Array element access (`{{array[0]}}`)
- Variable index access (`{{array[indexVar]}}`)
- Combined object/array access (`{{users[0].name}}`)

### 3. Integration Examples

**Simple Combinations**:
- Text + Data variables
- Define + Run directives

**Complex Workflows**:
- Import with variable resolution
- Multi-directive patterns
- Combined reference types

## Implementation Plan for Ship 1.0

### Phase 1: Core Infrastructure

1. Implement the basic helper utilities:
   - `createExample` function
   - `combineExamples` function
   - Dedent utility for consistent formatting

2. Create base example collections for priority directives:
   - `text.ts`: Text directive examples from the audit
   - `data.ts`: Data directive examples
   - `import.ts`: Import directive examples

### Phase 2: Composability Layer

1. Implement simple composition using the concatenation approach
2. Create combined examples for common patterns
3. Ensure all examples from the audit are represented

### Phase 3: Test Integration

1. Create test utilities that leverage the consolidated examples
2. Migrate critical tests to use the new examples
3. Validate composition with real test cases

## Example: Progressive Implementation of Text Directive Examples

```typescript
// text.ts - Ship 1.0 Version

import { 
  MeldParseError, 
  MeldResolutionError,
  ErrorSeverity
} from '../../errors';
import { createExample, createInvalidExample, combineExamples } from './helpers';

// 1. Atomic Examples
export const atomic = {
  // Basic string literals
  simpleString: createExample(
    'Basic text string literal',
    `@text greeting = "Hello"`
  ),
  
  templateString: createExample(
    'Basic text template literal',
    `@text message = \`Template content\``
  ),
  
  // Basic variable reference
  simpleSubject: createExample(
    'Basic second variable',
    `@text subject = "World"`
  )
};

// 2. Simple Combinations
export const combinations = {
  interpolation: combineExamples(
    'Text with variable interpolation',
    atomic.simpleString,
    atomic.simpleSubject,
    createExample(
      'Interpolated message',
      `@text message = \`{{greeting}}, {{subject}}!\``
    )
  )
};

// 3. Invalid Examples
export const invalid = {
  unclosedString: createInvalidExample(
    'Missing closing quotation mark',
    `@text greeting = "unclosed string`,
    {
      type: MeldParseError,
      severity: ErrorSeverity.Fatal,
      code: 'SYNTAX_ERROR',
      message: 'Unclosed string literal'
    }
  ),
  
  undefinedVariable: createInvalidExample(
    'Reference to undefined variable',
    `@text message = \`Hello, {{undefined_var}}!\``,
    {
      type: MeldResolutionError,
      severity: ErrorSeverity.Recoverable,
      code: 'UNDEFINED_VARIABLE',
      message: 'Variable "undefined_var" is not defined'
    }
  )
};

// Export all together
export const textDirectiveExamples = {
  atomic,
  combinations,
  invalid
};
```

## Post-1.0 Enhancements

1. **Context-Aware Composition**:
   - Track variables defined and referenced in examples
   - Validate references at composition time
   - Better organize prerequisites

2. **Variable Tracking**:
   - Analyze examples to extract defined variables
   - Generate dependency graphs between examples

3. **Categorization and Discovery**:
   - Tag examples by feature, complexity, and use case
   - Create an example browser for testing and documentation

4. **Example Validation**:
   - Runtime validation to ensure examples are syntactically correct
   - Automated testing of all examples

## Example Usage in Tests

```typescript
import { textDirectiveExamples } from '../../core/constants/syntax/text';

describe('TextDirectiveHandler', () => {
  // Test basic examples individually
  Object.entries(textDirectiveExamples.atomic).forEach(([name, example]) => {
    it(`should handle basic ${name} correctly`, async () => {
      const result = await textDirectiveHandler.parse(example.code);
      expect(result).toBeDefined();
    });
  });
  
  // Test combined examples
  it('should handle variable interpolation', async () => {
    const result = await processFullExample(
      textDirectiveExamples.combinations.interpolation.code
    );
    expect(result).toContain('Hello, World!');
  });
  
  // Test invalid examples
  it('should reject invalid syntax', async () => {
    await expectThrowsWithSeverity(
      () => textDirectiveHandler.parse(textDirectiveExamples.invalid.unclosedString.code),
      MeldParseError,
      ErrorSeverity.Fatal
    );
  });
});
```

## Conclusion

This consolidation strategy provides a clear path to:

1. Create a DRY, composable example system for 1.0
2. Represent all examples from the syntax audit
3. Support effective testing
4. Enable progressive enhancement after 1.0
5. Maintain a clean, understandable structure

By implementing this approach, we can ship 1.0 with a solid foundation while setting the stage for more advanced features in future releases. 