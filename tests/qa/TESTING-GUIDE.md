# MLLD QA Testing Guide

## Overview

This guide provides a systematic approach for Claude to perform comprehensive QA testing of mlld functionality. The tests are designed to complement the automated test suite by focusing on end-to-end scenarios, edge cases, and user experience.

## Quick Start

1. **Choose Test Type**:
   - Feature Isolation: Test individual features
   - Feature Integration: Test feature combinations  
   - Error Scenarios: Test error handling
   - Security: Test security measures
   - Performance: Test limits and stress

2. **Select Test Materials**:
   - **Prompts**: Step-by-step test instructions in `prompts/`
   - **Checklists**: Comprehensive validation lists in `checklists/`
   - **Scenarios**: Real-world test cases in `scenarios/`

3. **Execute Tests**:
   - Follow prompts systematically
   - Use checklists to ensure coverage
   - Document all findings
   - Clean up after each test

4. **Report Results**:
   - Use templates in `templates/`
   - File GitHub issues for bugs
   - Create test reports for records

## Test Priority Matrix

| Priority | Test Type | When to Run |
|----------|-----------|-------------|
| Critical | Security tests | Before releases, after security changes |
| Critical | Core directives (@text, @data, @run) | After parser changes |
| High | Error handling | After error system changes |
| High | Import/Module system | After module system changes |
| Medium | Integration scenarios | Weekly or before releases |
| Medium | Performance tests | After optimization work |
| Low | Edge cases | Monthly comprehensive testing |

## Testing Workflow

### 1. Pre-Release Testing

Run these tests before any release:

```bash
# Critical path tests
- [ ] Run text-directive.md prompt
- [ ] Run data-directive.md prompt  
- [ ] Run run-checklist.md
- [ ] Run security-checklist.md
- [ ] Execute documentation-generator.md scenario

# Integration verification
- [ ] Run text-data-integration.md
- [ ] Test one real-world scenario
- [ ] Verify no regressions in error handling
```

### 2. Feature-Specific Testing

When a feature is modified, run its specific tests:

**Parser Changes**:
- All directive isolation tests
- Error handling scenarios
- Stress test parsing

**Module System Changes**:
- Import-related prompts
- Module resolution tests
- Registry interaction tests

**Security Changes**:
- Full security checklist
- Penetration test attempts
- Permission validation

### 3. Regression Testing

After bug fixes:
1. Create specific test for the bug
2. Run related feature tests
3. Test error message improvements
4. Verify fix doesn't break other features

## Test Execution Best Practices

### Environment Setup
1. Use clean directory for each test session
2. Install mlld version being tested
3. Document version and environment
4. Ensure no production data in test area

### During Testing
1. Follow prompts exactly
2. Document unexpected behaviors immediately
3. Take screenshots/recordings for UI issues
4. Note performance characteristics
5. Test both success and failure paths

### Issue Reporting
1. One issue per bug (don't combine)
2. Use issue template for consistency
3. Include minimal reproduction
4. Tag appropriately (bug, enhancement, etc.)
5. Link to test that found the issue

### Test Data Management
- Generate test data programmatically when possible
- Don't commit large test files
- Clean up after each test
- Use consistent naming for test artifacts

## Common Testing Patterns

### Testing Error Messages
```mlld
# Intentionally broken code to test error
@text broken = "missing quote
# Check: Clear error? Line number? Suggestion?
```

### Testing Performance
```bash
# Time the operation
time mlld large-test.mld

# Monitor memory
/usr/bin/time -v mlld memory-test.mld

# Check output size
mlld big-output.mld | wc -c
```

### Testing Security
```mlld
# Always test with malicious input
@text user_input = "; rm -rf /"
run [echo {{user_input}}]
# Verify: Input is escaped, command not executed
```

## Continuous Testing

### Daily Smoke Tests
- One directive isolation test
- One integration test
- One error handling test
- Verify basic functionality

### Weekly Comprehensive
- All core directive checklists
- Two real-world scenarios
- Security spot checks
- Performance baseline

### Monthly Deep Dive
- All edge case scenarios
- Stress testing suite
- Security audit
- Documentation review

## Test Metrics to Track

1. **Test Coverage**: Which features tested
2. **Issues Found**: Count and severity
3. **Performance**: Execution times, memory usage
4. **Reliability**: Crash frequency, error rate
5. **Usability**: Error message quality, docs clarity

## Known Limitations

Some tests may not be feasible due to:
- Platform differences (Linux/macOS/Windows)
- Shell availability (bash/sh/zsh)
- Network restrictions
- File system permissions
- Resource constraints

Document when tests are skipped and why.

## Getting Help

- Check existing issues before filing new ones
- Use discussions for test clarifications
- Tag maintainers for security issues
- Contribute new test scenarios via PR

## Conclusion

Systematic testing helps ensure mlld remains reliable, secure, and user-friendly. By following these guides and using the provided materials, we can maintain high quality standards and catch issues before users encounter them.