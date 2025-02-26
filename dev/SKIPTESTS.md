# Tests to Skip During Development

This document lists tests that should be skipped during development to focus on core functionality first.

## Data Loading Tests

Skip tests related to loading and parsing YAML and JSON files:

- `cli/cli.test.ts` - "should load data from JSON files"
- `cli/cli.test.ts` - "should load data from YAML files"
- `cli/cli.test.ts` - "should handle invalid JSON data files gracefully"
- `cli/cli.test.ts` - "should handle invalid YAML data files gracefully"
- `cli/cli.test.ts` - "should handle missing data files gracefully"

## Validation Tests

Skip tests related to fuzzy matching threshold validation:

- `services/resolution/ValidationService/validators/FuzzyMatchingValidator.test.ts` - "should reject fuzzy thresholds below 0"
- `services/resolution/ValidationService/validators/FuzzyMatchingValidator.test.ts` - "should reject fuzzy thresholds above 1"
- `services/resolution/ValidationService/validators/FuzzyMatchingValidator.test.ts` - "should reject non-numeric fuzzy thresholds"

## Output Verbosity Tests

Skip tests related to output verbosity and silent mode:

- `cli/cli.test.ts` - "should output additional information in verbose mode"
- `cli/cli.test.ts` - "should not output additional information without verbose mode"
- `cli/cli.test.ts` - "should show detailed error information in verbose mode"
- `cli/cli.test.ts` - "should show stack traces for errors in verbose mode"
- `cli/cli.test.ts` - "should still show errors in silent mode"
- `cli/cli.test.ts` - "should suppress non-error output in silent mode"

## Implementation Plan

These tests will be addressed in a later phase of development after the core functionality is working properly. The current focus should be on:

1. Basic CLI operation
2. Template rendering with simple variables
3. Basic error handling
4. File I/O operations

Once these core features are stable, we can implement and test the more advanced features listed above. 