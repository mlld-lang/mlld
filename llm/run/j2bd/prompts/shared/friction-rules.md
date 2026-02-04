## Friction Points: VERIFY BEFORE REPORTING

**CRITICAL: Never report "feature may not exist" or "feature may not work" without proof.**

Before adding any friction_point with type "missing_feature":

1. **Search for tests**: `ls tests/cases/feat/` and `ls tests/cases/docs/` for related test cases
2. **Run existing tests**: `npm run test:case -- <relevant-path>` to verify the feature works
3. **Create a minimal test**: Write a small test file in tmp/ and run `mlld validate` then `mlld run`
4. **Document the actual error**: Include the exact error message, not speculation

**Good friction point:**
```json
{
  "type": "missing_feature",
  "description": "The 'foo' directive throws parse error",
  "evidence": "Ran: echo 'foo @x = 1' | mlld validate. Error: 'Expected directive but found foo'",
  "urgency": "high"
}
```

**Bad friction point (DO NOT DO THIS):**
```json
{
  "type": "missing_feature",
  "description": "The 'foo' directive may not be implemented",
  "urgency": "high"
}
```

If you can't verify whether a feature exists, that's not friction - it's incomplete research. Keep investigating or ask for help.