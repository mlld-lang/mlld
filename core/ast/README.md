# Meld AST

This directory contains the Abstract Syntax Tree (AST) implementation for Meld, which was previously a separate package (`meld-ast`). It provides the parser and grammar for Meld syntax.

## Migration Details

The code in this directory was migrated from the separate `meld-ast` package and consolidated into the main codebase. This integration simplifies dependency management and makes it easier to maintain and evolve the AST implementation alongside the rest of the Meld project.

Key components:
- `grammar/` - Contains the Peggy grammar definition and compiled parser
- `ast/` - Contains AST type definitions
- `parser.ts` - Main parser implementation
- `types.ts` - Error and parser type definitions

## Testing

Tests for the AST implementation have been migrated to `/tests/ast/` directory, maintaining the same structure and coverage as the original package.

## Build Process

The grammar is compiled using a build script located at `/scripts/build-grammar.mjs`. This script is executed as part of the build process.

## Usage

```typescript
import { parse } from '@core/ast';

const input = '{{ variable }}';
const result = await parse(input);
// `result.ast` contains the parsed AST nodes
```