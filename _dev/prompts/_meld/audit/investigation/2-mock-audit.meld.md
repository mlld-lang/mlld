# Mock Services Audit

@import[partials/header.md]
@import[partials/code-analysis-instructions.md]

## CODE TO ANALYZE

=== STATE SERVICE AND INTERFACE ===

@cmd[cpai services/StateService/IStateService.ts services/StateService/StateService.ts --stdout]

=== MOCK IMPLEMENTATIONS ===

@cmd[cpai tests/**/*mock*.ts tests/**/*stub*.ts --stdout]

=== TEST USAGE OF MOCKS ===

@cmd[cpai tests/api/api.test.ts tests/services/OutputService/OutputService.test.ts --stdout]

## YOUR TASK

Perform a thorough audit of all StateService mocks and their usage:

1. Create a complete mock inventory:
   - List all StateService mocks/stubs found
   - Compare each mock's methods to IStateService
   - Note any partial or incomplete implementations
   - Flag any mocks that extend vs reimplement

2. Analyze mock behavior:
   - Check clone() implementation in each mock
   - Verify transformation mode handling
   - Compare return types to interface
   - Note any simplified/stubbed behavior

3. Map mock usage in failing tests:
   - Find which mocks are used in failing tests
   - Note how mocks are constructed/injected
   - Check if mocks properly implement needed methods
   - Identify any mock behavior inconsistencies

@import[partials/quality-requirements.md]

SPECIFIC REQUIREMENTS:

- Create a mock comparison matrix
- Include exact file locations for all mocks
- Note which tests use which mocks
- Flag any transformation-related mock issues
- List all clone() implementations
- Identify any mock initialization patterns 