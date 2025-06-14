# Resolver Branch Production Validation Plan

## Overview
This plan ensures the resolver branch is production-ready before merging to main.

## 1. Backward Compatibility Testing (Critical)

### Test Existing Examples
```bash
# Run all examples from main branch against resolver branch
for file in examples/*.mld examples/*.md; do
  echo "Testing: $file"
  mlld-resolvers "$file" --stdout > /tmp/resolver-output.txt
  # Compare with output from main branch
done
```

### Key Files to Test:
- `examples/complex-test-*.mld` - Complex real-world scenarios
- `examples/imports.mld` - Import functionality
- `examples/http-namespace.mld` - Module system
- Any files using @PROJECTPATH (was broken in main)

## 2. Performance Testing

### Memory Usage
```bash
# Test with large files
time mlld-resolvers large-file.mld --stdout
# Monitor memory usage during execution
```

### Resolver Resolution Speed
- Test resolver lookup performance
- Ensure caching works correctly
- Verify no performance regression

## 3. Error Handling Validation

### Test Error Scenarios:
1. **Invalid resolver references**: `@import { x } from @NONEXISTENT`
2. **Circular imports**: Create files that import each other
3. **Network failures**: Test HTTP resolver with bad URLs
4. **Permission errors**: Test LocalResolver with unreadable files
5. **Malformed content**: Import files with syntax errors

### Expected Behavior:
- Clear, actionable error messages
- Proper error types (not generic Error)
- Source context in errors
- No crashes or hangs

## 4. Resolver-Specific Testing

### Built-in Resolvers:
```mlld
# Test TIME resolver
@import { iso, unix, date } from @TIME
@add [[Current time: {{iso}}]]

# Test DEBUG resolver  
@import { reduced, full } from @DEBUG
@add @reduced

# Test INPUT resolver
echo '{"test": "data"}' | mlld-resolvers test.mld --stdin

# Test PROJECTPATH resolver
@path config = "@PROJECTPATH/package.json"
@add @config
```

### Custom Resolvers:
- Test LocalResolver with various file types
- Test HTTPResolver with real URLs
- Test RegistryResolver when registry is populated

## 5. Integration Testing

### With Existing Tools:
1. **VS Code extension**: Does syntax highlighting still work?
2. **CLI commands**: All flags working correctly?
3. **API usage**: `processMlld()` function behavior unchanged?

### With CI/CD:
- Run full test suite on different platforms (Mac, Linux, Windows)
- Test with different Node versions

## 6. Security Validation

### Path Traversal:
```mlld
@import { x } from "../../../etc/passwd"
@path secret = "@PROJECTPATH/../../../etc/passwd"
```

### URL Security:
- Test with malicious URLs
- Verify domain blocking works
- Check redirect limits

## 7. Documentation Review

### Update Needed:
- [ ] README.md - Document new resolver system
- [ ] docs/dev/RESOLVERS.md - Already created
- [ ] Migration guide for custom resolvers
- [ ] Error reference for new error types

## 8. Real-World Testing

### Create Test Projects:
1. **Documentation generator** using multiple resolvers
2. **Build script** using @PROJECTPATH extensively  
3. **Data pipeline** using HTTP and local resolvers
4. **Module library** testing import/export

### Run in Production-Like Environment:
- Test with real file systems (not just MemoryFileSystem)
- Test with actual network requests
- Test with real stdin/stdout piping

## 9. Regression Testing

### Known Issues Fixed:
- [x] @PROJECTPATH was broken in main
- [x] Import error messages were unclear
- [x] Content type detection was inconsistent

### Verify Still Working:
- [ ] All examples from main branch
- [ ] All documented mlld syntax
- [ ] All CLI flags and options

## 10. Rollback Plan

### If Issues Found:
1. Document the issue clearly
2. Determine if it's a blocker
3. Have rollback strategy ready
4. Consider feature flags for gradual rollout

### Merge Strategy:
- Consider squash merge for cleaner history
- Or preserve commits for debugging
- Tag release before and after merge

## Success Criteria

✅ All backward compatibility tests pass
✅ No performance regression (within 5%)
✅ All error scenarios handled gracefully
✅ All resolvers working as designed
✅ Security tests show no vulnerabilities
✅ Documentation updated
✅ At least 2 real-world projects tested
✅ All regression tests pass

## Notes for Next Claude

1. Start with backward compatibility - it's the most critical
2. The resolver system is a fundamental change, be thorough
3. Pay special attention to error messages - they're user-facing
4. Test both happy paths and edge cases
5. Document any issues found with reproducible examples

## Current Known Issues

1. Registry resolver tests skipped (Issue #254) - registry not populated
2. Some template parsing issues (Issue #236) - pre-existing

## Confidence Builders

- Run this plan systematically
- Create a checklist and check off items
- For any failures, determine if they're new or pre-existing
- Get a second opinion on any concerns
- Consider a staged rollout if still uncertain