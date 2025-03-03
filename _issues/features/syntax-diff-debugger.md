# Syntax Diff Debugger - Specification

## Purpose

The Syntax Diff Debugger is a specialized debugging tool designed to identify syntax mismatches in test expectations versus actual outputs. It will help developers quickly spot where outdated syntax patterns are being used in tests, making it easier to fix integration tests that are failing due to syntax evolution.

## Core Functionality

1. Provide a side-by-side comparison of expected vs. actual test outputs
2. Highlight specific syntax patterns known to have changed during development
3. Integrate with the existing TestContext for seamless use in tests
4. Generate clear, actionable feedback about syntax mismatches

## Implementation Overview

The tool consists of:

1. A `SyntaxDiffService` that performs the comparison and highlighting
2. A registry of syntax patterns to detect (old vs. current)
3. Integration with the TestContext for easy use in tests
4. Custom formatters for different output types (console, HTML report, etc.)

## Usage Example

```typescript
// In a test file
it('should properly resolve nested variables', async () => {
  const input = `@text greeting = "Hello, world!"`;
  const result = await testContext.processContent(input);
  
  try {
    expect(result).toContain('Hello, world!');
  } catch (error) {
    // Show syntax diff when test fails
    console.log(testContext.showSyntaxDiff('Hello, world!', result));
    throw error;
  }
});
```

## Addition to DEBUG.md

Here's what the addition to your DEBUG.md document would look like:

---

## Syntax Diff Debugger

The Syntax Diff Debugger helps identify syntax mismatches between test expectations and actual outputs, particularly useful for finding outdated syntax patterns in integration tests.

### SyntaxDiffService

- Provides detailed comparison between expected and actual test outputs
- Highlights known syntax patterns that have changed during development
- Integrates with TestContext for seamless use in tests

#### Available Methods

- `showSyntaxDiff(expected, actual, options)`: Shows a detailed comparison with syntax highlighting
- `registerSyntaxPattern(pattern, description)`: Add a custom syntax pattern to detect
- `generateSyntaxReport(testResults)`: Creates a comprehensive report of syntax issues across multiple tests

### Using the Syntax Diff Debugger

The Syntax Diff Debugger is available through the TestContext:

```typescript
// Basic usage
const diff = testContext.showSyntaxDiff(expected, actual);
console.log(diff);

// With options
const detailedDiff = testContext.showSyntaxDiff(expected, actual, {
  contextLines: 3,
  highlightSyntax: true,
  syntaxPatterns: ['variables', 'paths', 'directives']
});
```

### Registered Syntax Patterns

The Syntax Diff Debugger comes pre-configured with these syntax patterns:

| Pattern Name | Old Syntax | Current Syntax | Description |
|--------------|------------|----------------|-------------|
| text_variable | `${var}` | `{{var}}` | Text variable references |
| data_variable | `#{var}` | `{{var}}` | Data variable references |
| path_variable | `/path/to/file` | `$./path/to/file` | Path references |
| project_path | `$PROJECTPATH` and `$.` | `$.` (preferred) | Project path variables |
| home_path | `$HOMEPATH` and `$~` | `$~` (preferred) | Home path variables |

### Command Line Usage

The Syntax Diff Debugger can also be used from the command line:

```bash
meld debug-syntax test.meld --expected "Expected output" --highlight
```

### Test Integration

Integration with test frameworks is available:

```typescript
// In beforeEach or global setup
testContext.enableSyntaxDiffOnFailure();
```

This will automatically show syntax differences for any failing expectation in tests.

---

## Benefits

This tool will help you:

1. Quickly identify where tests are using outdated syntax
2. Reduce debugging time by highlighting the exact differences
3. Make test failures more actionable with specific feedback
4. Provide documentation of syntax evolution for your team
5. Easily update tests to use the current, centralized syntax

The Syntax Diff Debugger is designed to be lightweight and integrate seamlessly with your existing debug infrastructure, providing a focused solution to the specific issue of syntax evolution in tests.