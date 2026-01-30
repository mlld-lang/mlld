I've carefully reviewed Prior Claude's patterns.md output against the MLLD syntax guide. Here are the critical accuracy issues that need to be fixed:

## CRITICAL ERRORS TO FIX

### 1. Invalid `/import` syntax
**Problem**: Multiple uses of invalid import syntax
**Examples**:
```mlld
❌ /import { validateSchema, retry } from @mlld/core
❌ /import { createUser, updateUser } from @company/user-management
```
**Fix**: According to RULE_9, modules don't use quotes:
```mlld
✅ /import { validateSchema, retry } from @mlld/core
✅ /import { createUser, updateUser } from @company/user-management
```

### 2. Invalid `throw` statements
**Problem**: Using `throw` which doesn't exist in mlld
**Examples**:
```mlld
❌ * => throw "Missing required config: apiUrl, timeout"
❌ * => throw "Unsupported type: @type"
```
**Fix**: Use error messages or validation patterns instead:
```mlld
✅ * => "ERROR: Missing required config: apiUrl, timeout"
```

### 3. Invalid JavaScript in `/exe js` blocks
**Problem**: Referencing mlld functions inside JS blocks
**Examples**:
```mlld
❌ /exe @collectAndSelect(input) = when [
  * => js {
    const scored = @p.retries.all.map(r => ({
      response: r,
      score: @scoreResponse(r)  // Invalid - can't call mlld functions in JS
    }));
```
**Fix**: Keep JS pure or use mlld pipeline patterns

### 4. Invalid variable interpolation patterns
**Problem**: Using interpolation in contexts that don't support it
**Examples**:
```mlld
❌ /var @models = ["claude-3", "gpt-4", "gemini-pro"]
❌ /exe @queryModel(model, prompt) = run "@model -p '@prompt'"
```
**Fix**: Variables in commands should use @variable syntax in braces:
```mlld
✅ /exe @queryModel(model, prompt) = run {echo "@model -p @prompt"}
```

### 5. Missing `/var` declarations
**Problem**: Using variables without proper declaration
**Need to add**: Proper variable declarations for examples

### 6. Invalid method chaining
**Problem**: Using non-existent methods
**Examples**:
```mlld
❌ @users.filter(u => u.isActive).length
```
**Fix**: Use proper builtin methods or move complex logic to JS blocks

### 7. Invalid `foreach` usage
**Problem**: Using `foreach` incorrectly in some contexts
**Examples need review**: Ensure `foreach` is used for transformations, `/for` for execution

### 8. Template syntax errors
**Problem**: Some template examples mix syntaxes incorrectly

### 9. Invalid pipeline context usage
**Problem**: Using `@mx` and `@p` in contexts where they're not available

## RECOMMENDATIONS

1. **Test all code examples** using `npm run ast --` to verify syntax
2. **Use simpler, validated patterns** from tests/cases/valid/
3. **Remove complex JavaScript examples** that can't be verified
4. **Focus on patterns that match existing test cases**
5. **Add proper error handling** using `/when` patterns instead of exceptions

The document has good structure and valuable patterns, but needs syntax accuracy fixes throughout. Every code block should be runnable mlld code.