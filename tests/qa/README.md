# QA Testing Framework

This directory contains manual QA testing prompts and checklists designed for Claude to systematically test mlld functionality. These tests complement the automated test suite in `tests/cases/` by focusing on end-to-end user scenarios and edge cases.

## Structure

```
tests/qa/
├── README.md                    # This file
├── prompts/                     # Prompt templates for different testing scenarios
│   ├── feature-isolation/       # Test individual features in isolation
│   ├── feature-integration/     # Test feature combinations
│   ├── error-scenarios/         # Test error handling and recovery
│   └── performance/             # Test performance and stress scenarios
├── checklists/                  # Step-by-step testing checklists
│   ├── core-directives/         # Checklists for each directive
│   ├── advanced-features/       # Checklists for complex features
│   └── security/                # Security testing checklists
├── scenarios/                   # Complete test scenarios
│   ├── real-world/              # Real-world use case scenarios
│   └── edge-cases/              # Edge case scenarios
└── templates/                   # Templates for reporting
    ├── issue-template.md        # GitHub issue template
    └── test-report.md           # Test execution report template
```

## Testing Philosophy

1. **User-Centric**: Test from the perspective of actual users
2. **Systematic**: Follow checklists to ensure consistent coverage
3. **Exploratory**: Encourage finding unexpected behaviors
4. **Reproducible**: Document steps clearly for bug reproduction
5. **Actionable**: Report issues with clear reproduction steps

## How to Use

1. **Select a Test**: Choose appropriate prompts/checklists based on what needs testing
2. **Execute Test**: Claude follows the prompts systematically
3. **Document Results**: Use templates to report findings
4. **File Issues**: Create GitHub issues for any problems found

## Test Categories

### 1. Feature Isolation Tests
Test each mlld feature in isolation to ensure it works correctly on its own.

### 2. Feature Integration Tests
Test combinations of features to ensure they work together properly.

### 3. Error Scenario Tests
Test error handling, invalid inputs, and recovery scenarios.

### 4. Performance Tests
Test with large files, many imports, complex operations.

### 5. Security Tests
Test for vulnerabilities, injection attacks, and access control.

## Reporting Guidelines

- Use clear, concise language
- Include exact commands/code that reproduce issues
- Specify expected vs actual behavior
- Include relevant error messages
- Tag issues appropriately on GitHub

## Test Priorities

1. **Critical**: Core functionality that must work
2. **High**: Common user scenarios
3. **Medium**: Advanced features and edge cases
4. **Low**: Nice-to-have improvements
