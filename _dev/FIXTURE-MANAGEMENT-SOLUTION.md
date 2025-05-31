# Fixture Management Solution

## Problem
Generated fixture files (`*.generated-fixture.json`) cause merge conflicts between branches because:
1. They're auto-generated from source files
2. They contain full AST dumps that change with any grammar update
3. Multiple branches may have different AST structures

## Current Solution
Fixtures are regenerated automatically during:
- `npm run build` - Full build process
- `npm run build:grammar` - Grammar build process
- `npm run build:fixtures` - Direct fixture generation

## Proposed Long-term Solution

### Option 1: Git Ignore Fixtures (Recommended)
1. Add `*.generated-fixture.json` to `.gitignore`
2. Generate fixtures on demand during:
   - Local development (`npm test`)
   - CI/CD pipeline
   - Build process

**Pros:**
- No merge conflicts ever
- Always in sync with current grammar
- Smaller repository size

**Cons:**
- Fixtures must be generated before running tests
- CI needs to generate fixtures

### Option 2: Pre-commit Hook
1. Add a pre-commit hook that regenerates fixtures
2. Automatically stage fixture changes with commits

**Pros:**
- Fixtures always match source
- No manual generation needed

**Cons:**
- Still causes merge conflicts
- Slower commits

### Option 3: Fixture Snapshots
1. Store only the test input/expected output
2. Generate AST at test runtime
3. Use snapshot testing for AST validation

**Pros:**
- Minimal merge conflicts
- Tests are more readable
- Fixtures are smaller

**Cons:**
- Requires test framework changes
- Slower test execution

## Implementation Steps for Option 1

1. Update `.gitignore`:
   ```
   # Generated test fixtures
   tests/fixtures/**/*.generated-fixture.json
   ```

2. Update test runner to generate fixtures if missing:
   ```typescript
   if (!fs.existsSync(fixturePath)) {
     await generateFixture(testCase);
   }
   ```

3. Update CI pipeline to run `npm run build:fixtures` before tests

4. Document in README and CONTRIBUTING.md

## Temporary Workaround
When encountering fixture conflicts during merge:
```bash
# Accept either version (they'll be regenerated)
git checkout --ours tests/fixtures/
# or
git checkout --theirs tests/fixtures/

# Regenerate all fixtures
npm run build:fixtures

# Stage and continue merge
git add -A
git commit
```