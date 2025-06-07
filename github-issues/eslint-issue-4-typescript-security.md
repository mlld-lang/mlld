# Issue: ESLint Phase 4 - TypeScript Type Safety (Security/Registry)

## Summary
Fix TypeScript unsafe any assignments in security and registry modules.

## Current State
- `security/registry/RegistryClient.ts`: ~15 unsafe any errors
- `security/registry/AdvisoryChecker.ts`: ~5 unsafe any errors
- `security/registry/RegistryResolver.ts`: 3 errors
- `security/taint/TaintTracker.ts`: 4 errors
- Mostly from untyped API responses and dynamic requires

## Tasks
- [ ] Define interfaces for GitHub API responses
- [ ] Type the registry.json structure
- [ ] Replace dynamic require with proper imports
- [ ] Add type guards for API response validation
- [ ] Remove explicit any types where possible

## Example Fixes

### RegistryClient.ts
```typescript
interface GistFile {
  filename: string;
  content: string;
}

interface GistResponse {
  files: Record<string, GistFile>;
  history: Array<{ version: string }>;
}

// Use typed response
const gistData = await response.json() as GistResponse;
```

### Type Guards
```typescript
function isRegistryData(data: unknown): data is RegistryData {
  return typeof data === 'object' && 
         data !== null &&
         'modules' in data;
}
```

## Success Criteria
- No unsafe any errors in security modules
- All API responses properly typed
- Type guards for external data
- No dynamic requires

## Time Estimate
2-3 hours

## Why This Matters
- Security modules should be extra type-safe
- External API data needs validation
- Registry is core to module system