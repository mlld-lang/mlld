# Empty String Variable Bug

## Issue Summary
The grammar architecture fixes successfully implemented consistent array structures for directive values, but revealed a critical bug: empty string variables produce empty arrays instead of arrays containing empty Text nodes.

## Root Cause
When parsing `/var @test = ""`, the grammar produces:
```json
{
  "kind": "var",
  "values": {
    "identifier": [{ "type": "VariableReference", "identifier": "test" }],
    "value": []  // ❌ Empty array instead of [{ "type": "Text", "content": "" }]
  }
}
```

This causes "Var directive missing value" errors because the var evaluator correctly rejects empty value arrays.

## Evidence
1. **Empty string test**: `/var @test = ""` → `"value": []`
2. **Non-empty string test**: `/var @test = "hello"` → `"value": [{ "type": "Text", "content": "hello" }]`
3. **Failing tests**: Multiple when directive tests that use `/var @isAdmin = ""` etc.

## Impact
- 54 test failures (up from 14) because many tests use empty string variables
- Affects when directive tests specifically: when-any-block-action, when-block-any, etc.
- Template interpolation may also be affected

## Fix Required
The template parsing logic needs to ensure that empty strings create Text nodes with empty content, not empty arrays:

**Expected behavior:**
```json
"value": [
  {
    "type": "Text", 
    "content": "",
    "location": {...}
  }
]
```

**Current (broken) behavior:**
```json
"value": []
```

## Test Case to Verify Fix
```bash
cat > /tmp/test-empty.mld << 'EOF'
/var @empty = ""
/var @nonempty = "hello"
/show @empty
/show @nonempty
EOF

cat /tmp/test-empty.mld | npm run ast
# Should show both vars with proper Text nodes in value arrays
```

## Status
- ✅ Grammar architecture fixes (identifier/namespace arrays) working correctly
- ✅ Grammar directive structure tests passing (7/7)
- ❌ Empty string template parsing broken
- ❌ 54 test failures due to this issue

## Next Steps
1. Fix template parsing to handle empty strings correctly
2. Verify fix with empty string test case
3. Re-run test suite to confirm back to ~14 failures
4. Address remaining interpreter issues methodically