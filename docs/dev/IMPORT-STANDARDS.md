# Import Path Standards in Mlld

This document outlines the standards for import paths in the Mlld codebase to ensure consistency and compatibility with ES modules in Node.js.

## Key Standards

### 1. Use Path Aliases

Always use the configured path aliases from `tsconfig.json` instead of relative paths when possible:

```typescript
// ✅ CORRECT: Use path aliases
import { Service } from '@services/path/Service.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';

// ❌ INCORRECT: Don't use relative paths when aliases are available
import { Service } from '../../services/path/Service.js';
import { TestContextDI } from '../../../tests/utils/di/TestContextDI.js';
```

### 2. Include `.js` Extensions

Always include `.js` extensions in import paths for all internal modules. This is required for ES modules in Node.js.

```typescript
// ✅ CORRECT: Include .js extension
import { Service } from '@services/path/Service.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';

// ❌ INCORRECT: Missing .js extension
import { Service } from '@services/path/Service';
import { TestContextDI } from '@tests/utils/di/TestContextDI';
```

### 3. Use `import type` for Type-Only Imports

Use `import type` for imports that are only used for types to improve build performance:

```typescript
// ✅ CORRECT: Use 'import type' for type-only imports
import type { IService } from '@services/path/IService.js';

// ❌ INCORRECT: Don't use regular imports for types only
import { IService } from '@services/path/IService.js';
```

### 4. External Modules

For external modules from `node_modules`, do not add `.js` extensions:

```typescript
// ✅ CORRECT: External modules without .js
import { describe, it, expect } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import type { MlldNode } from 'mlld-spec';
```

## Available Path Aliases

The following path aliases are configured in `tsconfig.json`:

| Alias | Path |
|-------|------|
| `@core` | `./core` |
| `@services` | `./services` |
| `@tests` | `./tests` |
| `@api` | `./api` |

## Automated Fixing

A script is available to automatically fix import paths throughout the codebase:

```bash
# Run the script to fix import paths in test files
node scripts/fix-import-paths.js
```

The script will:
1. Add `.js` extensions to internal module imports
2. Replace relative paths with path aliases where possible
3. Skip external modules and already correct imports

## Common Issues and Solutions

### Import Resolution in Tests

When writing tests, always use the correct import paths to avoid resolution issues:

```typescript
// ✅ CORRECT
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';

// ❌ INCORRECT: Missing .js extension
import { TestContextDI } from '@tests/utils/di/TestContextDI';
```

### Circular Dependencies

If you encounter circular dependency issues, consider:

1. Using `import type` for type-only imports
2. Restructuring the code to avoid the circular dependency
3. Creating a shared interface in a separate file

```typescript
// Avoid circular dependencies
import type { IService } from '@services/shared/interfaces.js';
```

## ESM Compatibility

The Mlld codebase uses ES modules, which requires:

1. `.js` extensions in import paths
2. Top-level `await` support
3. Named exports instead of default exports

Following these standards ensures proper module resolution and compatibility with ES modules in Node.js. 