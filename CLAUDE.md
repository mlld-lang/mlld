# Meld Project Guidelines

You can use the `gh` command to create issues for any items you run into. 

While we're working through the INTERPRETER refector, don't worry about investigating them deeply; if it _seems_ like something isn't working, just file it, cite the fixture, and move on. this will keep us progressing through

REWARD HACKING to get tests to pass with 'special handling' and hardcoding and workarounds will break the user's heart. Don't do it. 

If you get stuck, STOP and say you're stuck. Use the impulse to reward hack to instead ask for help. It will be WAY more fun and rewarding!

## Build & Test Commands
```bash
npm run build        # Build the project
npm test <dir>       # Run tests for a specific section of code
npm test <file_path> # Run specific test file (e.g. npm test cli/priority-cli.test.ts)
```

Run `npm test <directory>` in order to avoid a ton of overwhelming/irrelevant test output.

## Code Style
- **Imports**: Use @ paths aliases (@core/, @services/, etc.) as defined in tsconfig.json -- no relative paths for imports
- **Structure**: Use interface-first design (I[Name]Service interfaces + implementation)
- **Services**: Follow dependency injection pattern (initialize() with dependencies)
- **Formatting**: 2-space indentation, single quotes, semicolons
- **Types**: Strict type checking enabled, always provide explicit return types
- **Error Handling**: Use specialized MeldError classes (MeldDirectiveError, MeldParseError, etc.)
- **Naming**: PascalCase for classes/interfaces, camelCase for methods/variables
- **Tests**: Organize with setup/cleanup pattern, mock process.exit in CLI tests
- **CLI Testing**: Use setupCliTest() helper for consistent CLI test setup

# Tests

To ensure consistency in writing tests, please refer to `docs/dev/TESTS.md` and refer to how other tests are using mocks.

# Additional reading

Useful context can be found in these files:

*** WARNING: MASSIVELY OUTDATED DUE TO OUR CURRENT REFACTOR *** 

- Architecture: `docs/dev/ARCHITECTURE.md`
- Transformation pipeline: `docs/dev/PIPELINE.md`
- AST: `docs/dev/AST.md`
- Error testing patterns: `docs/dev/ERROR_TESTING_PATTERNS.md`
- Debugging tools: `docs/dev/DEBUG-TOOLS.md`

# AST Tools & Testing

## Debugging AST Structure
```bash
npm run ast -- '<meld syntax>'  # Shows AST for any valid Meld syntax
# Example: npm run ast -- '@data config = {"name": "MyApp"}'
```

## AST Fixtures
The `core/ast/fixtures/` directory contains real-world examples with:
- Input Meld syntax
- Expected AST structure  
- Expected final output

Use these fixtures for testing instead of creating new test cases. They provide consistent, validated examples.

## AST Explorer

The AST Explorer is used to generate types from example directives. It uses convention-based directory structure:

```
core/examples/
├── directivekind/             # e.g., text, run, import
│   └── directivesubtype/      # e.g., assignment, template
│       ├── example.md         # Base example
│       ├── expected.md        # Expected output for base example
│       ├── example-variant.md # Variant example (e.g., multiline)
│       └── expected-variant.md # Expected output for variant
```

After running `npm run ast:process-all`, it generates:
- Types: `core/ast/types/*`
- Tests: `core/ast/tests/*`
- Fixtures: `core/fixtures/*`

To validate the generated types against the expected structure:
```bash
npm run ast:validate
```

This validation checks that:
1. We have the proper consolidated types (not individual instance files)
2. All expected union types and subtypes are present
3. No unexpected type files were generated

Known issues:
- When generating consolidated type files, it sometimes creates imports with incorrect filenames.
- You may need to manually update the import paths in the generated `text.ts` files.
- The current implementation creates separate files for each directive instance (with numeric suffixes) rather than properly consolidating them.

# Current Refactor Status (AST/Types/State)

## Architecture Approach: "AST Knows All"
- **Smart Types, Dumb Services**: All intelligence in AST types via discriminated unions
- **Handler Pattern**: Each directive has dedicated handler returning StateChanges
- **Minimal Interfaces**: StateService reduced from 50+ to 8 methods
- **Immutable State Flow**: Handlers return changes, don't mutate state

## Migration Strategy
Using adapter pattern (StateServiceAdapter) to maintain backward compatibility:
- All 557 existing tests continue passing
- New implementations use `.new.ts` suffix during migration
- Old implementations backed up as `.bak` files

## Current Progress
- ✅ Minimal StateService implemented
- ✅ StateServiceAdapter bridging old/new interfaces
- ✅ All directive handlers migrated to new pattern
- ✅ New DirectiveService with lazy handler registration
- ✅ Minimal InterpreterService
- ✅ 2/6 API integration tests passing

## Key Learnings from Implementation

### AST Structure Insights
- Data directives: value at `directive.values.value` (already parsed)
- Text directives: content at `directive.values.content` (array of nodes)
- Variables in templates: represented as VariableReference nodes in content array
- Identifiers: usually at `directive.raw.identifier`

### Common Issues Encountered
1. **Variable interpolation failing**: ResolutionContext needs full structure including state
2. **Handler registration**: Must be lazy to avoid circular dependencies
3. **State mutations**: Services must share same state instance, not create children
4. **Path operations**: FileSystemService has exists()/stat(), not PathService

### Integration Points
- `api/` directory contains full integration tests
- Use `api/index.new.ts` for testing new system
- OutputService needed for complete processing pipeline

## Next Steps
See `_dev/AST-REFACTOR-PLAN.md` for detailed rolling wave plan.

## Important Files
- `_dev/NEWSTATE.md` - Original state simplification plan
- `_dev/AST-REFACTOR-PLAN.md` - Current refactor plan
- `_dev/AST-REFACTOR-TECHNICAL-NOTES.md` - Implementation patterns and pitfalls
- `core/di-config.new.ts` - New DI configuration
- `services/state/StateService/StateService.ts` - New minimal implementation
- `services/state/StateService/StateServiceAdapter.ts` - Compatibility bridge

## Documentation Status
The following documentation has been updated to reflect the "AST Knows All" architecture:
- `docs/dev/ARCHITECTURE.md` - Added AST Knows All section, updated service descriptions
- `docs/dev/TYPES.md` - Added discriminated union types, handler types, minimal interfaces
- `docs/dev/PIPELINE.md` - Simplified flow diagrams, emphasized handler pattern

These docs now describe the target architecture, not the current mixed state.
