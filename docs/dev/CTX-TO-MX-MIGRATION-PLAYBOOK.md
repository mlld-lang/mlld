# Migration Playbook: ctx → mx

This playbook documents the steps to migrate from `@ctx`/`.ctx` to `@mx`/`.mx` ("mlld execution and metadata context").

## Why mx?

- `x` was too generic - collides with common variable names (`@x`, `@xml`, parameter `x`)
- `mx` is short but unique enough to avoid collisions
- Mnemonic: "mlld execution context" or "metadata context"

## Lessons Learned (from failed x migration)

1. **Generic names cause collisions**: `@x` is commonly used as a loop variable, parameter name, and appears in other names like `@xml`
2. **sed `s/ctx/x/g` is too aggressive**: It catches substrings (e.g., `@xml` → `@xvml` when `ctx` isn't even present, but `@x` → `@v` catches `xml`)
3. **File types matter**: Must hit `.ts`, `.mld`, `.md`, `.txt`, `.peggy`, `.js` in scripts/errors
4. **Directory/file names need renaming**: Test directories like `ctx-hint-flow-basic/` need to become `mx-hint-flow-basic/`
5. **Function names need careful handling**: TypeScript functions like `ctxToSecurityDescriptor` should become descriptive names, not just `mxToSecurityDescriptor`
6. **Order matters**: Pre-migration fixes must happen BEFORE the main replacement

## Pre-Migration Checklist

- [ ] Create a new branch: `git checkout -b ctx-to-mx`
- [ ] Ensure all tests pass: `npm test`
- [ ] Verify no uncommitted changes: `git status`

## Step 1: Audit for Collisions

Check if `mx` appears anywhere in the codebase (it shouldn't):

```bash
grep -r "@mx\|\.mx" . --include="*.ts" --include="*.mld" --include="*.md" | grep -v node_modules
```

If any matches, choose a different name.

## Step 2: Rename TypeScript Helper Functions (Manual)

These functions have `ctx` in their names and need thoughtful renaming:

### core/types/variable/CtxHelpers.ts → VarMxHelpers.ts

| Old Name | New Name |
|----------|----------|
| `ctxToSecurityDescriptor` | `varMxToSecurityDescriptor` |
| `legacyMetadataToCtx` | `legacyMetadataToVarMx` |
| `updateCtxFromDescriptor` | `updateVarMxFromDescriptor` |
| `hasSecurityContext` | `hasSecurityVarMx` |
| `serializeSecurityContext` | `serializeSecurityVarMx` |
| `flattenLoadResultToCtx` | `flattenLoadResultToVarMx` |
| `ctxToLoadResult` | `varMxToLoadResult` |

### Local functions in other files

| File | Old Name | New Name |
|------|----------|----------|
| `interpreter/utils/structured-value.ts` | `ctxToSecurityDescriptor` (local) | `varMxToSecurityDescriptor` |
| `interpreter/utils/structured-value.ts` | `buildCtxFromMetadata` | `buildVarMxFromMetadata` |
| `interpreter/hooks/taint-post-hook.ts` | `descriptorFromCtx` | `descriptorFromVarMx` |
| `interpreter/eval/exec-invocation.ts` | `descriptorFromCtx` | `descriptorFromVarMx` |

**Process:**
1. Rename file: `mv core/types/variable/CtxHelpers.ts core/types/variable/VarMxHelpers.ts`
2. Update function names in the file
3. Update all imports: `sed -i '' "s/from '.*CtxHelpers'/from '...VarMxHelpers'/g"`
4. Update all call sites

## Step 3: Rename Test Directories

```bash
# Find directories with ctx in name
find tests/cases -type d -name "*ctx*"

# Rename each one
for dir in $(find tests/cases -type d -name "*ctx*"); do
  newdir=$(echo "$dir" | sed 's/ctx/mx/g')
  mv "$dir" "$newdir"
done
```

## Step 4: Rename Test Support Files

```bash
# Find files with ctx in filename
find tests/cases -type f -name "*ctx*"

# Rename each one
for file in $(find tests/cases -type f -name "*ctx*"); do
  newfile=$(echo "$file" | sed 's/ctx/mx/g')
  mv "$file" "$newfile"
done
```

## Step 5: Global Find-Replace (All File Types)

Run the replacement on each file type separately to ensure nothing is missed:

```bash
# TypeScript files
grep -rl "ctx" --include="*.ts" . | grep -v node_modules | grep -v dist | \
  xargs -I{} sed -i '' 's/ctx/mx/g' {}

# mlld files
grep -rl "ctx" --include="*.mld" . | grep -v node_modules | \
  xargs -I{} sed -i '' 's/ctx/mx/g' {}

# Markdown files (excluding CHANGELOG.md for history)
grep -rl "ctx" --include="*.md" . | grep -v node_modules | grep -v CHANGELOG.md | \
  xargs -I{} sed -i '' 's/ctx/mx/g' {}

# Text files
grep -rl "ctx" --include="*.txt" . | grep -v node_modules | \
  xargs -I{} sed -i '' 's/ctx/mx/g' {}

# Peggy grammar files
grep -rl "ctx" --include="*.peggy" . | \
  xargs -I{} sed -i '' 's/ctx/mx/g' {}

# JavaScript files in errors/ and scripts/
grep -rl "ctx" errors/ scripts/ --include="*.js" | \
  xargs -I{} sed -i '' 's/ctx/mx/g' {}
```

## Step 6: Rebuild Grammar

```bash
npm run build:grammar
```

## Step 7: Run Tests

```bash
npm test
```

## Step 8: Fix Test Failures

Common issues to look for:

1. **Missing file references**: Test files reference support files that were renamed
   - Check error messages for "Failed to load content: mx-..."
   - Ensure file renames in Step 4 were complete

2. **Output mismatches**: Expected output still says `ctx` but actual says `mx`
   - Regenerate fixtures: `npm run build:fixtures`

3. **Type errors**: Import paths or function names not updated
   - Check TypeScript compilation: `npm run build`

## Step 9: Update Documentation Explanations

The global replace changes syntax but not explanations. Update these manually:

| File | What to Update |
|------|----------------|
| `docs/user/introduction.md` | Explain what `@mx` is |
| `docs/user/content-and-data.md` | `.mx` namespace documentation |
| `docs/user/flow-control.md` | `@mx.try`, `@mx.stage`, etc. |
| `docs/user/security.md` | `@mx.guard.*` reference section |
| `docs/dev/DATA.md` | Internal `.mx` documentation |
| `llms.txt` | LLM-facing documentation |
| `README.md` | Quick reference examples |

**Key phrasings:**
- "The `@mx` variable provides execution and metadata context"
- "Access metadata via `.mx` (e.g., `@file.mx.filename`)"
- "`@mx` for execution context, `.mx` for value metadata"

## Step 10: Commit

```bash
git add -A
git commit -m "migrate ctx -> mx (mlld execution/metadata context)

- Renamed @ctx ambient variable to @mx
- Renamed .ctx metadata field to .mx
- Updated helper functions to use VarMx prefix
- Updated all documentation

🤖 Generated with Claude Code"
```

## Verification Checklist

- [ ] `grep -r "@ctx\|\.ctx" . --include="*.ts" | grep -v node_modules` returns nothing
- [ ] `grep -r "@ctx\|\.ctx" . --include="*.mld"` returns nothing
- [ ] `grep -r "@ctx\|\.ctx" . --include="*.md" | grep -v CHANGELOG` returns nothing
- [ ] `npm test` passes
- [ ] `npm run build` passes
- [ ] Documentation accurately describes `@mx` and `.mx`

## Rollback

If something goes wrong:

```bash
git checkout -f <original-branch>
git branch -D ctx-to-mx
```
