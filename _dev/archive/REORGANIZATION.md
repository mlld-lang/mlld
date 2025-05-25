# Meld Codebase Reorganization Plan

## Overview

Following the successful migration from a service-oriented architecture to a traditional interpreter pattern, we're reorganizing the codebase to reflect this simpler architecture and remove obsolete code.

## Current Issues

1. **Scattered test assets** - Test fixtures, cases, and utilities spread across multiple directories
2. **Redundant type definitions** - Types duplicated between `core/types/` and `core/ast/types/`
3. **Misplaced utilities** - Test utilities in `scripts/` instead of with other test code
4. **Unclear example purposes** - Mix of test cases and user examples in various locations
5. **Build artifacts mixed with source** - Parser output in `core/ast/grammar/` instead of `grammar/`

## Proposed Structure

```
meld/
├── api/                        # Public API
│   └── index.ts               # API entry point
├── cli/                        # CLI entry points
│   ├── index.ts               # CLI main
│   └── commands/              # CLI commands (init, etc.)
├── core/                       # Core types and utilities
│   ├── errors/                # Error classes
│   ├── types/                 # All types (consolidated from core/ast/types)
│   └── utils/                 # Shared utilities
├── interpreter/                # The interpreter (main logic)
│   ├── index.ts               # Interpreter exports
│   ├── core/
│   │   └── interpreter.ts     # Main interpreter
│   ├── env/
│   │   └── Environment.ts     # Environment (state + I/O)
│   ├── eval/                  # Directive evaluators
│   └── output/                # Output formatting
├── grammar/                    # PEG grammar source
│   ├── meld.peggy            # Main grammar
│   ├── base/                 # Base grammar rules
│   ├── core/                 # Core grammar rules
│   ├── directives/           # Directive grammars
│   ├── patterns/             # Shared patterns
│   └── parser/               # Built parser output
│       ├── parser.js         # Generated parser
│       └── parser.ts         # TypeScript types
├── tests/                      # All test-related files
│   ├── cases/                 # Test case examples (from core/examples)
│   ├── fixtures/              # Test fixtures (from core/ast/fixtures)
│   ├── utils/                 # Test utilities
│   │   ├── ast-fixtures.js    # AST fixtures generator (from scripts/)
│   │   └── ...               # Other test helpers
│   ├── unit/                  # Unit tests
│   ├── integration/           # Integration tests
│   └── e2e/                   # End-to-end tests
├── examples/                   # Real user examples
│   ├── getting-started.mld   # Basic usage
│   ├── advanced-usage.mld    # Advanced features
│   └── ...                   # More examples
├── lib/                        # External libraries
│   └── llmxml/               # XML output library
└── scripts/                    # Build/maintenance scripts
    ├── build-grammar.mjs      # Grammar builder
    └── ...                    # Other build scripts
```

## Migration Steps

### Phase 1: Test Reorganization
1. Move `scripts/ast-snapshot.js` → `tests/utils/ast-fixtures.js` and modify i/o paths
2. Move `core/examples/` → `tests/cases/`
3. Move `core/ast/fixtures/` → `tests/fixtures/`
4. Delete `examples/snapshots/` (appears to be misplaced test data)

### Phase 2: Type Consolidation
1. Review `core/types/` for outdated service types (core/ast/types has _most_ current, accurate types, but potentially not all, so this needs a careful review)
2. Move `core/ast/types/` → `core/types/`
3. Remove duplicate and obsolete type definitions
4. Update all import paths

### Phase 3: Grammar/Parser Cleanup
1. Update build process to output to `grammar/parser/`
2. Move parser imports from `@core/ast/grammar/parser` to `@grammar/parser`
3. Delete `core/ast/grammar/` after migration
4. Delete `core/ast/grammar-bak/`

### Phase 4: Remove Obsolete Code
1. Delete `core/ast/e2e/` (obsolete)
2. Delete `core/ast/explorer/` (obsolete)
3. Delete `core/ast/docs/` (outdated)
4. Remove `core/di-config.ts` and `core/di-config.old.ts`
5. Delete `core/directives/` (just has obsolete DirectiveHandler.ts)
6. Clean up `services/` - keep only what's still needed by interpreter

### Phase 5: Final Cleanup
1. Update all import paths to new locations
2. Update build scripts and configurations
3. Ensure all tests pass with new structure
4. Update documentation to reflect new structure

## Import Path Updates

### Before
```typescript
import { parse } from '@core/ast/grammar/parser';
import { TextDirective } from '@core/ast/types/text';
import { generateFixtures } from '../../../scripts/ast-fixtures';
```

### After
```typescript
import { parse } from '@grammar/parser';
import { TextDirective } from '@core/types/text';
import { generateFixtures } from '@tests/utils/ast-fixtures';
```

## Benefits

1. **Clearer organization** - Test code separate from production code
2. **Simpler imports** - More intuitive paths
3. **Less clutter** - Removal of obsolete service code
4. **Better discoverability** - Related files grouped together
5. **Cleaner build** - Parser output separate from grammar source

## Risks & Mitigations

1. **Risk**: Breaking imports during migration
   - **Mitigation**: Do migration in phases, update imports incrementally
   
2. **Risk**: Tests failing due to moved fixtures
   - **Mitigation**: Update test paths systematically, run tests after each phase
   
3. **Risk**: Build scripts breaking
   - **Mitigation**: Update build scripts as part of migration plan

## Timeline

- Phase 1-2: Test reorganization and type consolidation (1 day)
- Phase 3-4: Grammar cleanup and obsolete code removal (1 day)
- Phase 5: Final cleanup and verification (0.5 days)

Total estimated time: 2.5 days

## Success Criteria

1. All tests passing with new structure
2. No obsolete service code remaining
3. Clear separation between test and production code
4. Simplified import paths throughout codebase
5. Documentation updated to reflect new structure
