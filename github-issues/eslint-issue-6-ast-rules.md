# Issue: ESLint Phase 6 - Custom AST Rule Refinement

## Summary
Review and fix remaining AST rule violations after string manipulation exemptions have been added.

## Current State
- Many eslint-disable comments for AST rules throughout interpreter
- Some are legitimate violations that should be refactored
- Need to distinguish real AST manipulation from regular string operations
- ~1000+ disabled rule instances

## Tasks
- [ ] Audit all eslint-disable-next-line comments for AST rules
- [ ] Categorize into: legitimate exemption vs needs refactoring
- [ ] Refactor code that genuinely violates AST principles
- [ ] Remove unnecessary disable comments
- [ ] Document patterns for future reference

## Focus Areas
1. **interpreter/eval/*.ts** - Main evaluation logic
2. **interpreter/core/interpreter.ts** - Core interpreter
3. **core/resolvers/*.ts** - Path resolution logic

## Example Refactors

### Before (String Manipulation)
```typescript
// eslint-disable-next-line mlld/no-ast-string-manipulation
if (content.startsWith('@')) {
  // Process directive
}
```

### After (AST Evaluation)
```typescript
const firstNode = nodes[0];
if (firstNode?.type === 'Directive') {
  // Process directive node
}
```

## Success Criteria
- Significant reduction in eslint-disable comments
- Clear documentation of legitimate exemptions
- Consistent AST evaluation patterns
- No string manipulation on AST content

## Time Estimate
3-4 hours

## Why This Matters
- Ensures we're using AST properly as designed
- Reduces technical debt
- Makes code more maintainable
- Prevents regression to string manipulation