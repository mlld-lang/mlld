### Commit
Stage and commit your changes:
```bash
git add <files>
git commit -m "<descriptive message>"
```

### Verify (run tests)
After committing, run the test suite:
```bash
npm test
```

**If tests fail:**
1. Revert your commit: `git revert HEAD --no-edit`
2. Add a note to the ticket: `tk add-note <ticket-id> "Attempted: <what you tried>. Tests failed: <error summary>. Learned: <insights>."`
3. Return status "blocked" with friction_points explaining the failure

**If tests pass:** Continue to return status.