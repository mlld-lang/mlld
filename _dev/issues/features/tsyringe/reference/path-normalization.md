# Path Normalization Standards

This document outlines the standardized approach to path handling in the Meld codebase, which is essential for consistent behavior across different platforms and test environments.

## The Problem

Path handling in the codebase was previously inconsistent and led to several issues:

1. **Platform Differences**: Different behavior between Windows (backslashes) and Unix (forward slashes)
2. **Test Inconsistencies**: Different test suites expected different path formats
3. **Comparison Failures**: Path comparison in TestSnapshot would fail due to format differences
4. **Brittle Detection Logic**: Code had to detect which test was running to handle paths correctly

## Standardized Approach

### Path Format Rules

All paths in the Meld codebase should follow these standardization rules:

1. **Always use forward slashes**, never backslashes (even on Windows)
2. **Paths always start with a slash** to indicate they are absolute
3. **No trailing slashes** except for the root path ('/')

### Implementation

The standardized approach is implemented through the `normalizeMeldPath` utility:

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

### Usage Guidelines

#### When to Use Path Normalization

Path normalization should be used in the following scenarios:

1. **Path Comparisons**: Any time paths are being compared
2. **Path Storage**: When storing paths in data structures
3. **Path APIs**: Public APIs that accept or return paths
4. **Test References**: When referencing paths in tests

#### Where It's Implemented

The `normalizeMeldPath` utility is currently implemented in:

1. **PathOperationsService**: As both an instance method and a standalone function
2. **TestSnapshot**: For normalizing paths in snapshot comparisons

#### How to Use It

```typescript
// As a standalone function
import { normalizeMeldPath } from './path-operations';

const normalizedPath = normalizeMeldPath(userProvidedPath);

// As a PathOperationsService method
const pathOps = new PathOperationsService();
const normalizedPath = pathOps.normalizeMeldPath(userProvidedPath);
```

## Testing Considerations

### Path Normalization in Tests

When writing tests that involve paths:

1. **Always normalize paths** before comparison
2. **Use forward slashes** in expected path values
3. **Start paths with a slash** in test expectations
4. **Avoid platform-specific assumptions** about path format

### Test Helpers

```typescript
// Helper for test path expectations
function expectNormalizedPath(actual: string, expected: string): void {
  expect(normalizeMeldPath(actual)).toBe(normalizeMeldPath(expected));
}
```

## Migration Plan

To fully implement path normalization throughout the codebase:

1. **Identify remaining services** that handle paths but don't use normalization
2. **Update path handling logic** to use the standardized utility
3. **Update tests** to have consistent path expectations
4. **Remove any remaining special case handling** for paths

## Additional Resources

For more information on path handling:

- [Node.js Path Module Documentation](https://nodejs.org/api/path.html)
- [Path Handling Best Practices](https://developer.mozilla.org/en-US/docs/Web/API/FileSystem) 