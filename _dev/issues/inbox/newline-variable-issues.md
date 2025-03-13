# Newline Handling and Variable Formatting Issues

## Overview

This document details issues related to newline handling and variable substitution in the OutputService's markdown output. These issues became apparent after changing the standard markdown output from using single newlines (`\n`) to using double newlines (`\n\n`) between markdown nodes.

## Issues

### 1. Markdown Newline Standards

**Problem**: Markdown traditionally uses double newlines (`\n\n`) between paragraphs/blocks to create visual separation. Our system was using single newlines, which doesn't align with standard markdown practices.

**Change**: Modified `nodeToMarkdown` to use double newlines (`\n\n`) for Text, TextVar, and DataVar nodes in standard (non-transformation) mode.

### 2. Variable Substitution Formatting

**Problem**: After implementing double newlines, variable substitutions are being split across multiple lines in the output:

```
Expected:
- The greeting is: Hello, World!

Received:
+ The greeting is: 
+ Hello, World!
```

**Analysis**: 
- When lines in the input contain variable references like `The greeting is: {{greeting}}`, the variable reference `{{greeting}}` is replaced with its value.
- After switching to double newlines between nodes, this replacement isn't preserving the original line formatting.
- The resulting output shows the prefix text ("The greeting is: ") and the variable value ("Hello, World!") split across multiple lines.

### 3. Different Behavior in E2E Tests

**Problem**: The changes to newline handling are failing a significant number of E2E tests, including:
- valid/data-variables.mld
- valid/directive-example.mld
- valid/directives.mld
- valid/path-embed.mld
- valid/simple-variable.mld
- valid/simple-variables.mld
- valid/standalone.mld
- valid/text.mld

The tests are failing because the expected output files contain single newlines while our code now produces double newlines.

## Root Causes

1. **Missing Standardization**: We lack a consistent approach to newline handling across the codebase, with different parts using different conventions.

2. **Variable Replacement Logic**: The variable replacement logic in the `nodeToMarkdown` method directly replaces `{{variableName}}` with its value without considering the broader context of the line. This approach works fine with single newlines but causes formatting issues with double newlines.

3. **Transformation vs. Standard Mode**: We have different newline handling in transformation mode (preserves original layout) vs. standard mode (now using double newlines), but some tests don't account for this difference.

## Potential Solutions

### Short-term Fixes

1. **Fix Variable Substitution**: Modify the variable replacement logic to preserve the line structure when replacing variables. This would ensure text like "The greeting is: {{greeting}}" stays on a single line after substitution.

2. **Update Test Expectations**: Update the expected output files in the E2E tests to match the new double-newline standard.

3. **Add Normalization Function**: Create a helper function to normalize line endings in both the expected and actual output before comparison in tests. This would make tests more resilient to formatting differences.

### Long-term Improvements

1. **Consistent Markdown Formatting Standard**: Document and enforce a consistent standard for markdown formatting throughout the codebase.

2. **Smart Variable Substitution**: Enhance the variable substitution logic to be more context-aware, preserving the surrounding text structure.

3. **Configure Formatting Options**: Allow format options to control newline behavior, giving users more flexibility.

4. **Enhanced Test Helpers**: Create better test helpers for comparing markdown output that can handle insignificant formatting differences.

## Implementation Concerns

Changing the newline handling affects many tests and could potentially affect user output. We should:

1. Ensure compatibility with llmxml processing
2. Consider backward compatibility for existing users
3. Be cautious about any interactions with the parser and interpreter

## Next Steps

1. Fix the variable substitution issue to preserve line formatting
2. Update the test expectations to match the new standard
3. Document the changes in the codebase and user documentation 