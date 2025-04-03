# SDK Integration Test Patterns

## Test-Implementation Misalignment

We've identified a pattern where SDK integration tests may be making oversimplified assumptions about internal service behavior. This creates potential maintenance challenges and false negatives in our test suite.

### Case Study: Output Service Integration

The `api/api.test.ts` integration tests demonstrate this pattern clearly:

```typescript
// SDK integration test makes simple assumptions
const content = `
  Some text content
  @run [echo test]
  More text
`;
// Expects:
// - Raw text preservation
// - Simple directive handling
// - Direct content matching
```

However, the actual `OutputService` implementation and its unit tests reveal more sophisticated behavior:

1. Transformation Modes
   - Non-transformation mode has specific directive handling rules
   - Transformation mode replaces directives with results
   - Mode selection affects entire output pipeline

2. Format-Specific Behavior
   - Each format (markdown, llm) has unique requirements
   - LLM XML format has special handling needs
   - Directive handling varies by format

3. State Management
   - Service tracks transformation state
   - Handles state variables differently in different modes
   - Complex interaction between state and output

### Impact on Test Reliability

This misalignment causes:
1. False negatives - tests fail despite correct implementation
2. Maintenance burden - fixing "failing" tests can break actual functionality
3. Documentation gaps - simplified tests don't reflect actual behavior

### Recommendations

1. SDK Integration Tests Should:
   - Consider transformation modes
   - Account for format-specific behavior
   - Match documented interface behavior
   - Test actual use cases rather than implementation details

2. Documentation Updates:
   - Clearly document transformation modes
   - Explain format-specific requirements
   - Provide SDK usage examples that reflect actual behavior

3. Test Structure:
   - Move implementation details to unit tests
   - Keep integration tests focused on real-world usage
   - Add test cases for different modes and formats
   - Document expected behavior in test descriptions

## Implementation Plan

### Phase 1: Test Infrastructure Updates (1-2 hours)
- [ ] Update TestContext initialization
- [ ] Add transformation mode helpers
- [ ] Add format-specific test utilities
- [ ] Update test documentation patterns

### Phase 2: Basic Transformation Tests (2-3 hours)
- [ ] Test transformation mode enabling/disabling
- [ ] Test state variable preservation
- [ ] Test basic directive handling
- [ ] Test content preservation rules

### Phase 3: Format-Specific Tests (2-3 hours)
- [ ] Markdown format tests
  - [ ] Headers and formatting
  - [ ] Code blocks
  - [ ] Directive placeholders
- [ ] LLM format tests
  - [ ] XML structure
  - [ ] Special characters
  - [ ] State representation

### Phase 4: Integration Scenarios (3-4 hours)
- [ ] Full pipeline tests
  - [ ] Parse -> Transform -> Output
  - [ ] State management
  - [ ] Error handling
- [ ] Mixed content tests
  - [ ] Multiple directive types
  - [ ] Nested transformations
  - [ ] State inheritance
- [ ] Edge cases
  - [ ] Empty content
  - [ ] Invalid directives
  - [ ] State conflicts

### Phase 5: Documentation & Examples (2-3 hours)
- [ ] Update test documentation
- [ ] Add example test patterns
- [ ] Document common pitfalls
- [ ] Create test templates

## Action Items

1. Review other SDK integration tests for similar patterns
2. Update test documentation to reflect actual service behavior
3. Consider adding SDK-level transformation mode controls
4. Add integration test examples to SDK documentation

## Risk Assessment

### Low Risk Areas
- Test infrastructure changes (good existing patterns)
- Basic transformation tests (clear requirements)
- Documentation updates (straightforward)

### Medium Risk Areas
- Format-specific edge cases
- State management complexity
- Performance implications

### Mitigation Strategies
1. Incremental implementation
2. Comprehensive test coverage
3. Clear documentation
4. Regular review points

## Timeline
- Total estimated time: 10-15 hours
- Can be implemented incrementally
- Key milestones align with phases
- Regular review points after each phase

## Success Criteria
1. All tests pass consistently
2. No false negatives
3. Clear test patterns documented
4. Easy to maintain and extend
5. Matches actual service behavior 