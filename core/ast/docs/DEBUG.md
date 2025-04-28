# Debugging the Meld Parser

This document provides guidance on how to debug the Meld parser, particularly when dealing with test failures.

## Using the Debug Script

The repository includes a debug script at `core/ast/tests/debug-test.js` that can help you understand what's happening with specific test cases. This script:

1. Uses ESM imports with proper path resolution to load the parser and test types
2. Can test specific input cases that you add directly to the script
3. Displays the input, expected output, and actual output for comparison

### Running the Debug Script

To run the debug script:

```bash
# Using tsx (recommended)
npx tsx core/ast/tests/debug-test.js

# Or using Node with experimental flags
node --experimental-specifier-resolution=node --import ts-node/register core/ast/tests/debug-test.js
```

### What the Debug Script Shows

For each test case, the script will output:
- The input string being parsed
- The expected output structure (from your test case or the test specification)
- The actual output structure (from the parser)
- Any parse errors that occur, including error messages and locations
- Debug traces from the grammar if you've enabled them

This makes it easy to spot differences between what you expect and what the parser is actually producing.

### Adding Your Own Test Cases

You can add your own test cases directly in the script. For example:

```javascript
const myTest = {
  input: '@your [directive] here\n',
  expected: {
    // Expected AST structure
  }
};

console.log('MY TEST:');
console.log('Input:', myTest.input);
console.log('Expected:', JSON.stringify(myTest.expected, null, 2));
try {
  const result = parse(myTest.input);
  console.log('Actual:', JSON.stringify(result[0], null, 2));
} catch (err) {
  console.error('Parse error:', err.message);
  console.error('Location:', err.location);
}
```

## Fixing Test Failures

When fixing test failures:

1. Use the debug script to understand the exact differences
2. Check if the test case needs special handling
3. Update the appropriate rule or function
4. Rebuild the parser with `npm run prebuild`
5. Run the tests again with `npm test core/ast`

Remember that changes to the grammar file require rebuilding the parser before they take effect.

## Adding Debug Logging to the Grammar (meld.pegjs)

When the debug script isn't sufficient or you need finer-grained insight into the parser's internal execution path, you can add manual logging directly into the `core/ast/grammar/meld.pegjs` file. However, Peggy's syntax is strict, and incorrect placement of logging code (especially action blocks `{...}`) can easily break the grammar build.

**Use the `helpers.debug` Function:**

The grammar's initializer block (`{ ... }` at the top) defines a `helpers.debug` function. Use this for consistency.

```javascript
// Inside meld.pegjs initializer block
{
  const DEBUG = true; // Ensure this is true
  // ... other helpers ...
  const helpers = {
    debug(msg, ...args) {
      if (DEBUG) {
        // Use process.stdout.write to avoid suppression by test runners
        const formattedArgs = args.map(arg => {
          try {
            return typeof arg === 'string' ? arg : JSON.stringify(arg);
          } catch (e) {
            return '[Unserializable]';
          }
        }).join(' ');
        process.stdout.write(`[DEBUG GRAMMAR] ${msg} ${formattedArgs}\n`);
      }
    },
    // ... other helpers ...
  };
}
```

**Safe Placement of Logging Calls:**

*   **Inside Existing Action Blocks:** The safest place to add `helpers.debug(...)` calls is within the *existing* action blocks `{...}` that typically appear at the end of a rule definition, right before the `return` statement. This doesn't change the grammar structure.

    ```pegjs
    MyRule
      = part1:SubRule1 part2:SubRule2 {
          // Existing logic to process part1, part2...
          const result = { type: 'MyType', ... };
          helpers.debug('MyRule Matched', `part1 type=${part1.type}`, `result=`, result);
          return result;
        }
    ```

*   **Logging Rule Entry:** To log when a rule *starts* trying to match, you can sometimes add a simple action block at the beginning if the rule structure allows it, but this is more fragile.

    ```pegjs
    // Potentially fragile - use with caution
    MyRule
      = { helpers.debug('MyRule: Trying to match...'); return true; } // Predicate-like action block
        part1:SubRule1 part2:SubRule2 {
          // ... rest of rule ...
        }
    ```

**Unsafe Placement (Avoid):**

*   **Before Alternatives in a Choice:** Do NOT place action blocks directly before alternatives separated by `/`. This is invalid syntax and will break the build.

    ```pegjs
    // INVALID SYNTAX - DO NOT DO THIS
    RuleChoice
      = { helpers.debug('Trying Alt1'); return true; } Alt1
      / { helpers.debug('Trying Alt2'); return true; } Alt2
    ```

*   **Modifying Fundamental Rules:** Be extremely careful when adding action blocks to very basic rules like whitespace (`_`, `__`), `Identifier`, `StringLiteral`, etc. Adding action blocks here seems more likely to cause unexpected build failures. It's generally better to log in the higher-level rules that *use* these fundamental rules.

*   **Inside Predicates:** Adding logging inside predicate blocks (`&{...}` or `!{...}`) might be possible but can also be syntactically tricky and is best avoided unless absolutely necessary.

**Workflow:**

1.  Add minimal, targeted `helpers.debug` calls in safe locations (preferably existing action blocks).
2.  Run `npm run build:grammar` immediately to check for syntax errors.
3.  If the build fails, remove the last log statement added and try again.
4.  Once the build succeeds, run the relevant tests (`npm test core/ast` or specific API tests) and check the console output for your `[DEBUG GRAMMAR]` messages.
5.  Remember to remove the debug logs once troubleshooting is complete.

Remember that changes to the grammar file require rebuilding the parser before they take effect:

```bash
# Rebuild grammar and run tests
npm run build:grammar && npm test core/ast
```

## Test Structure

The tests in `core/ast/tests` are organized into several categories:

### Main Tests
- `parser.test.ts`: Core parser functionality (text blocks, code fences, variables, etc)
- `types.test.ts`: Type system validation
- `validation.test.ts`: AST validation rules

### Directive Tests
Located in `core/ast/tests/directives/`, these test specific directives:
- `import.test.ts`: `@import` directive
- `embed.test.ts`: `@embed` directive
- `data.test.ts`: `@data` directive
- `define.test.ts`: `@define` directive
- And others for specific directive features (headers, variables, syntax variations)

### Manual Tests
Located in `core/ast/tests/manual/`, these contain specific test cases that need more control:
- `data-array.test.ts`: Testing array handling in data directives

### Debug Scripts
- `debug-test.js`: Main debugging script for parser output
- `debug-text-directive.cjs`: Specific debugging for text directives

### Test Utilities
Located in `core/ast/tests/utils/`:
- `test-utils.ts`: Shared test helpers including:
  - Mock node/parser creation
  - Location stripping
  - Test case validation
  - Error handling utilities

### Test Case Structure
Most tests follow this pattern:
```typescript
describe('feature', () => {
  describe('valid cases', () => {
    // Test valid inputs
    it('should parse X correctly', async () => {
      const input = '...';  // Test input
      const { ast } = await parse(input);
      
      expect(ast).toHaveLength(1);  // Validate output
      const node = ast[0];
      expect(node.type).toBe('...');
      // ... more assertions
    });
  });

  describe('invalid cases', () => {
    // Test error conditions
    it('should reject invalid input', async () => {
      const input = '...';  // Invalid input
      await expect(parse(input)).rejects.toThrow();
    });
  });
});
```

### Test Fixtures and Test Cases
Many tests use shared fixtures and helper functions from `test-utils.ts`. Here's how they work:

#### Test Case Type
```typescript
interface ParserTestCase {
  name: string;            // Test case identifier
  description?: string;    // Optional description
  input: string;          // Input to parse
  expected: MeldNode      // Expected AST output
                         // or { type: 'Error' } for invalid cases
}
```

#### Helper Functions
```typescript
// For valid test cases
async function testValidCase(test: ParserTestCase) {
  const result = await parse(test.input);
  const actual = stripLocations(result.ast[0]);
  expect(actual).toEqual(test.expected);
}

// For invalid test cases
async function testInvalidCase(test: ParserTestCase) {
  await expect(parse(test.input)).rejects.toThrow();
}
```

#### Using Test Fixtures
```typescript
import { importTests, importInvalidTests } from '@core/syntax/types/test-fixtures';

describe('feature', () => {
  // Test valid cases from fixtures
  importTests.forEach((test: ParserTestCase) => {
    it(test.description || test.name, async () => {
      await testValidCase(test);
    });
  });

  // Test invalid cases from fixtures
  importInvalidTests.forEach((test: ParserTestCase) => {
    it(test.description || test.name, async () => {
      await testInvalidCase(test);
    });
  });
});
```