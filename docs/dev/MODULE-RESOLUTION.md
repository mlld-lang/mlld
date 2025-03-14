# Module Resolution Standards

This document outlines the standards for module imports in the Meld codebase. These standards were established after the migration to ES modules in Issue #17 (Phase 5).

## Import Patterns

### Internal Imports

For internal imports within the Meld codebase, follow these guidelines:

1. **Always include file extensions**: Add `.js` extensions to all internal imports
   ```typescript
   // Correct
   import { IDirectiveService } from '@services/pipeline/DirectiveService/IDirectiveService.js';
   
   // Incorrect
   import { IDirectiveService } from '@services/pipeline/DirectiveService/IDirectiveService';
   ```

2. **Use path aliases**: Prefer path aliases (`@core`, `@services`, etc.) over relative paths for imports across different directories
   ```typescript
   // Correct
   import { MeldError } from '@core/errors/MeldError.js';
   
   // Avoid when possible
   import { MeldError } from '../../core/errors/MeldError.js';
   ```

3. **Prefer relative paths within same directory/module**: When importing from files in the same directory or closely related modules
   ```typescript
   // Correct for files in the same directory
   import { someUtility } from './utils.js';
   ```

4. **Index imports**: When importing from a directory with an index.js file, include the index.js explicitly
   ```typescript
   // Correct
   import { utilities } from '@core/utils/index.js';
   
   // Incorrect
   import { utilities } from '@core/utils';
   ```

### Node.js Built-in Modules

For Node.js built-in modules, do not include the `.js` extension:

```typescript
// Correct
import { readFileSync } from 'fs';
import { EventEmitter } from 'events';
import path from 'path';

// Incorrect
import { readFileSync } from 'fs.js';
import { EventEmitter } from 'events.js';
import path from 'path.js';
```

### Third-party Dependencies

For third-party dependencies, do not include the `.js` extension:

```typescript
// Correct
import { Container } from 'tsyringe';
import * as memfs from 'memfs';

// Incorrect
import { Container } from 'tsyringe.js';
import * as memfs from 'memfs.js';
```

## Special Cases

### API Imports

When importing from the API module, use `@api` alias (not `@sdk`):

```typescript
// Correct
import { main } from '@api/index.js';

// Incorrect
import { main } from '@sdk/index.js';
```

### CLI Test Imports

In CLI test files, use relative imports for CLI modules being tested:

```typescript
// Correct in CLI test files
import * as cli from './index.js';

// Avoid in CLI test files
import * as cli from '@cli/index.js';
```

### TypeScript Types Imports

For TypeScript type imports (`.d.ts` files), follow the standard import patterns with `.js` extension:

```typescript
// Correct
import type { MeldState } from '@core/types/state.js';
```

## Troubleshooting

If you encounter module resolution issues:

1. Verify that all internal imports have `.js` extensions
2. Check that Node.js built-in module imports do NOT have `.js` extensions
3. Ensure index imports explicitly include `index.js`
4. For CLI test files, use relative imports for CLI modules
5. Use path aliases for cross-directory imports

## Linting

ESLint rules have been configured to enforce these import patterns. Run the linter to check for compliance:

```bash
npm run lint
```

## Migration Notes

These standards were established in Issue #17 Phase 5, which migrated the codebase to ES modules. The migration involved:

1. **Phase 5A**: Core module migration
2. **Phase 5B**: Service layer migration
3. **Phase 5C**: CLI, API, and test modules migration
4. **Phase 5D**: Validation and standards documentation

The migration was necessary after adding `@swc/core` to the project, which enforces stricter ES module rules.