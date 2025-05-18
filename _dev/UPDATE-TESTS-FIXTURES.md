# Test Update Plan: Fixture-Based Testing Strategy

**Created:** 2025-01-19  
**Context:** Evolution of the original UPDATE-TESTS.md plan to use AST fixtures as the source of truth for test node structures.

## Executive Summary

Instead of manually updating test factories to match AST snapshots, we will:
1. Use the existing AST fixtures in `core/ast/fixtures/` as the authoritative source
2. Create a fixture loading infrastructure (`ASTFixtureLoader`)
3. Migrate tests systematically to use fixtures instead of manual node creation
4. Maintain test factories only for edge cases not covered by fixtures

## Current Situation

### Problems (from original plan)
1. Test factories create nodes with incorrect structure
2. Handler code being modified to accommodate test structure (backwards!)
3. Test failures misleading development

### New Insights
1. We have comprehensive fixtures in `core/ast/fixtures/` with:
   - Input directive strings
   - Expected output
   - Correct AST structure
   - Metadata about directive type/subtype
2. Fixtures are generated and maintained, ensuring they stay current
3. Fixtures provide real-world examples that cover most test cases

## Revised Strategy

### Phase 1: Infrastructure (✅ Complete)

1. **Created `ASTFixtureLoader` utility**
   - Loads fixtures from `core/ast/fixtures/`
   - Parses input to create AST nodes
   - Caches results for performance
   - Provides typed access to fixtures

2. **Created Migration Guide**
   - `services/MIGRATION-TO-FIXTURES.md`
   - Step-by-step instructions
   - Best practices and patterns

3. **Created Example Migration**
   - `TextDirectiveHandler.fixture-test.ts`
   - Demonstrates the migration pattern
   - Shows before/after comparison

### Phase 2: Systematic Migration

#### Priority Order

1. **Simple Directive Handlers** (Week 1)
   - TextDirectiveHandler (example complete)
   - DataDirectiveHandler
   - PathDirectiveHandler

2. **Medium Complexity** (Week 2)
   - ImportDirectiveHandler
   - AddDirectiveHandler

3. **Complex Handlers** (Week 3)
   - RunDirectiveHandler
   - ExecDirectiveHandler

#### Migration Steps per Handler

1. **Create fixture test file** (alongside existing test)
   ```
   HandlerName.test.ts      → existing tests
   HandlerName.fixture-test.ts → fixture-based tests
   ```

2. **Initialize ASTFixtureLoader**
   ```typescript
   const loader = new ASTFixtureLoader();
   ```

3. **Replace node creation**
   ```typescript
   // Old:
   const node = createTextDirective({...});
   
   // New:
   const { ast } = await loader.parseFixture('text-assignment-1');
   const node = ast[0] as DirectiveNode;
   ```

4. **Update expectations to match new AST**
   ```typescript
   // Old:
   expect(node.directive.value).toBe('...');
   
   // New:
   expect(node.values.content[0].content).toBe('...');
   ```

5. **Add fixture coverage tests**
   ```typescript
   it('should handle all text assignment fixtures', async () => {
     const fixtures = loader.getFixturesByKindAndSubtype('text', 'assignment');
     for (const fixture of fixtures) {
       // Test each fixture
     }
   });
   ```

6. **Gradually migrate and delete old tests**

### Phase 3: Handler Code Cleanup

1. **Remove backwards compatibility code**
   - Delete any code handling both old and new structures
   - Ensure handlers only expect correct AST structure

2. **Simplify handler logic**
   ```typescript
   // Clean implementation expecting only fixture-based structure
   const contentNodes = node.values.content;
   const resolved = await this.resolutionService.resolveNodes(contentNodes);
   ```

### Phase 4: Test Factory Evolution

1. **Update factories to use fixtures internally**
   ```typescript
   export function createTextDirective(options: TextDirectiveOptions) {
     // For custom cases not in fixtures
     const loader = new ASTFixtureLoader();
     const base = loader.getClosestFixture(options);
     return modifyFixture(base, options);
   }
   ```

2. **Deprecate most factory functions**
   - Keep only for edge cases
   - Document that fixtures are preferred

### Phase 5: Continuous Improvement

1. **Monitor fixture coverage**
   ```typescript
   // Add to CI/CD
   const stats = loader.getStats();
   expect(stats.unusedFixtures).toHaveLength(0);
   ```

2. **Update fixtures as syntax evolves**
   - Fixtures are generated from examples
   - Tests automatically inherit updates

3. **Document patterns**
   - Add examples to MIGRATION-TO-FIXTURES.md
   - Update test standards in docs/dev/TESTS.md

## Benefits Over Original Plan

1. **Less Manual Work**
   - No need to manually update every test factory
   - Fixtures provide correct structure automatically

2. **Better Test Coverage**
   - Tests use real-world examples
   - All fixture cases are testable

3. **Maintainability**
   - Single source of truth (fixtures)
   - Changes to AST structure propagate automatically

4. **Gradual Migration**
   - Can run old and new tests side-by-side
   - No big-bang migration required

## Implementation Checklist

### Infrastructure ✅
- [x] Create ASTFixtureLoader
- [x] Create migration guide
- [x] Create example migration

### Handler Migrations
- [x] TextDirectiveHandler (example)
- [ ] DataDirectiveHandler
- [ ] PathDirectiveHandler
- [ ] ImportDirectiveHandler
- [ ] AddDirectiveHandler
- [ ] RunDirectiveHandler
- [ ] ExecDirectiveHandler

### Cleanup
- [ ] Remove old test factories (deprecate first)
- [ ] Remove handler compatibility code
- [ ] Update documentation
- [ ] Add fixture coverage to CI/CD

## Success Criteria

1. **All handlers use fixture-based tests**
2. **No manual node construction in tests**
3. **Handlers work only with correct AST structure**
4. **Test coverage includes all fixtures**
5. **Documentation reflects new testing approach**
6. **Tests use new unified types from `@core/ast/types`**
   - Import from correct location (not old `@core/syntax/types`)
   - Use the `MeldNode` union type correctly
   - Validate discriminated union patterns

## Timeline

- Week 1: Simple handlers + infrastructure
- Week 2: Medium complexity handlers
- Week 3: Complex handlers + cleanup
- Week 4: Documentation + CI/CD integration

## Risks and Mitigations

1. **Risk**: Missing edge cases in fixtures
   - **Mitigation**: Keep test factories for custom cases

2. **Risk**: Performance of parsing fixtures
   - **Mitigation**: Caching in ASTFixtureLoader

3. **Risk**: Fixture structure changes
   - **Mitigation**: Fixtures are generated, tests inherit changes

## Conclusion

This fixture-based approach is superior to manually updating test factories because:
1. It uses the authoritative AST structure from fixtures
2. It requires less manual maintenance
3. It provides better test coverage
4. It's easier to keep in sync with AST changes

The investment in fixture infrastructure will pay dividends in:
- Reduced test maintenance
- Better test accuracy
- Easier onboarding for new developers
- Confidence in AST structure correctness