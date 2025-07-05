# Technical Debt: Prettier v3 Process Hanging Issue

## Summary

mlld uses Prettier v3 for markdown formatting, but Prettier has a bug that causes Node.js processes to hang (not exit naturally) after formatting markdown content. We have implemented a workaround using `process.exit(0)` in the CLI.

## Root Cause

After extensive investigation, we discovered:

1. **The issue is NOT mlld-specific** - it's a bug in Prettier v3 when formatting markdown
2. **Prettier v3.6.2** (latest as of June 2025) still has this issue
3. **Root cause**: The `unified` v9.2.2 package (used by Prettier for markdown parsing) creates over 41,000 unresolved promises that prevent Node.js from exiting

## Technical Details

### What Happens
When Prettier formats markdown content:
1. It dynamically imports the markdown parser plugin
2. The parser uses `unified` v9.2.2 with `remark-parse` v8.0.3
3. These packages create thousands of internal promises during parsing
4. The promises are never resolved/cleaned up
5. Node.js event loop stays active waiting for these promises
6. Process hangs indefinitely after successful completion

### Evidence
- Any mlld file containing markdown (even just `# comment`) triggers the issue
- Running with `--no-format` flag (disables Prettier) allows normal exit
- Testing shows 2 Socket handles remain open after formatting
- Over 41,000 async resources (mostly promises) are created by unified

## Current Workaround

In `cli/index.ts` (around line 1132):
```typescript
// Force exit if not in stdout mode but cleanup is complete
// This is a workaround for a Prettier v3 bug where the process doesn't exit naturally
// after formatting markdown content. The issue persists in v3.6.2.
console.log('DEBUG: Forcing process exit after cleanup');
await new Promise(resolve => setTimeout(resolve, 50));
process.exit(0);
```

## Impact

- **Functionality**: None - scripts execute correctly and produce expected output
- **User Experience**: Minimal - users might notice the "Forcing process exit" debug message
- **Testing**: Tests must account for forced exit behavior
- **Development**: Developers should be aware of this workaround

## Alternative Solutions

1. **Disable Prettier for markdown**: Users can use `--no-format` flag
2. **Upgrade Prettier dependencies**: Would require Prettier to upgrade unified from v9 to v11
3. **Use alternative formatter**: Replace Prettier with a different markdown formatter
4. **Isolate in worker thread**: Run Prettier in a worker that can be terminated

## Long-term Resolution

This should be fixed upstream in Prettier by:
1. Upgrading `unified` to v11.x (current v9.2.2 is outdated)
2. Adding proper cleanup for the markdown parser
3. Ensuring all promises are resolved after formatting

## Related Files

- `/cli/index.ts` - Contains the `process.exit(0)` workaround
- `/interpreter/utils/markdown-formatter.ts` - Uses Prettier for formatting
- `/docs/dev/ISSUE-namespace-import-hanging.md` - Original (incorrect) investigation
- `/NAMESPACE-IMPORT-HANGING-SOLUTION.md` - Correct root cause analysis

## Testing for Resolution

To test if this issue is resolved in future Prettier versions:
1. Remove the `process.exit(0)` workaround
2. Run: `echo "# Test" | mlld run -`
3. Check if process exits naturally (it currently hangs)

## References

- Prettier uses outdated unified/remark packages that leak promises
- Similar issues reported with unified v9 memory/resource management
- The issue is specific to markdown - other formatters work fine

**Labels**: `technical-debt`, `upstream-bug`, `workaround-in-place`