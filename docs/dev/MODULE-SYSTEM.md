# Module System in Meld

This document describes the module system used in the Meld codebase, providing guidance on import/export patterns, module configuration, and best practices.

## Overview

Meld uses ECMAScript Modules (ESM) as its primary module system, with support for CommonJS (CJS) compatibility through dual publishing. This approach provides the following benefits:

1. Better compatibility with the modern JavaScript ecosystem
2. Proper tree-shaking and dead code elimination
3. Improved type checking and module resolution
4. Standard compliance with Node.js ESM specifications

## Module Configuration

### TypeScript Configuration

The TypeScript configuration in `tsconfig.json` is set up for modern ES modules:

```json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2020",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
    // Other options...
  }
}
```

Key settings:
- `module: "NodeNext"`: Outputs ES modules with Node.js-specific features
- `moduleResolution: "NodeNext"`: Uses Node.js resolution algorithm for imports
- `isolatedModules`: Ensures each file can be separately compiled
- `verbatimModuleSyntax`: Preserves import/export statements during compilation

### Package Configuration

The `package.json` file is configured for dual ESM/CJS publishing:

```json
{
  "type": "module",
  "main": "dist/index.cjs",
  "module": "dist/index.mjs",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.ts",
        "default": "./dist/index.mjs"
      },
      "require": {
        "types": "./dist/index.d.ts",
        "default": "./dist/index.cjs"
      }
    }
  }
}
```

Key settings:
- `"type": "module"`: Defines all `.js` files as ES modules by default
- `"main"`: Entry point for CommonJS consumers
- `"module"`: Entry point for ESM consumers
- `"exports"`: Provides conditional exports based on module system

### Build Configuration

The build system (using tsup/esbuild) is configured to output both ESM and CJS:

```typescript
export default defineConfig([
  // API build - both CJS and ESM
  {
    format: ['cjs', 'esm'],
    outExtension({ format }) {
      return {
        js: format === 'cjs' ? '.cjs' : '.mjs',
        dts: '.d.ts'
      }
    }
    // Other options...
  },
  // CLI build - CJS only
  {
    format: 'cjs',
    outExtension({ format }) {
      return {
        js: '.cjs',
        dts: '.d.ts'
      }
    }
    // Other options...
  }
]);
```

- ESM builds use `.mjs` extension
- CJS builds use `.cjs` extension
- Type declarations use `.d.ts` extension

## Import/Export Patterns

### Importing Modules

Always follow these rules when importing modules:

1. **Include `.js` extensions** for all internal imports:

```typescript
// ✅ CORRECT: Include .js extension
import { Service } from '@services/path/Service.js';

// ❌ INCORRECT: Missing .js extension
import { Service } from '@services/path/Service';
```

2. **Use path aliases** rather than relative paths when possible:

```typescript
// ✅ CORRECT: Use path aliases
import { Service } from '@services/path/Service.js';

// ❌ INCORRECT: Long relative paths
import { Service } from '../../../services/path/Service.js';
```

3. **Use `import type` for type-only imports**:

```typescript
// ✅ CORRECT: Use import type for types
import type { IService } from '@services/path/IService.js';

// ❌ INCORRECT: Regular import for types
import { IService } from '@services/path/IService.js';
```

4. **External modules don't need `.js` extensions**:

```typescript
// ✅ CORRECT: External modules without .js
import { describe, it, expect } from 'vitest';
import { container } from 'tsyringe';
```

### Exporting Modules

Follow these patterns for exporting:

1. **Use named exports** rather than default exports:

```typescript
// ✅ CORRECT: Named exports
export class MyService {}
export interface IMyService {}

// ❌ INCORRECT: Default exports
export default class MyService {}
```

2. **Export interfaces directly**:

```typescript
// ✅ CORRECT: Direct interface export
export interface IService {
  method(): void;
}

// ❌ INCORRECT: Interface export with type keyword
export type IService = {
  method(): void;
}
```

3. **For re-exports, be explicit**:

```typescript
// ✅ CORRECT: Explicit re-export
export { IService } from './IService.js';

// ❌ INCORRECT: Star re-export (exports everything)
export * from './IService.js';
```

## Circular Dependencies

Circular dependencies are resolved using the Client Factory pattern:

1. **Create minimal client interfaces** that expose only needed methods
2. **Use factories** to create these client interfaces
3. **Inject factories** rather than actual services

Example:

```typescript
// Minimal client interface
export interface IServiceClient {
  doSomething(): void;
}

// Factory to create clients
@Service()
export class ServiceClientFactory {
  constructor(@inject('IService') private service: IService) {}
  
  createClient(): IServiceClient {
    return {
      doSomething: () => this.service.doSomething()
    };
  }
}

// Service using the factory
@Service()
export class DependentService {
  private client: IServiceClient;
  
  constructor(
    @inject('ServiceClientFactory') factory: ServiceClientFactory
  ) {
    this.client = factory.createClient();
  }
}
```

## Testing with ESM

When testing code that uses ESM:

1. **Ensure all imports have `.js` extensions**
2. **Use proper test setup** for ES modules
3. **Mock ES modules correctly** using the testing framework's ESM mocking capabilities

Example:

```typescript
// Correct ESM import for test
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import type { IService } from '@services/path/IService.js';

describe('MyService', () => {
  let context: TestContextDI;
  
  beforeEach(() => {
    context = TestContextDI.create();
  });
  
  afterEach(async () => {
    await context.cleanup();
  });
  
  it('should work with ESM imports', () => {
    const service = context.container.resolve<IService>('IService');
    expect(service).toBeDefined();
  });
});
```

## Common Issues & Solutions

### Module Not Found Errors

If you get "Module not found" errors:
- Check that the imported file exists
- Ensure you've added the `.js` extension
- Verify the path is correct (especially for path aliases)

### Export Not Found Errors

If you get "Export not found" errors:
- Ensure the export exists in the specified file
- Check that you're using named exports correctly
- Verify that circular dependencies are properly resolved

### Import/Export Type Issues

If TypeScript complains about importing/exporting types:
- Use `import type` for type-only imports
- For mixed imports (values and types), separate them:
  ```typescript
  import { SomeValue } from './file.js';
  import type { SomeType } from './file.js';
  ```

## Migration Guide

When converting existing code to use the new module system:

1. Add `.js` extensions to all internal imports
2. Replace relative paths with path aliases when possible
3. Update any default exports to named exports
4. Use `import type` for type-only imports
5. Convert star re-exports to explicit named re-exports

This can be partially automated using the `fix-import-paths.js` script:

```bash
node scripts/fix-import-paths.js
```