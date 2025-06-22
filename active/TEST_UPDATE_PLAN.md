# Test Update Plan for New Grammar Syntax

## Summary
- **Total test files**: 499 in tests/cases/
- **Files needing updates**: 313 test cases + 43 examples
- **Critical semantic changes**: String interpolation behavior in double quotes

## Update Strategy

### Phase 1: Safe Automated Updates
These can be done with find/replace scripts:

1. **Directive Markers** (@ → /)
   - Safe for all directives at start of lines
   - Pattern: `^@(text|run|add|import|data|exec|path|output|when)`
   
2. **Comments** (>> → //)
   - Simple replacement: `^>>` → `//`
   
3. **Command Brackets** [()] → {} (ONLY for commands)
   - Pattern: `@run \[(\(.*\))\]` → `/run {$1}`
   - Must preserve `[file]` syntax for content loading!

### Phase 2: Variable Declaration Updates
Variable declarations now need @ prefix:
- `/text name = ...` → `/text @name = ...`
- `/data config = ...` → `/data @config = ...`
- `/path docs = ...` → `/path @docs = ...`

### Phase 3: Critical Manual Reviews

#### High Priority - String Interpolation Changes
These tests assume double quotes are literal but will now interpolate:

1. **Text Tests** (`tests/cases/valid/text/`)
   - Check all uses of `"..."` with @ symbols
   - Update expected output or switch to `'...'` for literals

2. **Data Tests** (`tests/cases/valid/data/`)
   - Object/array string values: `{ "msg": "Hello @name" }`
   - Complex nested structures need careful review

3. **Path Tests** (`tests/cases/valid/path/`)
   - Paths like `"./configs/@env/data.json"`
   - Decide if interpolation is desired or use single quotes

4. **Import Tests** (`tests/cases/valid/import/`)
   - Import paths: `from "./modules/@version/lib.mld"`

#### Semantic Preservation Critical Tests
These MUST maintain bracket/quote distinctions:
- `/add [file]` - loads file content
- `/add "text"` - outputs text with interpolation
- `/add 'text'` - outputs literal text

### Phase 4: Error Message Updates
- Search for hardcoded old syntax in error messages
- Update expected error outputs in tests/cases/exceptions/

## Automation Scripts

### Script 1: Basic Syntax Updates (safe-updates.sh)
```bash
#!/bin/bash
# Safe automated updates that don't affect semantics

# Update directive markers
find tests/cases examples -name "*.md" -o -name "*.mld" | while read file; do
  sed -i.bak 's/^@text/\/text/g' "$file"
  sed -i.bak 's/^@run/\/run/g' "$file"
  sed -i.bak 's/^@add/\/add/g' "$file"
  sed -i.bak 's/^@import/\/import/g' "$file"
  sed -i.bak 's/^@data/\/data/g' "$file"
  sed -i.bak 's/^@exec/\/exec/g' "$file"
  sed -i.bak 's/^@path/\/path/g' "$file"
  sed -i.bak 's/^@output/\/output/g' "$file"
  sed -i.bak 's/^@when/\/when/g' "$file"
done

# Update comments
find tests/cases examples -name "*.md" -o -name "*.mld" | while read file; do
  sed -i.bak 's/^>>/\/\//g' "$file"
done
```

### Script 2: Variable Declaration Updates (update-variables.sh)
```bash
#!/bin/bash
# Add @ prefix to variable declarations

find tests/cases examples -name "*.md" -o -name "*.mld" | while read file; do
  # Match directive name = value patterns
  sed -i.bak -E 's/^(\/text|\/data|\/path|\/exec) ([a-zA-Z_][a-zA-Z0-9_]*) =/\1 @\2 =/g' "$file"
done
```

### Script 3: Command Bracket Updates (update-commands.sh)
```bash
#!/bin/bash
# Update command brackets - REQUIRES MANUAL VERIFICATION

find tests/cases examples -name "*.md" -o -name "*.mld" | while read file; do
  # Only update @run and @exec command patterns
  perl -i.bak -pe 's/\/run \[\((.*?)\)\]/\/run {\1}/g' "$file"
  perl -i.bak -pe 's/= \[\((.*?)\)\]/= {\1}/g' "$file"
done
```

## Manual Review Categories

### Category A: String Interpolation Tests
Files to manually review for interpolation changes:
```bash
# Find files with potential interpolation in strings
grep -r '"[^"]*@[a-zA-Z_]' tests/cases --include="*.md" | cut -d: -f1 | sort -u
```

### Category B: Path/File Loading Tests
Files that use [...] for content loading (must NOT be changed to {...}):
```bash
# Find files using bracket syntax for paths/files
grep -r '\[[^(].*\]' tests/cases/valid --include="*.md" | grep -v '\[\[' | cut -d: -f1 | sort -u
```

### Category C: Expected Output Updates
After syntax updates, these need new expected outputs:
- All files in tests/cases/valid/*/expected.md
- Error messages in tests/cases/exceptions/*/error.md

## Execution Order

1. Create new branch: `git checkout -b update-tests-new-syntax`
2. Run safe-updates.sh
3. Run update-variables.sh
4. Manually review command brackets (some [...] must stay!)
5. Review and update string interpolation tests
6. Update expected outputs
7. Run `npm run build:fixtures`
8. Run `npm test` and fix failures iteratively
9. Review error messages for old syntax references
10. Final validation and PR

## Risk Mitigation

1. **Keep .bak files** during updates for rollback
2. **Test incrementally** - update one category at a time
3. **Preserve semantic tests** - some tests verify the bracket/quote distinction
4. **Document changes** - note which tests changed behavior vs just syntax

## Success Criteria

- All 313 test files updated to new syntax
- All 43 example files updated
- Zero test failures after fixture rebuild
- No hardcoded old syntax in error messages
- String interpolation behavior correctly tested