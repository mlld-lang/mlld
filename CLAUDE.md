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

# Current Refactor Status - INTERPRETER COMPLETE! 🎉

## 🚨 Major Architecture Change: Traditional Interpreter Pattern 🚨

We've successfully moved from the service-oriented architecture to a clean, traditional interpreter pattern. This is a fundamental improvement that simplifies the entire system.

### New Architecture (Complete)
- **Traditional interpreter**: Single recursive `evaluate()` function
- **Environment class**: Combines state + capabilities (file I/O, command execution)
- **Direct evaluation**: No service orchestration or ResolutionService
- **Smart evaluators**: Each directive evaluator does all the work directly
- **CLI/API integrated**: Both now use the new interpreter directly

### Implementation Status ✅
- ✅ Core interpreter built and working (`interpreter/` directory)
- ✅ All directive evaluators implemented with full functionality
- ✅ CLI and API fully integrated with new interpreter
- ✅ **ALL 44 fixtures passing (100%)** - Complete success!
- ✅ Field access for @data directives (e.g., `@data greeting.text = "Hello"`)
- ✅ Lazy evaluation for embedded directives in complex data
- ✅ XML output via llmxml integration
- 🚧 Edge cases documented as GitHub issues (#42-#48, #51)

### 📊 Final Summary
- **Fixtures Passing**: 44/44 (100%)
- **Working Directives**: ALL - add, text, exec, run, data, import, path
- **Variable interpolation**: Working with `{{variable}}` syntax
- **Template syntax**: Double brackets `[[...]]` required for interpolation
- **Complex data**: Full support including nested objects and lazy evaluation
- **Output formats**: Markdown (default) and XML via llmxml

### 🎯 Key Features Implemented
1. **Field access in data directives** - `@data config.database.host = "localhost"`
2. **Lazy evaluation** - Embedded directives in data values are evaluated when accessed
3. **llmxml integration** - Clean XML output with SCREAMING_SNAKE tags
4. **Complete fixture coverage** - All test cases passing

### 📋 Key References
1. **Run tests**: `npm test interpreter` - All tests passing!
2. **Complex data examples**: See `interpreter/complex-data.e2e.test.ts`
3. **Output format tests**: See `interpreter/output-formats.test.ts`

### Key Decisions & Context
- **Parser returns arrays** - We handle this in evaluate()
- **Newlines are nodes** - Preserved for markdown output
- **Skip numbered fixtures** - They're partial tests (e.g., add-variable-1.fixture.json)
- **Field access implemented** - No longer a limitation!
- **Direct execution** - Evaluators read files and execute commands directly
- **XML via llmxml** - Uses SCREAMING_SNAKE format for maximum clarity

## Previous Service-Oriented Refactor (Now Obsolete)

The following was the previous refactor approach, now superseded by the interpreter rewrite:

~~Architecture Approach: "AST Knows All"~~
~~- Smart Types, Dumb Services: All intelligence in AST types via discriminated unions~~
~~- Handler Pattern: Each directive has dedicated handler returning StateChanges~~
~~- Minimal Interfaces: StateService reduced from 50+ to 8 methods~~
~~- Immutable State Flow: Handlers return changes, don't mutate state~~

### Old Files (For Reference Only)
- `_dev/NEWSTATE.md` - Original state simplification plan
- `_dev/AST-REFACTOR-PLAN.md` - Service refactor plan (see Phase 3 completion notes)
- `_dev/AST-REFACTOR-TECHNICAL-NOTES.md` - Service implementation patterns
- `core/di-config.new.ts` - Service-based DI configuration
- Various `.new.ts` and `.bak` files from service migration

## Documentation Status
The following documentation has been updated to reflect the "AST Knows All" architecture:
- `docs/dev/ARCHITECTURE.md` - Added AST Knows All section, updated service descriptions
- `docs/dev/TYPES.md` - Added discriminated union types, handler types, minimal interfaces
- `docs/dev/PIPELINE.md` - Simplified flow diagrams, emphasized handler pattern

These docs now describe the target architecture, not the current mixed state.

## Coding Practices
- **AST Parsing**: ALWAYS use the AST -- never use regex
- To build the AST fixtures / expected output in core/ast/fixtures from the examples in core/ast/examples, run `npm run ast:process-all`
