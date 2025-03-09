# Build Configuration Guide

This document explains the build configuration for the Meld project, particularly focusing on Dependency Injection (DI) considerations.

## Overview

Meld uses [tsup](https://github.com/egoist/tsup) (powered by esbuild) for bundling. The build system is configured to:

1. Generate both CommonJS (.cjs) and ES Module (.mjs) outputs
2. Properly handle TypeScript decorators and reflection metadata
3. Configure Node.js platform settings
4. Manage external dependencies
5. Optimize for Dependency Injection

## Key Files

- `tsup.config.ts` - Main build configuration
- `tsconfig.json` - TypeScript compiler options
- `tsconfig.build.json` - Build-specific TypeScript configuration

## Build Targets

The project has two main build targets:

1. **API** - Produces both CJS and ESM outputs
2. **CLI** - Produces CJS output only

## Dependency Injection Considerations

The build system has specific configurations to support the TSyringe dependency injection system:

### 1. External Dependencies

TSyringe and reflect-metadata are marked as external dependencies to avoid bundling issues:

```typescript
const externalDependencies = [
  // ...other dependencies
  'tsyringe',
  'reflect-metadata',
  // ...
];
```

### 2. Tree Shaking Configuration

Tree shaking is configured to preserve DI-related code:

```typescript
treeshake: {
  preset: 'recommended',
  moduleSideEffects: ['reflect-metadata', 'tsyringe']
}
```

The `moduleSideEffects` option ensures that TSyringe decorators and reflection metadata are preserved during tree shaking.

### 3. Preserving Function Names

The `keepNames` option is enabled to preserve function and class names, which is critical for reflection-based DI:

```typescript
options.keepNames = true; // Required for reflection-based DI
```

### 4. Node.js Platform Setting

All builds use the Node.js platform setting to ensure proper handling of Node.js-specific APIs:

```typescript
options.platform = 'node';
```

## TypeScript Configuration

The TypeScript configuration includes settings required for decorators and metadata reflection:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    // ...
  }
}
```

## Testing the Build

To verify that the build works correctly with DI:

1. Build the project:
   ```bash
   npm run build
   ```

2. Test ES Modules compatibility:
   ```bash
   node --input-type=module -e "import { createService } from './dist/index.mjs'; console.log(createService)"
   ```

3. Test CommonJS compatibility:
   ```bash
   node -e "const { createService } = require('./dist/index.cjs'); console.log(createService)"
   ```

## Troubleshooting

### Missing Reflection Metadata

If you encounter errors about missing reflection metadata:

1. Ensure `reflect-metadata` is imported at the application entry points
2. Verify that TypeScript compiler options include `"emitDecoratorMetadata": true`
3. Check that `tsyringe` and `reflect-metadata` are correctly marked as external dependencies

### ESM/CJS Compatibility Issues

If you encounter issues with ESM/CJS compatibility:

1. Check the `exports` field in package.json is correctly configured
2. Verify that imports use the correct extension (.mjs for ESM, .cjs for CommonJS)
3. Ensure that imports follow the package.json `exports` mapping 