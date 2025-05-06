# Interpolation Patterns Debugging Guide

## Overview

We've completely redesigned the interpolation pattern system in `wrapped-content.peggy` to address fundamental issues with the previous implementation. This guide will help you understand the new structure and how to debug common issues.

## Current Issues

1. The pattern of issues is consistent - Many directives are failing with similar errors about quotes:
   - For example: Expected "@", Wrapped template content, or whitespace but "\"" found
   - For add directives: Parse error: Expected "@", "{", "{{", Wrapped path content, Wrapped template content, or whitespace but "\"" found.
2. Key failing directives and patterns:
   - Import directives: Failing to detect variables in quoted paths:
      - input = '@import { * } from "$pathVar"' - variables are being treated as text
   - Quote handling in import paths is broken
   - Add directives: Multiple failing tests, especially with quoted content:
      - @add "$PROJECTPATH/README.md" - quoted path
   - @add [# Template Content] - template content with brackets
   - Variable reference detection issues

Do NOT try to fix this by adding string manipulation functions in directive-specific code. Instead, fix the interpolation patterns fundamentally.

## Core Design Principles

1. **Delimiters Should Be Boundaries, Not Content**
   - Quotes, brackets, etc. should define the boundaries of content, not be included in it
   - Fix issues at the pattern level, NEVER with post-processing in the directive code

2. **Single Responsibility**
   - Each pattern should do ONE thing
   - Quote handling should happen ONLY in LiteralString
   - Bracket handling should happen ONLY in BracketContent/DoubleBracketContent

3. **No String Manipulation After Parsing**
   - Don't rely on string manipulation to fix structural issues
   - Get the AST structure right from the beginning

## Debugging Process

1. **Identify the Failing Test**
   - Look at the exact test expectation that's failing
   - Trace back to the directive using the interpolation pattern

2. **Check Pattern Matching**
   - Ensure that the right pattern is being matched (LiteralString, BracketContent, etc.)
   - Ensure delimiters are being properly excluded from content

3. **Validate AST Structure**
   - Examine the AST nodes being generated
   - Confirm Text nodes don't contain quote characters
   - Ensure raw string reconstruction works correctly

4. **Build and Test Incrementally**
   - After each change, build the grammar: `npm run build:grammar`
   - Test specific files: `npm test grammar/tests/path.test.ts`

## Common Pitfalls to Avoid

1. **Adding String Manipulation Functions**
   - Don't add code to strip quotes/brackets after parsing
   - Fix the patterns to not include them in the first place

2. **Patching Tests Instead of Fixing Grammar**
   - Don't modify test expectations
   - Fix the underlying grammar issues

3. **Ignoring the Pattern Hierarchy**
   - Follow the pattern hierarchy in wrapped-content.peggy
   - Understand which pattern is responsible for each aspect of parsing

## Testing Your Changes

After making changes:

1. Build the grammar:
   ```
   npm run build:grammar
   ```

2. Run the specific failing tests:
   ```
   npm test grammar/tests/path.test.ts
   ```

3. Debug with increased verbosity if needed:
   ```
   DEBUG_MELD_GRAMMAR=1 npm test grammar/tests/path.test.ts
   ```

Remember: The goal is to fix issues at their source, not add workarounds. Ensure quotes and other delimiters are treated as boundaries of the content, not part of it.

## Reference Files

- `wrapped-content.peggy` - New pattern system (use this)
- `interpolation.peggy.first-try` - Our first attempt (for reference)
- `interpolation-patterns.peggy.first-try` - Our first attempt patterns (for reference)
- `interpolation.peggy.old` - Original implementation (for reference)

When debugging, always refer to the pattern hierarchy in `wrapped-content.peggy` to understand how patterns are composed and what each is responsible for.