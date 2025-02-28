# Meld Syntax Examples

This directory contains centralized syntax examples for all Meld directives and syntax patterns. These examples serve as a single source of truth for correct and problematic syntax, enabling consistent testing and documentation.

## Directory Structure

```
/syntax
  /helpers            # Helper utilities
    dedent.ts         # Multi-line string formatting
    index.ts          # Helper functions
    types.ts          # TypeScript types
  index.ts            # Main export point
  text.ts             # @text directive examples
  data.ts             # @data directive examples
  import.ts           # @import directive examples
  integration.ts      # Complex multi-directive examples
  ...                 # Other directive types (to be added)
```

## Example Structure

Each directive file follows a consistent structure:

```typescript
export const atomic = {
  // Basic, single-purpose examples
};

export const combinations = {
  // More complex examples that combine multiple concepts
};

export const invalid = {
  // Invalid syntax examples with expected errors
};

// Complete collection
export const xxxDirectiveExamples = {
  atomic,
  combinations,
  invalid
};
```

## Using in Tests

Examples can be used in tests through the test utilities:

```typescript
import { 
  getExample, 
  getInvalidExample,
  testParserWithValidExamples,
  testParserWithInvalidExamples,
  testIntegrationExample
} from '../tests/utils/syntax-test-helpers';

// Testing valid examples
describe('TextDirectiveHandler', () => {
  testParserWithValidExamples(textDirectiveHandler, 'text', 'atomic');
  
  // Or use specific examples
  it('should process greeting example', async () => {
    const example = getExample('text', 'atomic', 'simpleString');
    const result = await textDirectiveHandler.process(example.code);
    // assertions...
  });
});
```

## Adding New Examples

To add new examples:

1. If adding to an existing directive file, follow the established pattern
2. If adding a new directive file:
   - Create a new file named after the directive (e.g., `path.ts`)
   - Follow the structure with `atomic`, `combinations`, and `invalid` sections
   - Export the collection as `xxxDirectiveExamples`
   - Update `index.ts` to export the new examples

## Core Helpers

### Creating Examples

```typescript
// Create a valid example
const example = createExample(
  'Description of the example',
  `@text greeting = "Hello"`
);

// Create an invalid example with expected error
const invalidExample = createInvalidExample(
  'Description of the invalid example',
  `@text greeting = "unclosed string`,
  {
    type: MeldParseError,
    severity: ErrorSeverity.Fatal,
    code: 'SYNTAX_ERROR',
    message: 'Unclosed string literal'
  }
);
```

### Combining Examples

```typescript
// Combine multiple examples
const combinedExample = combineExamples(
  'Description of the combined example',
  example1,
  example2,
  example3
);
```

## Future Enhancements

Future enhancements planned for post-1.0:

1. Context-aware composition system
2. Automatic variable tracking
3. Example validation tools
4. Documentation generation
5. Versioning of examples 