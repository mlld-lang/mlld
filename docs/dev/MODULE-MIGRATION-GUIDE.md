# Module Migration Guide

This guide documents the process and tools used to migrate the Meld codebase to ES modules as part of Issue #17.

## Background

The migration was necessary after adding `@swc/core` to the project, which enforces stricter ES module resolution rules. The migration was completed in four phases:

1. **Phase 5A**: Core module migration
2. **Phase 5B**: Service layer migration
3. **Phase 5C**: CLI, API, and test modules migration
4. **Phase 5D**: Validation, documentation, and tools

## Migration Rules

The migration followed these key rules:

1. **Add .js extensions to all internal imports**:
   ```typescript
   // Before
   import { MeldError } from '@core/errors/MeldError';
   
   // After
   import { MeldError } from '@core/errors/MeldError.js';
   ```

2. **Remove .js extensions from Node.js built-in module imports**:
   ```typescript
   // Before
   import { EventEmitter } from 'events.js';
   
   // After
   import { EventEmitter } from 'events';
   ```

3. **Rename @sdk imports to @api**:
   ```typescript
   // Before
   import { main } from '@sdk/index.js';
   
   // After
   import { main } from '@api/index.js';
   ```

4. **Use explicit index.js in directory imports**:
   ```typescript
   // Before
   import { utilities } from '@core/utils';
   
   // After
   import { utilities } from '@core/utils/index.js';
   ```

5. **Use relative imports in CLI test files**:
   ```typescript
   // Before in CLI test files
   import * as cli from '@cli/index.js';
   
   // After in CLI test files (for proper testing)
   import * as cli from './index.js';
   ```

## Automated Migration Tools

The project includes several tools to help with module migration:

### 1. Fix Module Imports Script

The `fix-module-imports.js` script automatically fixes most common import issues:

```bash
# Fix all imports in the codebase
npm run fix:imports

# Check what would be changed without making changes
npm run fix:imports:dry

# Show detailed information about each change
npm run fix:imports:verbose

# Fix imports in specific files or directories
node scripts/fix-module-imports.js path/to/file.ts path/to/directory
```

### 2. Check Module Imports Script

The `check-module-imports.js` script scans for lingering issues:

```bash
# Check for import issues
npm run check:imports

# Check specific files or directories
node scripts/check-module-imports.js path/to/file.ts path/to/directory
```

### 3. ESLint Rules

The project includes custom ESLint rules to enforce correct import patterns:

```bash
# Check for import issues with ESLint
npm run lint:imports:check

# Fix import issues with ESLint
npm run lint:imports
```

## Common Issues and Solutions

### 1. Node.js Built-in Modules

Node.js built-in modules should not have `.js` extensions. Common built-ins:
- `fs`, `path`, `events`, `crypto`, `readline`, `os`, `util`, `stream`, `zlib`
- `http`, `https`, `child_process`, `buffer`, `url`, `querystring`, `assert`

### 2. CLI Test Files

CLI test files should use relative imports for CLI modules being tested:

```typescript
// Preferred in CLI test files
import * as cli from './index.js';
```

### 3. Index Imports

When importing from a directory, explicitly include `index.js`:

```typescript
// Before
import { helpers } from '@core/utils';

// After
import { helpers } from '@core/utils/index.js';
```

### 4. Type Imports

Type imports should also include `.js` extensions:

```typescript
// Correct
import type { MeldState } from '@core/types/state.js';
```

## Adding New Files

When adding new files to the codebase, follow these guidelines:

1. Always use `.js` extensions in import statements for internal modules
2. Use path aliases for cross-directory imports
3. Use relative paths for imports within the same directory
4. Don't add `.js` extensions for Node.js built-in modules or third-party dependencies
5. Use `import type` for type-only imports

## Troubleshooting

If you encounter module resolution errors:

1. Run `npm run check:imports` to identify import issues
2. Use `npm run fix:imports` to automatically fix most issues
3. For stubborn issues, check for:
   - Missing `.js` extensions in internal imports
   - `.js` extensions in Node.js built-in module imports
   - Directory imports without explicit `index.js`
   - Special case issues in CLI test files

## Standards Reference

For detailed standards on module imports, refer to [MODULE-RESOLUTION.md](./MODULE-RESOLUTION.md).