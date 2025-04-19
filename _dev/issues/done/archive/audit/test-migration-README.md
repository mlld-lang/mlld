# Test Migration Plan for Dependency Injection

This project aims to systematically update the test suite to align with the Dependency Injection (DI) patterns outlined in TESTS.md, while maintaining test coverage and ensuring all tests pass.

## Overview

The test migration follows a multi-phase approach:

1. **Audit Phase**: Analyze and document all tests that need updates
2. **Update Phase**: Systematically update tests based on audit findings and reference implementations

## Files in This Project

- **test-audit-plan.md**: Detailed plan for the audit phase
- **test-update-plan.md**: Structured approach for updating tests
- **test-audit-script.ts**: Automated tool to identify non-compliant tests
- **test-update-template.md**: Templates and patterns for common test updates
- **test-migration-README.md**: This overview file

## Phase 1: Audit

During the audit phase, we will:

1. Systematically review all test files to check compliance with TESTS.md standards
2. Categorize tests based on the severity of changes needed
3. Create a prioritized list for the update phase
4. Document specific issues for each test file

### Running the Audit

```bash
# Install dependencies if needed
npm install

# Run the audit script
npx ts-node test-audit-script.ts
```

The script will generate a `test-audit-results.md` file with detailed findings.

## Phase 2: Update

During the update phase, we will:

1. Follow the template in `test-update-template.md` to convert tests
2. Reference the original implementation in commit `9a31e16` for guidance
3. Update each test to follow TESTS.md patterns without changing test logic
4. Verify tests pass after updates

### Priority Order

Tests will be updated in this order:

1. 🔴 Critical failures (failing and blocking other functionality)
2. Priority services identified during the audit
3. 🟠 Major issues (significant restructuring needed)
4. 🟡 Minor issues (minor adjustments needed)

## Common Patterns to Apply

1. **TestContextDI Usage**
   - Convert direct instantiation to container resolution
   - Add proper async/await patterns
   - Ensure proper cleanup

2. **Mock Registration**
   - Use `context.registerMock()` instead of direct injection
   - Follow standard patterns from TESTS.md

3. **Factory Pattern Testing**
   - Create properly mocked factories
   - Handle lazy initialization
   - Implement fallback mechanisms for tests

4. **Error Testing**
   - Use standard error testing utilities
   - Ensure proper error type checking

## Special Considerations

1. **Circular Dependencies**
   - Use proper registration order
   - Consider async resolution

2. **Factory Patterns**
   - Mock factories consistently
   - Ensure proper service initialization

3. **Test Environment**
   - Set NODE_ENV=test for integration tests
   - Provide fallback mechanisms for test-only scenarios

## Progress Tracking

Track migration progress in the generated tracking document, which will list:
- Tests completed
- Tests in progress
- Remaining issues
- Success metrics

## Goal

The end goal is to have all tests:
1. Passing consistently
2. Following TESTS.md standards
3. Maintainable and aligned with DI best practices
4. Preserving original test logic and coverage 