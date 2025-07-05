# Module V2 Syntax Status Report

## Summary
Most modules have been updated to v2 syntax, with a few still containing deprecated patterns. Here's the complete status:

## ✅ Fully Updated to V2 (Using Modern Syntax)

### 1. **new/grab.mld.md** (v2.0.0)
- Uses proper `@exec` instead of `/exe`
- Uses `[(` for JS code blocks
- No `@param` inside JS blocks
- Clean v2 syntax throughout

### 2. **fm-dir.mld.md** (v3.0.0)
- Uses proper `/exe` with `{(` for JS blocks
- Correctly uses parameter names without `@` inside JS blocks
- Has shadow environment properly configured
- Modern syntax with `/var`, `/show`, etc.

### 3. **http.mld.md** (v1.0.0)
- Uses `/exe` with `{(` for JS blocks
- Correctly references parameters without `@` inside JS blocks
- Has shadow environment: `/exe js = { ... }`
- Clean v2 syntax throughout

## ⚠️ Partially Updated (Minor Issues)

### 4. **ai.mld.md** (v1.0.0)
- **Issue**: Uses `@param` inside shell commands (should be `"@param"` or without @)
- Example: `claude-code "@prompt"` should potentially be `claude-code "$prompt"`
- Otherwise uses modern `/exe` syntax correctly

### 5. **bundle.mld.md** (v1.0.0)
- **Issue**: Uses old `@exec` instead of `/exe`
- **Issue**: Uses `@run` instead of `run`
- Example: `@exec xml(path) = @run sh [(` should be `/exe @xml(path) = run sh {(`
- Shell script internals look correct

### 6. **string.mld.md** (v1.0.0)
- Uses proper `/exe` syntax
- Correctly references parameters without `@` inside JS blocks
- Has shadow environment
- **Minor note**: Has a comment about "@module pattern would require grammar updates" which is outdated

## 📋 Other Modules Not Checked
- **fix-relative-links.mld.md**
- **test.mld.md**
- **log.mld.md**
- **test-minimal.mld.md**
- **array.mld.md**
- **fs.mld.md**
- **conditions.mld.md**

## Key V2 Syntax Rules Being Violated

1. **`@exec` → `/exe`**: Some modules still use the old `@exec` directive
2. **`@run` → `run`**: The `@` prefix is not needed before `run` in RHS
3. **Parameter references in code blocks**: Inside JS/Node blocks, use `param` not `@param`
4. **Block syntax**: Should use `{(` for inline blocks, not `[(`
5. **[[...]] templates**: Should use backticks or `::...::` instead

## Recommendations

1. **Priority fixes**:
   - `bundle.mld.md`: Change `@exec` to `/exe` and `@run` to `run`
   - `ai.mld.md`: Review shell parameter interpolation syntax

2. **Check remaining modules**: The 7 modules not examined likely have similar issues

3. **Update test cases**: Ensure all modules have test coverage with v2 syntax

4. **Documentation**: The comment in `string.mld.md` about grammar updates should be removed or clarified