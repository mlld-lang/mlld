
You are working on the mlld project ESLint cleanup effort. Your task is to complete one specific phase of the cleanup.

### Initial Setup

1. First, use the gh CLI to review your assigned GitHub issue:
   ```bash
   gh issue view 189
   ```

2. Review the issue details carefully - it contains:
   - Specific tasks to complete
   - Affected files
   - Success criteria
   - Time estimate
   - Example fixes (where applicable)

### Working Guidelines

1. **Create a new branch** for your work:
   ```bash
   git checkout -b fix/eslint-phase-4
   ```

2. **Focus only on your assigned phase** - do not fix issues outside your scope, even if you see them

3. **Run ESLint frequently** to check progress:
   ```bash
   npm run lint 2>&1 | grep -E "(filename|error|warning)" | grep -A5 -B5 "your-target-files"
   ```

4. **Test your changes**:
   - Run `npm test` for any files you modify
   - Run `npm run build` if you change TypeScript types
   - Ensure no new errors are introduced

5. **Commit with descriptive messages** referencing the issue:
   ```bash
   git commit -m "fix: ESLint Phase 4 - [brief description]
   
   - [List specific changes]
   - [List specific changes]
   
   Part of #189"
   ```

### Important Context

- The project uses custom ESLint rules for AST handling (mlld/no-raw-field-access, mlld/no-ast-string-manipulation)
- ESLint config is in `eslint.config.mjs`
- The codebase recently had 741 auto-fixable issues resolved in Phase 1
- Total remaining issues: ~2,464 (1,373 errors, 1,091 warnings)

### Phase-Specific Notes

- **If working on CLI/console issues**: The CLI legitimately needs console.log for user output
- **If working on TypeScript issues**: Look for `@typescript-eslint/no-unsafe-*` errors
- **If working on test files**: Test utilities may have different needs than production code
- **If working on unused variables**: Use `_` prefix for intentionally unused variables

### Completion Checklist

- [ ] All tasks from the GitHub issue are complete
- [ ] No new ESLint errors introduced
- [ ] Tests pass
- [ ] Build succeeds (if applicable)
- [ ] Changes committed with proper message
- [ ] Ready to create PR

When complete, create a PR with:
```bash
gh pr create --title "fix: ESLint Phase 4 - [Issue Title]" \
  --body "Closes #189
  
  ## Changes
  - [List changes]
  
  ## Results
  - [X] errors/warnings fixed in [describe scope]
  - All tests passing
  - Build successful"
```
