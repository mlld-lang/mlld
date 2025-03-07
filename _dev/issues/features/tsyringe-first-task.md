# TSyringe DI Cleanup: First Task

## First Task: Path Normalization Utility

The path normalization utility is an excellent first step in our cleanup because:
1. It's self-contained and doesn't require changing the dual-mode system
2. It can be implemented gradually
3. It addresses a significant source of brittleness in the test suite

## Implementation Steps

### 1. Create the Core Utility

Create a standardized path normalization utility in PathOperationsService:

```typescript
/**
 * Normalize a file path to the standard format used throughout the codebase.
 * This ensures consistent handling of paths across different platforms and contexts.
 * 
 * Standard format:
 * - Always use forward slashes, never backslashes
 * - Paths are always absolute (start with '/')
 * - No trailing slashes except for root ('/')
 */
export function normalizeMeldPath(path: string): string {
  if (!path) return '/';
  
  // Replace backslashes with forward slashes
  let normalized = path.replace(/\\/g, '/');
  
  // Ensure path starts with a slash
  if (!normalized.startsWith('/')) {
    normalized = '/' + normalized;
  }
  
  // Remove trailing slash unless it's the root path
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  
  return normalized;
}
```

Add this as both a method on PathOperationsService and as a standalone function for flexibility.

### 2. Update TestSnapshot First

Update the TestSnapshot class to use the new utility without changing behavior:

```typescript
private normalizePaths(snapshot: Map<string, string>): Map<string, string> {
  const normalized = new Map<string, string>();
  
  for (const [path, content] of snapshot.entries()) {
    // Use new utility but maintain backward compatible behavior
    let normalizedPath = normalizeMeldPath(path);
    
    // Apply any test-specific adaptations needed for compatibility
    if (this.isTestContextTest) {
      normalizedPath = this.adaptPathForTestContext(normalizedPath);
    }
    
    normalized.set(normalizedPath, content);
  }
  
  return normalized;
}
```

This provides the utility while keeping compatibility with existing tests.

### 3. Document the Approach

Add documentation for path normalization in the codebase:
- Add to docs/dev/DI.md
- Add comments in key locations where path normalization is used
- Document the standard format and rationale

### 4. Verify with Tests

Create specific tests for the path normalization utility:
- Test various input formats
- Verify it handles edge cases correctly
- Ensure it's consistent across platforms

### 5. Gradual Integration

Once the utility and TestSnapshot changes are in place and tested:
- Identify other key places where path normalization occurs
- Begin carefully replacing custom normalization with the standard utility
- Test thoroughly after each change

## Testing Strategy

For this task:
1. Create a separate branch
2. Implement the utility and core TestSnapshot changes
3. Run the full test suite to ensure nothing breaks
4. If all tests pass, proceed with additional integration
5. If tests fail, isolate issues and fix them before proceeding

## Expected Outcomes

After completing this task:
- Path normalization will be more consistent and reliable
- TestSnapshot will use the standardized approach
- The codebase will be better prepared for further DI cleanup
- No existing tests will be broken

## Next Steps After Completion

After successfully implementing path normalization:
1. Document the patterns of usage discovered
2. Identify a simple service constructor to clean up
3. Begin planning more comprehensive path normalization across the codebase