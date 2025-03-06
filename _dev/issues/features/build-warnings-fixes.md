# Build System Warnings - Potential Improvements

## Overview

During the build process, several warnings appear that should be addressed to improve the developer experience, build performance, and package consumption. These are not critical issues but represent opportunities for improvement.

## Warnings

### 1. Decorator Metadata Warning

```
ESM You have emitDecoratorMetadata enabled but @swc/core was not installed, skipping swc plugin
```

#### Impact
- Build process is slower than it could be
- Potentially missing optimizations in the build pipeline

#### Proposed Solution
Install `@swc/core` as a dev dependency to enable faster builds:

```bash
npm install --save-dev @swc/core
```

### 2. Package Exports Configuration Warning

```
[WARNING] The condition "types" here will never be used as it comes after both "import" and "require" [package.json]
```

#### Impact
- TypeScript users might have issues with type imports in certain scenarios
- Suboptimal package.json exports configuration

#### Proposed Solution
Reorder the conditions in the package.json's exports field to ensure types are prioritized:

```json
"exports": {
  ".": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.mjs",
    "require": "./dist/index.cjs"
  }
}
```

### 3. Mixed Exports Warning

```
Entry module "dist/index.cjs" is using named and default exports together. Consumers of your bundle will have to use `chunk.default` to access the default export...
```

#### Impact
- Inconsistent import patterns required for consumers
- Potentially confusing API for library users

#### Proposed Solution
Option 1: Standardize the codebase to use only named exports.

Option 2: Configure tsup in tsup.config.ts by adding the `output` property to each configuration object:

```typescript
// Add to the API build config (first entry in the array)
{
  entry: {
    index: 'api/index.ts',
  },
  // ... existing config
  output: {
    exports: 'named'
  }
}

// Also add to CLI build config if needed
```

## Implementation Notes

The current build configuration in `tsup.config.ts` defines two separate build configurations:
1. One for the API (both CJS and ESM formats)
2. One for the CLI (CJS format only)

The changes would need to be applied to both configurations as appropriate.

## Implementation Priority
Medium - These are quality-of-life improvements that would enhance the developer experience but don't affect core functionality.

## Related Issues
- None 