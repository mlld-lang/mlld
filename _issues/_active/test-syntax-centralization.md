# Meld Syntax Centralization Plan

## Migration Status Summary

### DirectiveHandler Tests
- ✅ All handler test files for core directives have been migrated to use centralized syntax:
  - ✅ TextDirectiveHandler
  - ✅ DataDirectiveHandler
  - ✅ PathDirectiveHandler
  - ✅ DefineDirectiveHandler
  - ✅ RunDirectiveHandler
  - ✅ ImportDirectiveHandler
  - ✅ EmbedDirectiveHandler

### Tests Still Needing Migration
- 🔲 Service tests with Meld syntax:
  - ✅ `services/resolution/ResolutionService/ResolutionService.test.ts`
  - 🔲 `services/resolution/ResolutionService/resolvers/CommandResolver.test.ts`
  - 🔲 `services/cli/CLIService/CLIService.test.ts`
  - 🔲 `services/pipeline/OutputService/OutputService.test.ts`
  - 🔲 `services/pipeline/ParserService/ParserService.test.ts`
  - 🔲 `services/pipeline/InterpreterService/InterpreterService.integration.test.ts`

- 🔲 API and Integration tests:
  - 🔲 `api/api.test.ts`
  - 🔲 `api/integration.test.ts`

### Transformation Tests
- 🔲 DirectiveHandler transformation tests:
  - 🔲 `ImportDirectiveHandler.transformation.test.ts`
  - 🔲 `EmbedDirectiveHandler.transformation.test.ts`
  - 🔲 `RunDirectiveHandler.transformation.test.ts`

**Next Steps**:
- Migrate Service-level tests (ResolutionService, OutputService, etc.)
- Migrate API and Integration tests
- Address transformation tests for directive handlers
- Document patterns and best practices

**Key Challenges Identified**:
- Parser rejecting invalid syntax before handler tests
- Structural differences between manually created nodes and parser-generated nodes
- Different error handling patterns between test approaches
- API changes in newer meld-ast versions requiring handler adaptations
- Ensuring backward compatibility with older syntax patterns

## Import Requirements for Centralized Syntax

When using centralized syntax examples in tests, proper import paths are critical. Here's a comprehensive guide to ensure consistent and working imports across the codebase:

### Path Aliases vs. Relative Imports

**ALWAYS use path aliases** instead of relative imports. This ensures consistency and avoids path resolution issues:

```typescript
// ✅ CORRECT - Use path aliases
import { textDirectiveExamples } from '@core/constants/syntax/text';
import { ErrorSeverity } from '@core/errors';
import { getExample } from '@tests/utils/syntax-test-helpers.js';

// ❌ INCORRECT - Avoid relative imports
import { textDirectiveExamples } from '../../core/constants/syntax/text';
import { ErrorSeverity } from '../../errors';
import { getExample } from './syntax-test-helpers';
```

### Core Syntax Import Structure

When importing from the core syntax files, follow this pattern:

```typescript
// Import specific examples
import { textDirectiveExamples, dataDirectiveExamples } from '@core/constants/syntax';

// Import helper types
import { SyntaxExample, InvalidSyntaxExample } from '@core/constants/syntax/helpers';

// Import error types
import { ErrorSeverity } from '@core/errors';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
```

### Special Import Considerations

1. **Testing Utilities**: Always append `.js` extension when importing from test utils:
   ```typescript
   import { getExample, getInvalidExample } from '@tests/utils/syntax-test-helpers.js';
   ```

2. **DirectiveError and DirectiveErrorCode**: These must be imported from the services directory, not from core:
   ```typescript
   // ✅ CORRECT
   import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
   
   // ❌ INCORRECT
   import { DirectiveError, DirectiveErrorCode } from '@core/errors';
   ```

3. **Error Severity**: Import ErrorSeverity from core/errors:
   ```typescript
   import { ErrorSeverity } from '@core/errors';
   ```

### Common Issues and Solutions

1. **Cannot find module '@core/errors'**:
   - Ensure tsconfig.json has proper path aliases configured
   - Check that imports use the exact case sensitivity as the directory structure

2. **DirectiveErrorCode undefined errors**:
   - Make sure you're using valid error code enum values
   - Import DirectiveErrorCode from the correct location:
     ```typescript
     import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
     ```

3. **CommonJS modules in ES module context**:
   - When importing types, use proper import syntax:
     ```typescript
     import type { DirectiveNode } from 'meld-spec';
     ```

### Recommended Helper Import Pattern

For test files, use this standardized import pattern:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getExample, getInvalidExample } from '@tests/utils/syntax-test-helpers.js';

// If you need DirectiveError
import { DirectiveError } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';

// For your handler under test, use path aliases
import { YourDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/YourDirectiveHandler.js';
```

This section outlines the proper import requirements, ensuring all tests consistently use the centralized syntax examples.

## Introduction to Meld

Meld is a markdown preprocessing language that uses directives (prefixed with @) to add dynamic capabilities to markdown documents. This centralization plan aims to create a unified system for all syntax examples used in tests, ensuring consistency and maintainability.

A "syntax example" in this context is a code snippet that demonstrates valid or invalid Meld syntax, along with metadata like description and expected error information for invalid syntax.

## IMPORTANT: Primary Goal and Implementation Strategy

**The primary goal of this initiative is to use ONE centralized set of syntax examples from `core/constants/syntax` across ALL tests.**

**What this means:**
1. All tests should import examples from the centralized location
2. Tests should NOT create their own local duplicate examples
3. We should fix import issues that prevent using the centralized examples
4. We want ONE source of truth for all syntax examples

**What this does NOT mean:**
1. Creating local duplicated constants in test files
2. Bypassing import issues with temporary solutions
3. Maintaining parallel example systems

If you encounter import issues when trying to use the centralized examples, **fix the import issues first** before proceeding with migration.

## Current Implementation Status

As of May 2023, the following components have been implemented:

- ✅ Complete directory structure
- ✅ Core helper utilities (types.ts, dedent.ts, helpers index.ts)
- ✅ All directive files (text.ts, data.ts, import.ts, path.ts, run.ts, define.ts, embed.ts, codefence.ts, content.ts, comments.ts)
- ✅ Integration examples file
- ✅ Main index.ts exporting all examples

Components still pending implementation:
- Test utilities in tests/utils/syntax-test-helpers.ts
- Documentation for the syntax examples system

## Final Phase
- Migration of existing tests to use centralized examples from `core/constants/syntax`

## Goals

1. Create a single source of truth for all Meld syntax examples
2. Integrate syntax examples with the error handling system
3. Make syntax examples usable in tests
4. Support both correct and problematic syntax examples
5. Make the system maintainable and DRY

## Directory Structure

```
/core
  /constants
    /syntax
      /helpers
        index.ts       # Helper functions for creating examples
        dedent.ts      # Dedent functionality for multiline examples
        types.ts       # TypeScript types for syntax examples
      index.ts         # Exports all syntax examples
      define.ts        # @define directive examples
      run.ts           # @run directive examples
      import.ts        # @import directive examples
      text.ts          # @text directive examples
      data.ts          # @data directive examples
      path.ts          # @path directive examples
      embed.ts         # @embed directive examples
      codefence.ts     # Code fence syntax examples
      content.ts       # Content (non-directive) examples
      comments.ts      # Comment syntax examples
      integration.ts   # Complex examples with multiple directives
```

## Syntax Example Structure

Each directive file follows a consistent structure:

```typescript
export const atomic = {
  // Basic, standalone examples of the directive/syntax
  example1: createExample('Description', `code here`),
  example2: createExample('Description', `code here`)
};

export const combinations = {
  // More complex examples combining multiple elements
  complex1: combineExamples('Description',
    createExample('Part 1', `code here`),
    createExample('Part 2', `code here`)
  )
};

export const invalid = {
  // Examples of invalid syntax with expected errors
  invalid1: createInvalidExample('Description', `code here`, {
    type: ErrorType,
    severity: ErrorSeverity.Fatal,
    code: 'ERROR_CODE',
    message: 'Error message'
  })
};

export const directiveExamples: SyntaxExampleGroup = {
  atomic,
  combinations,
  invalid
};
```

This structure allows for organized access to examples by complexity and validity.

## Ship 1.0: Essential Implementation

### Core Helper Utilities

#### types.ts - Ship 1.0 Version

```typescript
import { 
  MeldError, 
  MeldParseError, 
  DirectiveError,
  MeldResolutionError,
  ErrorSeverity,
  DirectiveErrorCode
} from '../../errors';

/**
 * Represents a syntax example with code and description
 */
export interface SyntaxExample {
  /** The example code */
  code: string;
  /** Description of what the example demonstrates */
  description: string;
}

/**
 * Represents an invalid syntax example with expected error information
 */
export interface InvalidSyntaxExample extends SyntaxExample {
  expectedError: {
    /** The error constructor type */
    type: typeof MeldError | typeof MeldParseError | typeof DirectiveError | /* other error types */;
    /** Error severity level */
    severity: ErrorSeverity;
    /** Error code */
    code: string | DirectiveErrorCode | /* other error code types */;
    /** Expected error message or message fragment */
    message: string;
  };
}

/**
 * Group of related syntax examples
 */
export interface SyntaxExampleGroup {
  /** Valid syntax examples */
  valid: Record<string, SyntaxExample>;
  /** Invalid syntax examples with expected errors */
  invalid: Record<string, InvalidSyntaxExample>;
}
```

#### dedent.ts - Ship 1.0 Version

```typescript
/**
 * Template tag for multiline strings with proper indentation handling.
 * Preserves directives at the beginning of lines while removing common indentation.
 * 
 * @param strings - Template string parts
 * @param values - Template values to interpolate
 * @returns Dedented string with preserved line-beginning directives
 */
export function meld(strings: TemplateStringsArray, ...values: any[]): string {
  const raw = String.raw({ raw: strings }, ...values);
  
  // Remove leading/trailing empty lines
  const trimmed = raw.replace(/^\n+|\n+$/g, '');
  
  // Split into lines
  const lines = trimmed.split('\n');
  
  // Find minimum indentation (excluding lines that start with @ for directives)
  const indentations = lines
    .filter(line => line.trim().length > 0 && !line.trimStart().startsWith('@'))
    .map(line => line.match(/^(\s*)/)[0].length);
  
  const minIndent = indentations.length ? Math.min(...indentations) : 0;
  
  // Process each line
  const processed = lines.map(line => {
    // If it's a directive (starts with @ after trimming), ensure it's at the beginning
    if (line.trimStart().startsWith('@')) {
      return line.trimStart();
    }
    // Otherwise dedent by the minimum indent
    return line.length >= minIndent ? line.substring(minIndent) : line;
  });
  
  return processed.join('\n');
}
```

#### index.ts (helpers) - Ship 1.0 Version

```typescript
import { meld } from './dedent';
import { SyntaxExample, InvalidSyntaxExample } from './types';

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
  codeTemplate: TemplateStringsArray,
  ...values: any[]
): SyntaxExample {
  return {
    code: meld(codeTemplate, ...values),
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
  codeTemplate: TemplateStringsArray,
  expectedError: InvalidSyntaxExample['expectedError'],
  ...values: any[]
): InvalidSyntaxExample {
  return {
    code: meld(codeTemplate, ...values),
    description,
    expectedError
  };
}

export { meld };
export * from './types';
```

### Test Utilities - Ship 1.0 Version

The test utilities are crucial for enabling tests to use the centralized syntax examples.

```typescript
// tests/utils/syntax-test-helpers.ts
import { expectThrowsWithSeverity } from './error-test-utils';
import * as SyntaxExamples from '../../core/constants/syntax';
import type { SyntaxExample, InvalidSyntaxExample } from '../../core/constants/syntax/helpers/types';

/**
 * Gets a valid syntax example by directive, category, and name
 * 
 * @param directive - Directive name (e.g., 'text', 'data')
 * @param category - Category name (e.g., 'atomic', 'combinations')
 * @param exampleName - Example name
 * @returns The requested syntax example
 */
export function getExample(
  directive: string, 
  category: string, 
  exampleName: string
): SyntaxExample {
  // Dynamically access the example based on directive, category, and name
  return SyntaxExamples[`${directive}DirectiveExamples`][category][exampleName];
}

/**
 * Gets an invalid syntax example by directive and name
 * 
 * @param directive - Directive name (e.g., 'text', 'data')
 * @param exampleName - Example name
 * @returns The requested invalid syntax example
 */
export function getInvalidExample(
  directive: string, 
  exampleName: string
): InvalidSyntaxExample {
  // Invalid examples are in the 'invalid' category
  return SyntaxExamples[`${directive}DirectiveExamples`].invalid[exampleName];
}

/**
 * Tests a parser with valid syntax examples from a category
 * 
 * @param parser - The parser to test
 * @param directive - The directive to test (e.g., 'text', 'data')
 * @param category - The category of examples to test (e.g., 'atomic', 'combinations')
 */
export function testParserWithValidExamples(parser, directive, category) {
  const examples = SyntaxExamples[`${directive}DirectiveExamples`][category];
  
  Object.entries(examples).forEach(([name, example]) => {
    it(`should correctly parse valid ${name} syntax`, async () => {
      const result = await parser.parse(example.code);
      expect(result).toBeDefined();
      // Additional category-specific assertions
    });
  });
}

/**
 * Tests a parser with invalid syntax examples for a directive
 * 
 * @param parser - The parser to test
 * @param directive - The directive to test (e.g., 'text', 'data')
 */
export function testParserWithInvalidExamples(parser, directive) {
  const examples = SyntaxExamples[`${directive}DirectiveExamples`].invalid;
  
  Object.entries(examples).forEach(([name, example]) => {
    it(`should reject invalid ${name} syntax`, async () => {
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
 * Creates a DirectiveNode from a syntax example
 * This is useful for handler tests where you need a parsed node
 * 
 * @param exampleCode - Example code to parse
 * @returns Promise resolving to a DirectiveNode
 */
export async function createNodeFromExample(exampleCode: string) {
  const { parse } = await import('meld-ast');
  
  const result = await parse(exampleCode, {
    trackLocations: true,
    validateNodes: true
  });
  
  return result.ast[0];
}
```

## Fixing Import Issues

If you encounter import issues when trying to use the centralized examples, fix them before proceeding:

1. **Path Alias Configuration**: Ensure your build system has correct path aliases
   ```typescript
   // Example tsconfig.json with path aliases
   {
     "compilerOptions": {
       "baseUrl": ".",
       "paths": {
         "@core/*": ["core/*"],
         "@tests/*": ["tests/*"],
         "@services/*": ["services/*"]
       }
     }
   }
   ```

2. **Direct Path Resolution**: Use relative paths if needed
   ```typescript
   // Example using relative paths
   import { textDirectiveExamples } from '../../../core/constants/syntax/text';
   ```

3. **Re-export Approach**: Create a central export point
   ```typescript
   // In tests/utils/syntax-examples.ts
   export * from '../../core/constants/syntax';
   ```

## Migration Guide for Tests

To migrate an existing test to use the centralized syntax examples:

1. Import the helper utility:
   ```typescript
   import { getExample, getInvalidExample, createNodeFromExample } from '@tests/utils/syntax-test-helpers';
   ```

2. Use getExample/getInvalidExample to get the specific examples:
   ```typescript
   const textExample = getExample('text', 'atomic', 'simpleString');
   const invalidExample = getInvalidExample('text', 'unclosedString');
   ```

3. For handler tests, create a node from the example:
   ```typescript
   const node = await createNodeFromExample(textExample.code);
   ```

4. Use the test utilities for bulk testing:
   ```typescript
   describe('TextDirectiveParser', () => {
     testParserWithValidExamples(parser, 'text', 'atomic');
     testParserWithInvalidExamples(parser, 'text');
   });
   ```

### Before Migration:
```typescript
it('should parse @text directive', () => {
  const input = '@text greeting = "Hello"';
  const result = parser.parse(input);
  // assertions...
});
```

### After Migration (CORRECT APPROACH):
```typescript
import { getExample } from '@tests/utils/syntax-test-helpers';

it('should parse @text directive', () => {
  const example = getExample('text', 'atomic', 'simple');
  const result = parser.parse(example.code);
  // assertions...
});
```

## DO NOT Create Local Duplicates

The following pattern is INCORRECT and should NOT be used:

```typescript
// ❌ INCORRECT - DO NOT DO THIS
const LOCAL_EXAMPLES = {
  atomic: {
    simple: '@text greeting = "Hello"'
  }
};
```

Instead, always use the centralized examples:

```typescript
// ✅ CORRECT
import { getExample } from '@tests/utils/syntax-test-helpers';
const example = getExample('text', 'atomic', 'simple');
```

## Implementation Checklist

- [x] Fix any import issues preventing access to centralized examples
- [x] Create tests/utils/syntax-test-helpers.ts with utility functions
- [x] Migrate PathDirectiveHandler.test.ts to use centralized examples (partially complete - basic path handling tests migrated)
- [x] Migrate DefineDirectiveHandler.test.ts using the same pattern (partially complete - basic command handling tests and duplicate parameter test migrated)
- [x] Migrate TextDirectiveHandler.test.ts to use centralized examples
- [x] Migrate DataDirectiveHandler.test.ts using the same pattern
- [x] Migrate RunDirectiveHandler.test.ts using the same pattern
- [x] Migrate ImportDirectiveHandler.test.ts using the same pattern
- [ ] Migrate remaining directive handlers following the established pattern
- [ ] Create README.md in core/constants/syntax with usage documentation
- [ ] Ensure JSDoc comments on all exported functions and types

## Implementation Notes

- A consistent pattern has been established for migrating tests to use centralized examples
- For test files that are partially migrated, clear migration status comments have been added to track progress
- The `createNodeFromExample` helper function has been implemented in test files to create real AST nodes
- Invalid syntax tests that would be rejected by the parser before reaching the handler are still using the direct directive creation approach

## Migration Progress Status

### Completed Handlers:
- ✅ PathDirectiveHandler.test.ts (partially complete - basic path handling tests migrated)
- ✅ DefineDirectiveHandler.test.ts (partially complete - basic command handling tests migrated)
- ✅ TextDirectiveHandler.test.ts
- ✅ DataDirectiveHandler.test.ts
- ✅ RunDirectiveHandler.test.ts

### Next in Queue:
- ⏳ ImportDirectiveHandler.test.ts

### Remaining Handlers:
- ⏱️ EmbedDirectiveHandler.test.ts
- ⏱️ Other handler tests...

## Lessons Learned During Migration

### AST Node Structure Differences

1. **Parser vs. Manual Creation**: Nodes created by the parser have a more complex structure than those created with test helpers:
   - Real parsed nodes include full AST metadata (locations, structured values)
   - Manual test helpers (`createDefineDirective`, etc.) create simplified node structures

2. **Invalid Syntax Handling**: For invalid syntax tests, we discovered:
   - The meld-ast parser rejects truly invalid syntax before it reaches the handlers
   - Some validation tests must continue using manual node creation to test handler-level validation

3. **Invalid Example Structure**: When working with invalid examples:
   - Invalid examples use the `expectedError` property rather than `error`
   - The structure follows the pattern in the `InvalidSyntaxExample` interface

### Testing Strategy Refinements

1. **Migration Approach**:
   - Focus on migrating one test at a time within each file
   - Start with simpler "happy path" tests before complex validation tests
   - Add detailed migration status comments in each file

2. **Pattern for Migration**:
   - Add proper imports for syntax examples and helpers
   - Implement `createNodeFromExample` in each test file 
   - Replace hardcoded examples with `getExample`/`getInvalidExample` calls
   - Update assertions to accommodate structured objects from real AST nodes

3. **Error Tests Approach**:
   - For handler validation tests: keep using `createDefineDirective` etc.
   - For parser rejection tests: use `getInvalidExample` with proper error expectations

## Implementation Schedule

1. **Week 1: Infrastructure and First Migration**
   - Fix import issues in build system
   - Create syntax-test-helpers.ts 
   - Migrate TextDirectiveHandler.test.ts

2. **Week 2-3: Core Directive Handlers**
   - Migrate DataDirectiveHandler.test.ts
   - Migrate RunDirectiveHandler.test.ts
   - Migrate ImportDirectiveHandler.test.ts
   - Migrate DefineDirectiveHandler.test.ts

3. **Week 4: Remaining Handlers and Documentation**
   - Migrate remaining handlers
   - Create documentation
   - Verify test coverage

## Post-1.0 Enhancements

After the 1.0 release, we can enhance the system with additional features:

### Extended Types and Helper Functions

```typescript
// Additional helper functions
export function createComplexExample(
  description: string,
  codeTemplate: TemplateStringsArray,
  prerequisites: string[] = [],
  ...values: any[]
): ComplexSyntaxExample {
  return {
    code: meld(codeTemplate, ...values),
    description,
    prerequisites
  };
}

export function createExampleGroup(
  groupName: string,
  examples: Record<string, SyntaxExample>
): Record<string, SyntaxExample> {
  return Object.entries(examples).reduce((acc, [key, example]) => {
    acc[`${groupName}_${key}`] = example;
    return acc;
  }, {} as Record<string, SyntaxExample>);
}
```

## Conclusion

By using a single centralized set of syntax examples, we'll achieve better maintainability, consistency, and test coverage. Remember to:

1. Always use the centralized examples from core/constants/syntax
2. Fix import issues rather than creating local duplicates
3. Use the helper functions in syntax-test-helpers.ts
4. Document patterns and special cases for future reference

### Working with Examples in Tests

When testing directive handlers, you'll need to convert example code strings into DirectiveNode objects. Here's the recommended implementation for `createNodeFromExample`:

```typescript
/**
 * Creates a DirectiveNode from a syntax example code
 * This is needed for handler tests where you need a parsed node
 * 
 * @param exampleCode - Example code to parse
 * @returns Promise resolving to a DirectiveNode
 */
const createNodeFromExample = async (exampleCode: string): Promise<DirectiveNode> => {
  try {
    const { parse } = await import('meld-ast');
    
    const result = await parse(exampleCode, {
      trackLocations: true,
      validateNodes: true
    } as any); // Using 'as any' to avoid type issues with ParserOptions
    
    return result.ast[0] as DirectiveNode;
  } catch (error) {
    console.error('Error parsing with meld-ast:', error);
    throw error;
  }
};
```

### Resolving Common Test Failures

When migrating tests to use centralized examples, you may encounter these test failures:

1. **Mock Function Call Assertions**:
   
   If tests fail with errors like:
   ```
   expected "spy" to be called with arguments: [ …(2) ]
   ```
   
   The issue is usually that the mock wasn't properly configured for the new example format. Update your mocks to match the format of centralized examples:
   
   ```typescript
   // Get the JSON part from the example string - matches what the parser would do
   const jsonPart = example.code.split('=')[1].trim();
   vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce(jsonPart);
   ```

2. **Parser Errors**:
   
   For invalid examples that cause parser errors, make sure your test is properly expecting these failures:
   
   ```typescript
   // For parse errors that should be caught:
   try {
     const node = await createNodeFromExample(invalidExample.code);
     // Test should continue with the created node
   } catch (error) {
     // Handle parse errors if needed for the test
   }
   ```

3. **Mismatched Error Types**:
   
   If your tests expect specific error types, ensure they match the ones defined in the centralized examples:
   
   ```typescript
   // For example, expecting DirectiveError
   const invalidExample = getInvalidExample('data', 'invalidJson');
   await expect(handler.execute(node, directiveContext)).rejects.toThrow(DirectiveError);
   ```

### Example Test Implementation

Here's a complete example of a handler test using centralized examples:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/DataDirectiveHandler.js';
import { DirectiveError } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { getExample, getInvalidExample } from '@tests/utils/syntax-test-helpers.js';
import type { DirectiveNode } from 'meld-spec';

describe('DataDirectiveHandler', () => {
  let handler: DataDirectiveHandler;
  
  // Setup code with mocks...
  
  it('should process simple JSON data', async () => {
    // Get example from centralized system
    const example = getExample('data', 'atomic', 'simpleObject');
    const node = await createNodeFromExample(example.code);
    
    // Extract the JSON part from the example for mocking
    const jsonPart = example.code.split('=')[1].trim();
    vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce(jsonPart);
    
    // Execute and assert
    const result = await handler.execute(node, directiveContext);
    expect(result).toBeDefined();
    // Additional assertions...
  });
});
```

This additional documentation should address the common issues encountered when migrating tests to use centralized syntax examples.

### Step-by-Step Migration Guide

To migrate an existing test file to use centralized syntax examples, follow these steps:

## IMPORTANT: Best Practices for Migration

### Migrate One Test at a Time

The most important guideline for this migration is to **migrate one test at a time**:

1. **Start with a fully working test file** - Make sure all tests pass before beginning migration
2. **Choose one simple test case** to migrate first - Preferably a basic "happy path" case 
3. **Complete the migration for that one test** - Verify it passes before touching any other tests
4. **Run the full test suite** after each individual test is migrated
5. **Document what you learn** from each migration to inform the next test

This incremental approach ensures:
- The test suite remains functional throughout the migration
- Issues are identified and fixed early
- Each test migration builds on knowledge gained from previous ones
- Complex test cases benefit from lessons learned with simpler ones

**INCORRECT APPROACH (DON'T DO THIS)**:
```typescript
// Trying to migrate all tests at once
// This often leads to multiple failing tests and difficult debugging
it('test1', async () => { /* migrated but broken */ });
it('test2', async () => { /* migrated but broken */ });
it('test3', async () => { /* migrated but broken */ });
```

**CORRECT APPROACH**:
```typescript
// Original working implementation
it('test1', async () => { /* original working code */ });
// Migrated and verified working
it('test2', async () => { /* successfully migrated */ });
// Original working implementation
it('test3', async () => { /* original working code */ });
```

### Incremental Migration Process

1. **Update imports**: 
   ```typescript
   // Add these imports
   import { getExample, getInvalidExample } from '@tests/utils/syntax-test-helpers.js';
   ```

2. **Add the createNodeFromExample helper**:
   Copy the `createNodeFromExample` function documented above into your test file.

3. **Migrate one test case at a time**:
   
   a. **Pick a single test** to migrate first (preferably a simple one)
   
   b. **Comment the original implementation** but don't delete it yet:
   ```typescript
   it('should process simple JSON data', async () => {
     // ORIGINAL IMPLEMENTATION:
     // const node = createDirectiveNode('@data user = { "name": "Alice" }');
     // ... rest of original test ...
     
     // NEW IMPLEMENTATION:
     const example = getExample('data', 'atomic', 'simpleObject');
     const node = await createNodeFromExample(example.code);
     // ... continue with migrated test ...
   });
   ```
   
   c. **Run the test** to see if it passes with the migrated implementation
   
   d. **Fix any issues** specific to this test before moving to the next one
   
   e. **Document what you learned** in comments to guide future migrations

4. **Move to the next test** only after the current one passes:
   ```typescript
   // SUCCESSFULLY MIGRATED
   it('should process simple JSON data', async () => {
     const example = getExample('data', 'atomic', 'simpleObject');
     const node = await createNodeFromExample(example.code);
     // ... rest of migrated test ...
   });
   
   // NEXT TEST TO MIGRATE
   it('should handle nested JSON objects', async () => {
     // ... start migration of this test ...
   });
   ```

5. **If a test is too difficult to migrate**, document the issues and come back to it later:
   ```typescript
   // TODO: Migration blocked by issue with X
   // KEEP ORIGINAL IMPLEMENTATION
   it('complex test case', async () => {
     const node = createDirectiveNode('...');
     // ... original test implementation ...
   });
   ```

### Migration Checklist

- [ ] Update imports to use path aliases
- [ ] Add the createNodeFromExample helper function
- [ ] Replace hardcoded examples with getExample calls
- [ ] Update mocks to work with centralized examples
- [ ] Replace invalid examples with getInvalidExample calls
- [ ] Update assertions to match centralized example values
- [ ] Document the migration with comments
- [ ] Run tests and fix any failures
- [ ] Ensure all tests pass with the centralized examples

Following this guide should make the migration process smoother and more consistent across all test files.

### Reference Implementations

Below are simplified examples of a complete test file before and after migration to centralized syntax. These examples can serve as a reference when migrating your own test files.

#### Before Migration

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataDirectiveHandler } from './DataDirectiveHandler.js';
import { createDirectiveNode } from '../../../../../tests/utils/directive-test-helpers.js';
import { DirectiveState } from '../../../DirectiveState.js';
import { mocked } from 'vitest-mock-extended';
import { resolutionService } from '../../../../../services/resolution/ResolutionService.js';
import { validationService } from '../../../../../services/validation/ValidationService.js';
import { MeldParseError, ErrorSeverity } from '../../../../../core/errors.js';

vi.mock('../../../../../services/resolution/ResolutionService.js');
vi.mock('../../../../../services/validation/ValidationService.js');

describe('DataDirectiveHandler', () => {
  let handler: DataDirectiveHandler;
  let state: DirectiveState;

  beforeEach(() => {
    vi.resetAllMocks();
    handler = new DataDirectiveHandler();
    state = new DirectiveState();
    state.setDataVar = vi.fn();
  });

  it('should process simple JSON data', async () => {
    // Hardcoded example
    const node = createDirectiveNode('@data user = { "name": "Alice", "id": 123 }');
    
    // Mock resolution service
    vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('{ "name": "Alice", "id": 123 }');
    vi.mocked(validationService.validateJSON).mockReturnValueOnce(true);
    
    // Execute handler
    const clonedState = await handler.execute(node, state);
    
    // Assertions
    expect(resolutionService.resolveInContext).toHaveBeenCalledWith('{ "name": "Alice", "id": 123 }', state);
    expect(validationService.validateJSON).toHaveBeenCalledWith('{ "name": "Alice", "id": 123 }');
    expect(clonedState.setDataVar).toHaveBeenCalledWith('user', { name: "Alice", id: 123 });
  });

  it('should handle invalid JSON', async () => {
    // Hardcoded invalid example
    const node = createDirectiveNode('@data bad = { invalid json }');
    
    vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('{ invalid json }');
    vi.mocked(validationService.validateJSON).mockReturnValueOnce(false);
    
    // Expect execution to throw
    await expect(handler.execute(node, state)).rejects.toThrow(MeldParseError);
  });
});
```

#### After Migration

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataDirectiveHandler } from './DataDirectiveHandler.js';
import { DirectiveState } from '@services/pipeline/DirectiveService/DirectiveState.js';
import { mocked } from 'vitest-mock-extended';
import { resolutionService } from '@services/resolution/ResolutionService.js';
import { validationService } from '@services/validation/ValidationService.js';
import { MeldParseError, ErrorSeverity } from '@core/errors.js';
import { getExample, getInvalidExample } from '@tests/utils/syntax-test-helpers.js';
import { parseFromSource } from 'meld-ast';

vi.mock('@services/resolution/ResolutionService.js');
vi.mock('@services/validation/ValidationService.js');

/**
 * Helper function to create a DirectiveNode from example code
 */
async function createNodeFromExample(code: string) {
  try {
    const result = await parseFromSource(code, { filePath: 'test.md' } as any);
    if (!result.directives || result.directives.length === 0) {
      throw new Error('Failed to parse example into directive');
    }
    return result.directives[0];
  } catch (error) {
    throw error;
  }
}

describe('DataDirectiveHandler', () => {
  let handler: DataDirectiveHandler;
  let state: DirectiveState;

  beforeEach(() => {
    vi.resetAllMocks();
    handler = new DataDirectiveHandler();
    state = new DirectiveState();
    state.setDataVar = vi.fn();
  });

  it('should process simple JSON data', async () => {
    // MIGRATION LOG:
    // Original: Used createDirectiveNode with hardcoded JSON
    // Migration: Using centralized example from core/constants/syntax
    
    // Get centralized example
    const example = getExample('data', 'atomic', 'simpleObject');
    const node = await createNodeFromExample(example.code);
    
    // Extract value for mocking
    const jsonPart = example.code.split('=')[1].trim();
    
    // Mock resolution service
    vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce(jsonPart);
    vi.mocked(validationService.validateJSON).mockReturnValueOnce(true);
    
    // Execute handler
    const clonedState = await handler.execute(node, state);
    
    // Assertions
    expect(resolutionService.resolveInContext).toHaveBeenCalledWith(jsonPart, state);
    expect(validationService.validateJSON).toHaveBeenCalledWith(jsonPart);
    expect(clonedState.setDataVar).toHaveBeenCalledWith('user', { name: "Alice", id: 123 });
  });

  it('should handle invalid JSON', async () => {
    // MIGRATION LOG:
    // Original: Used createDirectiveNode with hardcoded invalid JSON
    // Migration: Using centralized invalid example from core/constants/syntax
    
    // Get centralized invalid example
    const invalidExample = getInvalidExample('data', 'invalidJson');
    const node = await createNodeFromExample(invalidExample.code);
    
    // Extract value for mocking
    const jsonPart = invalidExample.code.split('=')[1].trim();
    
    vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce(jsonPart);
    vi.mocked(validationService.validateJSON).mockReturnValueOnce(false);
    
    // Expect execution to throw
    await expect(handler.execute(node, state)).rejects.toThrow(MeldParseError);
  });
});
```

The key differences in the migrated version include:

1. Updated imports using path aliases
2. Added the `createNodeFromExample` helper function
3. Replaced hardcoded examples with calls to `getExample` and `getInvalidExample`
4. Added clear migration logs as comments
5. Updated the mock setup to work with centralized examples
6. Adjusted assertions to match the expected values from centralized examples

These reference implementations should provide a clear template for migrating other test files in the codebase.

### Troubleshooting Common Test Failures

#### DataDirectiveHandler Test Issues

When migrating the `DataDirectiveHandler.test.ts` file to use centralized syntax examples, you may encounter the following issues:

1. **Resolution Service Mocking**: The resolution service is not being called as expected. This can happen because:
   
   - The structure of the parsed node from centralized examples may differ from what the handler expects
   - The mock implementation needs to handle both string and StructuredPath types
   - Different versions of the parser may produce different AST structures

   **Solution**: If you're facing persistent issues, temporarily use the `createDirectiveNode` helper for tests until all import issues are resolved:

   ```typescript
   // Temporary solution while resolving centralized syntax implementation
   const node = createDirectiveNode('@data user = { "name": "Alice", "id": 123 }');
   ```

2. **Error Handling Tests**: Tests that verify error handling may fail because:
   
   - The error thrown by the mock may not be caught correctly by the handler
   - The mock timing might not align with the execution flow in the handler
   - The handler may have changed its error wrapping behavior

   **Solution**: Use `mockImplementation` instead of `mockRejectedValue` to ensure the error is thrown during execution:

   ```typescript
   vi.mocked(resolutionService.resolveInContext).mockImplementation(() => {
     throw new DirectiveError(
       'Resolution failed',
       'data',
       DirectiveErrorCode.EXECUTION_FAILED,
       { node, context: directiveContext }
     );
   });
   ```

3. **Inconsistent Results**: You may see tests passing when run individually but failing when run as a suite:
   
   - This can be due to state being persisted between tests
   - Mock implementations may not be fully reset

   **Solution**: Ensure proper cleanup in the `afterEach` hook:

   ```typescript
   afterEach(() => {
     vi.resetAllMocks();
   });
   ```

#### Transitional Approach

While working through migration issues, consider implementing a transitional approach:

1. Document known issues in comments
2. Keep both centralized and local approaches temporarily:

```typescript
// TODO: Migration in progress - currently using createDirectiveNode
// but will switch to centralized examples when AST structure issues are resolved
// const example = getExample('data', 'atomic', 'simpleObject');
// const node = await createNodeFromExample(example.code);
const node = createDirectiveNode('@data user = { "name": "Alice", "id": 123 }');
```

This allows you to continue making progress while resolving the underlying issues with a systematic approach.

## Debugging Test Failures During Migration

When migrating tests to the centralized syntax approach, you may encounter failures in previously passing tests. These failures often reveal **hidden incorrect assumptions** in the original tests, which is actually a valuable opportunity to improve test quality.

### Common Hidden Assumptions to Look For

1. **Node Structure Mismatches**
   
   The most common issue is tests that depend on a specific node structure from `createDirectiveNode` that differs from what `createNodeFromExample` produces:

   ```typescript
   // ❌ OLD APPROACH with createDirectiveNode:
   // Places entire directive text in the 'kind' field!
   node.directive.kind = '@data user = { "name": "Alice", "id": 123 }'
   
   // ✅ NEW APPROACH with createNodeFromExample:
   // Creates properly structured nodes:
   node.directive.kind = 'data'
   node.directive.identifier = 'user'
   node.directive.source = 'literal'
   node.directive.value = { "name": "Alice", "id": 123 }
   ```

   **Debug Tip**: Add console logs to compare both node structures:
   ```typescript
   console.dir(nodeFromCreateDirectiveNode, { depth: null });
   console.dir(nodeFromCreateNodeFromExample, { depth: null });
   ```

2. **Conditional Logic Not Being Tested**

   Some handlers only call certain methods conditionally (e.g., resolution service for variables):
   
   ```typescript
   // This may ONLY be called when variables exist in the content
   // Tests may incorrectly assume it's always called
   resolutionService.resolveInContext(value, context);
   ```

   **Debug Tip**: Review handler code to understand the conditions for method calls:
   ```typescript
   // Handler might have conditions like:
   if (containsVariables(value)) {
     return resolutionService.resolveInContext(value, context);
   }
   ```

3. **Mock Implementation Incompatibility**

   Mocks may be incompatible with the proper node structure:
   
   ```typescript
   // ❌ INCORRECT: Mock doesn't match what handler expects
   vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('{"name":"Alice"}');
   
   // ✅ CORRECT: Mock properly handles object or string input
   vi.mocked(resolutionService.resolveInContext).mockImplementation((input) => {
     if (typeof input === 'string') {
       return Promise.resolve(input);
     } else {
       return Promise.resolve(JSON.stringify(input));
     }
   });
   ```

### Systematic Debugging Strategy

When facing mysterious test failures during migration, follow this process:

1. **Isolate the Test**: Focus on migrating and fixing one test at a time

2. **Compare Node Structures**:
   ```typescript
   // Add this to compare both approaches:
   const oldNode = createDirectiveNode('@data user = { "name": "Alice" }');
   const example = getExample('data', 'atomic', 'simpleObject');
   const newNode = await createNodeFromExample(example.code);
   
   console.log('OLD NODE:');
   console.dir(oldNode, { depth: null });
   console.log('NEW NODE:');
   console.dir(newNode, { depth: null });
   ```

3. **Trace Handler Execution**: Add console logs in your handler to see the execution path

4. **Check Mock Calls**: Verify what arguments your mocks receive
   ```typescript
   vi.mocked(resolutionService.resolveInContext).mockImplementation((input, ctx) => {
     console.log('resolveInContext called with:', input);
     return Promise.resolve(input); // Pass through
   });
   ```

5. **Update Assertions**: Update test assertions to match the new behavior
   ```typescript
   // Check which parameters are actually passed to the handler
   ```

### Case Study: DataDirectiveHandler

The migration of `DataDirectiveHandler.test.ts` revealed that:

1. `resolutionService.resolveInContext` is only called when there are variables to resolve
2. The handler reads `node.directive.value` when properly structured, but had to parse from text with `createDirectiveNode`
3. Error handling behaved differently based on node structure

**Resolution:**
```typescript
// Create proper node structure with variables to resolve
const example = `@data user = { "greeting": "Hello, ${name}!" }`;
const node = await createNodeFromExample(example);

// Mock resolution to handle variables
vi.mocked(resolutionService.resolveInContext).mockImplementation((value) => {
  // Replace variables with values
  return Promise.resolve(value.replace('${name}', 'World'));
});

// Now the test correctly verifies resolution behavior
```

### When to Use Each Approach

- **Use createNodeFromExample** (preferred):
  - For normal test cases that should use proper node structure
  - When testing integrated behavior with real directives
  
- **Use createDirectiveNode** (legacy):
  - Only during migration if you need to compare behavior
  - In rare cases where you need to test with malformed nodes

### Documenting Your Findings

When you resolve an incorrect assumption, document it in the test:

```typescript
// IMPORTANT NOTE: This test previously passed incorrectly because:
// 1. It used createDirectiveNode which created a different structure
// 2. The handler actually only calls resolveInContext for values with variables
// 3. The test was asserting behavior that wouldn't happen in production
```

By documenting these findings, you help future developers understand the correct behavior and avoid similar issues.