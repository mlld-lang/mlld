# Meld Project Guidelines

NEVER reward-hack by creating workarounds. It will break the user's heart.

## Build & Test Commands
```bash
npm run build        # Build the project
npm test         # Run all tests
npm test <file_path> # Run specific test file (e.g. npm test cli/priority-cli.test.ts)
```

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

To ensure consistency in writing tests, please refer to `docs/dev/TESTS.md` and refer to how other tests are using mocks and `TestContext`.

# Additional reading

Useful context can be found in these files:

- Architecture: `docs/dev/DI-ARCHITECTURE.md`
- AST » transformation pipeline: `docs/dev/PIPELINE.md`
- API documentation: `docs/dev/API.md`
- Path handling: `docs/dev/PATHS.md`
- Error testing patterns: `docs/dev/ERROR_TESTING_PATTERNS.md`
- Debugging tools: `docs/dev/DEBUG-TOOLS.md`