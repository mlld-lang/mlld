# Test Update Execution Guide

## Pre-flight Checklist
- [x] 313 test files need updates
- [x] 43 example files need updates  
- [x] 56 files need string interpolation review
- [x] 54 instances of semantic brackets to preserve
- [x] Scripts created and ready

## Phase 1: Safe Automated Updates

### Step 1: Create new branch and backup
```bash
git checkout -b update-tests-new-syntax
```

### Step 2: Run safe syntax updates
```bash
./scripts/update-tests-safe.sh
```
This updates:
- `@directive` → `/directive` (all directives)
- `>>` → `//` (comments)

### Step 3: Add @ prefix to variable declarations
```bash
./scripts/update-tests-variables.sh
```
This updates:
- `/text name =` → `/text @name =`
- `/data config =` → `/data @config =`
- etc.

## Phase 2: Command Bracket Updates (Semi-Automated)

### Step 4: Update command brackets with review
```bash
./scripts/update-tests-commands.sh
```
This creates `command-bracket-review.txt` listing files that need manual verification.

**CRITICAL**: Review each file to ensure:
- `[(command)]` → `{command}` ✓
- `[file.md]` → `[file.md]` (UNCHANGED!)
- `["literal", "array"]` → `["literal", "array"]` (UNCHANGED!)

## Phase 3: Manual String Interpolation Updates

### Step 5: Review interpolation changes
Files listed in `string-interpolation-review.txt` need manual review.

**Key Decision Points**:
1. **Text with @ symbols that should interpolate**:
   ```mlld
   /text @msg = "Hello @name"     // @name WILL be expanded
   ```

2. **Text with @ symbols that should be literal**:
   ```mlld
   /text @msg = 'Hello @name'     // Use single quotes for literal
   ```

3. **Data objects with string values**:
   ```mlld
   /data @config = { "msg": "Welcome @user" }    // @user expanded
   /data @config = { "msg": 'Welcome @user' }    // literal @user
   ```

### Step 6: Update expected outputs
After syntax changes, update all `expected.md` files to match new behavior.

## Phase 4: Special Cases

### Handle These Patterns Carefully:

1. **Array data** (keep square brackets):
   ```mlld
   /data @items = ["apple", "banana"]   // DON'T change brackets!
   ```

2. **Path expressions** (check interpolation need):
   ```mlld
   /path @config = "./configs/@env/data.json"   // @env expands
   /path @config = './configs/@env/data.json'   // literal path
   ```

3. **Import paths** (similar to paths):
   ```mlld
   /import { data } from "./modules/@version/lib.mld"   // @version expands
   /import { data } from './modules/@version/lib.mld'   // literal
   ```

4. **Exec definitions** (update brackets carefully):
   ```mlld
   // OLD:
   @exec cmd(p) = [(echo "@p")]
   
   // NEW:
   /exec @cmd(p) = {echo "@p"}    // Note: @p in double quotes will expand
   ```

## Phase 5: Validation

### Step 7: Rebuild fixtures
```bash
npm run build:fixtures
```

### Step 8: Run tests iteratively
```bash
# Run all tests
npm test interpreter/interpreter.fixture.test.ts

# Or test specific categories
npm test interpreter/interpreter.fixture.test.ts -- --grep "text"
npm test interpreter/interpreter.fixture.test.ts -- --grep "data"
```

### Step 9: Fix failures
Common failure patterns:
1. **Parse errors**: Syntax not fully updated
2. **Output mismatches**: Expected output needs updating for interpolation
3. **Semantic errors**: Wrong bracket type used

## Phase 6: Error Message Updates

### Step 10: Search for old syntax in error messages
```bash
grep -r '"Expected @' core/errors interpreter/eval
grep -r "'@" core/errors interpreter/eval
grep -r '>>' core/errors interpreter/eval
```

Update any hardcoded references to old syntax.

## Phase 7: Final Cleanup

### Step 11: Remove backup files
```bash
find tests/cases examples -name "*.bak" -delete
```

### Step 12: Final test run
```bash
npm run build:fixtures
npm test
```

### Step 13: Create PR
Include in PR description:
- Number of files updated
- Key semantic changes (string interpolation)
- Any tests that changed behavior
- Validation that all tests pass

## Troubleshooting

### If fixtures won't build:
- Check for parse errors in updated syntax
- Run parser on individual files: `npm run ast -- "$(cat problematic-file.md)"`

### If tests fail with unexpected output:
- Check if double quotes need to be single quotes
- Verify expected.md matches new interpolation behavior

### If semantic tests break:
- Ensure [...] for file loading wasn't changed to {...}
- Check that array literals still use square brackets