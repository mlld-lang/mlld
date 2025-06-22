# Test Update Handoff for New Grammar Syntax

## Overview
This document provides a complete handoff for updating all mlld tests to use the new syntax. The grammar has been updated with new syntax markers, but the test fixtures still use the old syntax.

## Syntax Changes Implemented

### 1. Directive Markers: `@` → `/`
- **Old**: `@run`, `@text`, `@add`, `@import`, etc.
- **New**: `/run`, `/text`, `/add`, `/import`, etc.

### 2. Command Brackets: `[(...)]` → `{...}`
- **Old**: `/run [(echo "hello")]`
- **New**: `/run {echo "hello"}`

### 3. Comments: `>>` → `//`
- **Old**: `>> This is a comment`
- **New**: `// This is a comment`

### 4. Quoted Command Syntax (NEW FEATURE)
- **New**: `/run "echo hello"` (alternative to `/run {echo hello}`)

### 5. Variable Declaration Syntax (NEW)
- **Old**: `/text name = "value"`
- **New**: `/text @name = "value"` (variables declared with @ prefix)
- Variable references still use `@name` in expressions

### 6. CRITICAL Semantic Preservation
- `[...]` = load/dereference content (e.g., `/add [README.md]` loads file contents)
- `"..."` = string WITH @var interpolation (e.g., `/add "Welcome @user"` expands @user)
- `'...'` = literal string (no interpolation)
- `` `...` `` = multi-line template with @var interpolation
- `[[...]]` = template with {{mustache}} interpolation (for /text only)

## Test System Architecture

### Directory Structure
```
tests/
├── cases/               # Markdown test cases (SOURCE OF TRUTH)
│   ├── valid/          # Valid syntax tests
│   ├── invalid/        # Invalid syntax tests  
│   ├── exceptions/     # Runtime error tests
│   └── warnings/       # Warning tests
├── fixtures/           # Generated JSON fixtures (GITIGNORED)
└── test-system/        # Test runner infrastructure
```

### Test Flow
1. **Source**: Markdown files in `tests/cases/` define test scenarios
2. **Build**: `npm run build:fixtures` generates JSON fixtures from markdown
3. **Run**: `interpreter.fixture.test.ts` runs tests against fixtures
4. **Validate**: Tests compare actual output to expected output

## Update Strategy

### Phase 1: Update Test Cases (tests/cases/)
All markdown files need syntax updates:

```bash
# Find all test cases that need updating
find tests/cases -name "*.md" -type f | xargs grep -l "@\|>>\|\[("

# Key patterns to replace:
# 1. Directive markers
@run     → /run
@text    → /text
@add     → /add
@import  → /import
@data    → /data
@exec    → /exec
@path    → /path
@output  → /output
@when    → /when

# 2. Command brackets (be careful with semantic preservation!)
[(...))]  → {...}     # Only for commands
[...]     → [...]     # Keep for file/content loading!

# 3. Comments
>>        → //
```

### Phase 2: Update Examples (examples/)
```bash
find examples -name "*.mld" -type f | xargs grep -l "@\|>>\|\[("
```

### Phase 3: Rebuild Fixtures
```bash
npm run build:fixtures
```

### Phase 4: Run Tests and Fix Issues
```bash
npm test interpreter/interpreter.fixture.test.ts
```

## Critical Test Categories

### 1. Semantic Preservation Tests
These tests MUST verify the bracket/quote distinction:
- `tests/cases/valid/add/path/` - Test `/add [file]` loads content
- `tests/cases/valid/add/template/` - Test `/add "text with @var"` outputs with interpolation
- `tests/cases/valid/text/assignment-path/` - Test path loading
- `tests/cases/valid/import/` - Test import paths

### 2. Command Syntax Tests  
- `tests/cases/valid/run/` - Update all `/run [(command)]` to `/run {command}`
- `tests/cases/valid/exec/` - Update exec command definitions

### 3. Comment Tests
- `tests/cases/valid/comments/` - Update `>>` to `//`

### 4. Error Message Tests
- `tests/cases/exceptions/` - Error messages may reference old syntax
- `tests/cases/warnings/` - Warning messages may need updates

## Impact of String Interpolation Standardization

### Tests That Need Special Attention

1. **String Literal Tests**: Any tests that expect double quotes to be literal will FAIL
   - Need to update expected output to account for variable expansion
   - Or change to single quotes if literal behavior is desired

2. **Path Tests**: Paths in double quotes now interpolate
   - `/path @config = "./configs/@env/data.json"` → @env will be expanded
   - Tests expecting literal "@env" in paths need single quotes

3. **Import Tests**: Import paths in double quotes now interpolate
   - `/import { data } from "./modules/@version/lib.mld"` → @version expanded
   - Tests expecting literal paths need single quotes

4. **Data Tests**: Object/array values in double quotes now interpolate
   - `/data @obj = { "msg": "Hello @user" }` → @user will be expanded
   - Tests expecting literal "@user" need single quotes

### Test Update Examples

```mlld
# OLD (when double quotes were literal)
/text @msg = "Hello @name"          # Expected: "Hello @name"
/add "Welcome @user"                # Expected: "Welcome @user"

# NEW (double quotes interpolate)
/text @msg = "Hello @name"          # Expected: "Hello " + value of @name
/add "Welcome @user"                # Expected: "Welcome " + value of @user

# If you need literal behavior, use single quotes
/text @msg = 'Hello @name'          # Expected: "Hello @name" (literal)
/add 'Welcome @user'                # Expected: "Welcome @user" (literal)
```

## Expected Challenges

### 1. False Positives
Some tests might pass with old syntax if the parser is backward compatible. These still need updating for consistency.

### 2. Error Message Updates
Error messages in the interpreter may still reference old syntax (e.g., "Expected @ but found..."). Search for hardcoded syntax in:
- `core/errors/messages/`
- `interpreter/eval/`

### 3. Documentation References
Many test files include comments explaining the syntax. These need updating too.

### 4. Fixture Synchronization
The fixture generator parses test files. If parsing fails, fixtures won't update. Fix syntax errors incrementally.

## Validation Checklist

- [ ] All test cases use `/` for directives (not `@`)
- [ ] All commands use `{}` brackets (not `[()]`)
- [ ] All comments use `//` (not `>>`)
- [ ] Variable declarations use `@` prefix: `/text @name = ...`
- [ ] String interpolation tests verify:
  - `"..."` interpolates @variables
  - `'...'` remains literal (no interpolation)
  - `` `...` `` interpolates @variables (multi-line)
  - `[[...]]` uses {{mustache}} syntax (not @variables)
- [ ] Semantic preservation tests explicitly verify:
  - `[file]` loads content
  - `"text with @var"` outputs with variable expansion
  - `'text with @var'` outputs literal text
- [ ] All tests pass: `npm test`
- [ ] No hardcoded old syntax in error messages
- [ ] Examples updated and working

## Helper Scripts

Consider creating these helpers:

```bash
#!/bin/bash
# update-syntax.sh - Batch update syntax in test files

# Update directive markers
find tests/cases -name "*.md" -exec sed -i 's/^@run/\/run/g' {} \;
find tests/cases -name "*.md" -exec sed -i 's/^@text/\/text/g' {} \;
# ... etc

# Update comments
find tests/cases -name "*.md" -exec sed -i 's/^>>/\/\//g' {} \;

# Manual review needed for brackets to preserve semantics!
```

## Reference: Working Examples

These syntax examples are confirmed working:

```mlld
// Comments use double slash
/text @message = "Hello @name"       // String WITH @var interpolation
/text @literal = 'Hello @name'       // Literal string (no interpolation)
/text @greeting = `Hello @name`      // Multi-line template with @var interpolation
/data @config = { "key": "value" }   // Object assignment
/exec @cmd(p) = {echo @p}           // Exec with parameter
/path @docs = "./docs"              // Path assignment
/add [README.md]                     // Load file content  
/add "See README.md"                 // Output literal text
/run {echo "Hello"}                  // Command with curly braces
/run "echo Hello @name"              // Command with quotes (WITH interpolation)
/import { var1, var2 } from "file"   // Import syntax unchanged
```

### 7. String Interpolation Standardization (COMPLETED)
**IMPORTANT**: Double quote behavior has been standardized across ALL directives.

- **Double quotes `"..."`**: NOW have `@var` interpolation in ALL directives
  - `/text @msg = "Hello @name"` → `@name` gets expanded
  - `/run "echo @user"` → `@user` gets expanded
  - `/data @obj = { "msg": "Hello @name" }` → `@name` gets expanded
  - `/path @file = "./configs/@env/data.json"` → `@env` gets expanded
  - `/import { config } from "./configs/@env/settings.mld"` → `@env` gets expanded
  
- **Single quotes `'...'`**: Remain literal (no interpolation) in ALL directives
  - `/text @msg = 'Hello @name'` → stores exactly `"Hello @name"`
  - `/run 'echo @name'` → outputs literally `@name`
  
- **Backticks `` `...` ``**: Multi-line templates with `@var` interpolation
- **Double brackets `[[...]]`**: Templates with `{{mustache}}` interpolation (NOT `@var`)

## Test Update Priority

### High Priority (String Interpolation Impact)
1. **Text directive tests** (`tests/cases/valid/text/`)
   - Many assume double quotes are literal
   - Need to verify interpolation behavior

2. **Data directive tests** (`tests/cases/valid/data/`)
   - Object/array string values now interpolate
   - Complex data structures need review

3. **Path directive tests** (`tests/cases/valid/path/`)
   - Path strings with @ symbols need attention

4. **Import directive tests** (`tests/cases/valid/import/`)
   - Import paths may contain variables

### Medium Priority (Syntax Updates)
5. **Run directive tests** (`tests/cases/valid/run/`)
   - Update [()] to {}
   - Verify quoted command interpolation

6. **Add directive tests** (`tests/cases/valid/add/`)
   - Verify string output interpolation

### Low Priority (Simple Updates)
7. **Comment tests** (`tests/cases/valid/comments/`)
   - Simple >> to // replacement

## Next Steps

1. Create a new branch: `update-tests-new-syntax`
2. **CRITICAL**: Review ALL tests using double quotes for expected behavior changes
3. Start with high-priority text directive tests
4. For each test:
   - Update directive syntax (@ → /)
   - Update command brackets ([()] → {})
   - Update comments (>> → //)
   - Add @ prefix to variable declarations
   - Review string interpolation expectations
5. Rebuild fixtures: `npm run build:fixtures`
6. Run tests and fix issues: `npm test`
7. Create PR with comprehensive test coverage

Good luck! The grammar changes are solid - this is mainly a mechanical update process with careful attention to semantic preservation.