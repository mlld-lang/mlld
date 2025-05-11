# Meld Project Guidelines

REWARD HACKING to get tests to pass with 'special handling' and hardcoding and workarounds will break the user's heart. Don't do it. 

If you get stuck, STOP and say you're stuck. Use the impulse to reward hack to instead ask for help. It will be WAY more fun and rewarding!

## Build & Test Commands
```bash
npm run build        # Build the project
npm test <dir>       # Run tests for a specific section of code
npm test <file_path> # Run specific test file (e.g. npm test cli/priority-cli.test.ts)
```

Don't run bare `npm test` unless we discuss it. Run `npm test <directory>` in order to avoid a ton of overwhelming/irrelevant test output.

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

- Architecture: `docs/dev/DI-ARCHITECTURE.md`
- Transformation pipeline: `docs/dev/PIPELINE.md`
- AST: `docs/dev/AST.md`
- Error testing patterns: `docs/dev/ERROR_TESTING_PATTERNS.md`
- Debugging tools: `docs/dev/DEBUG-TOOLS.md`

# AST Explorer

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

Known issues:
- When generating consolidated type files, it sometimes creates imports with incorrect filenames.
- You may need to manually update the import paths in the generated `text.ts` files.