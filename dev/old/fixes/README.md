# Meld AST Debugger

This directory contains debugging tools to help fix the API integration tests.

## AST Debugger

The AST Debugger is a utility script that parses Meld content and displays the AST structure for debugging parser/validator mismatches. This helps identify exactly what properties and structures the parser produces for different directive types.

### Usage

```bash
# Using the shell script (recommended)
./run-ast-debugger.sh <directive-type> ["custom content"]

# Or using ts-node directly
npx ts-node dev/fixes/ast-debugger.ts <directive-type> ["custom content"]
```

### Directive Types

The script supports analyzing the following directive types:

- `path` - Path directives (`@path`)
- `import` - Import directives (`@import`)
- `define` - Define directives (`@define`)
- `embed` - Embed directives (`@embed`)
- `textvar` - Text variables (`@text` and `${var}` references)
- `codefence` - Code fence blocks (```code```)
- `custom` - Custom Meld content provided as a string

### Examples

```bash
# Analyze path directives
./run-ast-debugger.sh path

# Analyze import directives
./run-ast-debugger.sh import

# Analyze a custom directive
./run-ast-debugger.sh custom "@import [test.meld]"
```

### Output

The script produces detailed output with:

1. The input Meld content
2. The full AST structure in JSON format
3. Focused information about the specific directive type
4. Property-by-property breakdown of the AST nodes

### Using for Integration Test Fixes

When fixing integration tests:

1. Run the debugger for the directive type you're fixing
2. Compare the AST properties with what validators expect
3. Update validators/handlers to accept both formats
4. Document the property patterns in comments

## Other Debug Tools

This directory also contains:

- `debug-parser.test.ts` - Vitest test file for examining parser output
- `debug-path-resolution.ts` - Tool for debugging path resolution issues
- `skip-path-tests.ts` - Tool for skipping specific path tests 