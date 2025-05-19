# Step 5d: Other Services Migration Plan

## Overview

This plan extends the comprehensive migration strategy from Step 5c to the remaining services. Each service must be updated to use the new AST structure and types, following the pattern established with directive handlers.

## Services to Migrate

### 1. ResolutionService (Highest Priority)
- **Why Priority**: Works closely with AST nodes for resolving variables, references, and content
- **Benefits of Fixtures**: Can test resolution against expected outputs from actual examples
- **Key Files**:
  - `ResolutionService.ts`
  - Various resolvers (ContentResolver, VariableReferenceResolver, etc.)
  - Client factories and interfaces

### 2. ValidationService
- **Why Important**: Validates AST node structures
- **Key Files**:
  - `ValidationService.test.ts`
  - `FuzzyMatchingValidator.ts`

### 3. PathService
- **Why Important**: Handles path nodes from AST
- **Key Files**:
  - `PathService.ts`
  - `PathService.test.ts`
  - `IPathService.ts`

### 4. OutputService
- **Why Important**: Transforms AST nodes to output
- **Key Files**:
  - `OutputService.ts`
  - `OutputService.test.ts`

### 5. ParserService (Remaining Files)
- **Why Important**: Creates the AST structure
- **Key Files**:
  - `transformations.ts`
  - Client factories

## Migration Strategy (Based on Handler Success)

### Phase 1: Pre-Migration Analysis
For each service:
1. Review code for `node.directive` usage patterns
2. Identify which fixtures would be useful for testing
3. Note service-specific test scenarios
4. Create migration plan specific to the service

### Phase 2: Code Updates
1. Update all imports from `@core/syntax/types` to `@core/ast/types`
2. Remove all `node.directive` references
3. Update property access patterns:
   - `node.directive.kind` → `node.kind`
   - `node.directive.values` → `node.values`
   - `node.directive.raw` → `node.raw`
4. Update discriminated union usage
5. Fix type guards and pattern matching

### Phase 3: Test Migration
1. Create fixture-based tests where applicable
2. Use `ASTFixtureLoader` for loading real AST structures
3. Update existing tests to use correct AST structure
4. Remove adapter layers and workarounds
5. Delete redundant tests

### Phase 4: Validation
1. Ensure all tests pass
2. Verify no `node.directive` references remain
3. Confirm fixture tests provide better coverage
4. Document any service-specific patterns

## Service-Specific Considerations

### ResolutionService
- **Special Focus**: Resolution of interpolatable values
- **Fixture Usage**: Use fixtures with expected resolution outputs
- **Key Pattern**: Resolvers should work with actual AST node types
- **Testing**: Compare resolved values against fixture expectations

Example approach:
```typescript
// Load fixture with expected output
const fixture = loadFixture('text/text-template');
const expected = loadExpectedOutput('text/text-template-resolved');
const resolved = await resolutionService.resolve(fixture);
expect(resolved).toEqual(expected);
```

### ValidationService
- **Special Focus**: Node structure validation
- **Fixture Usage**: Test with both valid and invalid fixtures
- **Key Pattern**: Validators should check new AST structure
- **Testing**: Create invalid fixtures for error cases

### PathService
- **Special Focus**: Path node handling
- **Fixture Usage**: Use path directive fixtures
- **Key Pattern**: Path resolution with new node structure
- **Testing**: Test various path types from fixtures

### OutputService
- **Special Focus**: Node to output transformation
- **Fixture Usage**: Transform fixtures and compare outputs
- **Key Pattern**: Handle all node types in discriminated union
- **Testing**: End-to-end transformation tests

## Benefits of Fixture-Based Approach

1. **Real-World Testing**: Services tested against actual AST structures
2. **Expected Outputs**: Can test against known good outputs
3. **Consistency**: All services use same test data
4. **Maintainability**: Updates to grammar automatically reflected
5. **Comprehensive Coverage**: Edge cases from real examples

## Migration Checklist Template

For each service, follow this checklist:

- [ ] Pre-Migration Analysis
  - [ ] Audit current code for old patterns
  - [ ] Identify applicable fixtures
  - [ ] Plan service-specific tests
  
- [ ] Code Updates
  - [ ] Update imports
  - [ ] Remove `node.directive` usage
  - [ ] Update property access
  - [ ] Fix type guards
  
- [ ] Test Migration
  - [ ] Create fixture tests
  - [ ] Update existing tests
  - [ ] Remove redundant tests
  - [ ] Add service-specific tests
  
- [ ] Validation
  - [ ] All tests passing
  - [ ] No old patterns remain
  - [ ] Documentation updated
  - [ ] Performance verified

## Timeline Estimate

Based on handler migration experience:
- ResolutionService: 2-3 days (complex, many files)
- ValidationService: 1 day
- PathService: 1 day
- OutputService: 1 day
- ParserService cleanup: 1 day

Total: 6-8 days

## Key Lessons from Handler Migration

1. **Update Everything Together**: Code, tests, and types must all be updated
2. **Use Real Fixtures**: Better test coverage with actual AST structures
3. **Delete Redundancy**: Remove tests that fixtures make obsolete
4. **Document Special Cases**: Keep tests that add unique value
5. **No Adapter Layers**: Direct testing against new structure

## Success Criteria

- All services use new AST structure
- No `@core/syntax/types` imports remain
- Fixture-based tests provide better coverage
- Services work correctly with new discriminated union
- Integration tests pass across all services