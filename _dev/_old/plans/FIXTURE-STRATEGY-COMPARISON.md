# Fixture Strategy Comparison

## Old Approach (Manual Test Factories)

```mermaid
graph TD
    A[Test Factories] --> B[Manual Node Creation]
    B --> C[Tests]
    C --> D[Handler Code]
    E[AST Snapshots] --> F[Manual Updates to Factories]
    F --> A
    
    style A fill:#ff9999
    style B fill:#ff9999
    style F fill:#ffcc99
```

**Problems:**
- Manual synchronization between snapshots and factories
- Error-prone node structure creation
- Tests drive handler implementation (backwards!)
- High maintenance burden

## New Approach (Fixture-Based)

```mermaid
graph TD
    A[AST Fixtures] --> B[ASTFixtureLoader]
    B --> C[Parsed Nodes]
    C --> D[Tests]
    D --> E[Handler Code]
    
    F[Grammar/Examples] --> G[Auto-Generate]
    G --> A
    
    style A fill:#99ff99
    style B fill:#99ff99
    style G fill:#99ff99
```

**Benefits:**
- Single source of truth (fixtures)
- Automatic synchronization
- Real-world test cases
- Handlers drive tests (correct direction!)
- Low maintenance burden

## Migration Path

```mermaid
graph LR
    A[Current State] --> B[Add ASTFixtureLoader]
    B --> C[Migrate Handler Tests]
    C --> D[Cleanup Old Code]
    D --> E[Full Fixture-Based]
    
    style B fill:#99ccff
    style C fill:#99ccff
    style E fill:#99ff99
```

## Code Example: Before vs After

### Before (Manual Creation)
```typescript
// testFactories.ts
export function createTextDirective(options: TextDirectiveOptions) {
  return {
    type: 'Directive',
    kind: 'text',
    subtype: options.subtype,
    directive: {
      type: options.subtype,
      identifier: options.identifier,
      value: options.value // Wrong structure!
    }
    // ... lots of manual construction
  };
}

// In test
const node = createTextDirective({
  subtype: 'textAssignment',
  identifier: 'greeting',
  value: 'Hello'
});
```

### After (Fixture-Based)
```typescript
// In test
const loader = new ASTFixtureLoader();
const { ast } = await loader.parseFixture('text-assignment-1');
const node = ast[0] as DirectiveNode;

// Or for specific test case
const fixtures = loader.getFixturesByKindAndSubtype('text', 'assignment');
const testCase = fixtures.find(f => f.input.includes('greeting'));
```

## Test Coverage Comparison

### Old Approach
- Limited to manually created test cases
- May miss edge cases
- Drift from real usage over time

### New Approach
- Covers all fixtures automatically
- Real-world examples from documentation
- Stays in sync with grammar changes
- Can still create custom cases when needed

## Maintenance Effort

| Task | Old Approach | New Approach |
|------|-------------|--------------|
| Add new directive type | Update factories manually | Auto-generated from examples |
| Fix AST structure | Update all test factories | Update grammar, regenerate |
| Add test case | Write manual node creation | Add example, regenerate |
| Verify correctness | Compare with snapshots manually | Fixtures are source of truth |
| Update expectations | Change in multiple places | Update fixture expected value |

## Conclusion

The fixture-based approach transforms tests from a maintenance burden into a valuable asset that:
- Documents real usage
- Catches regressions
- Guides correct implementation
- Reduces developer friction