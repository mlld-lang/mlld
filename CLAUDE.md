# mlld project guidelines

## Build & Test Commands
```bash
npm run build        # Build the project
npm test <dir>       # Run tests for a specific section of code
npm test <file_path> # Run specific test file (e.g. npm test cli/priority-cli.test.ts)
npm run ast -- '<mlld syntax>'  # Shows AST for any valid Mlld syntax
```

## Code Style
- **Imports**: Use @ paths aliases (@core/, @services/, etc.) as defined in tsconfig.json -- no relative paths for imports
- **Structure**: Use interface-first design (I[Name]Service interfaces + implementation)
- **Formatting**: 2-space indentation, single quotes, semicolons
- **Types**: Strict type checking enabled, always provide explicit return types
- **Error Handling**: Use specialized MlldError classes (MlldDirectiveError, MlldParseError, etc.)
- **Naming**: PascalCase for classes/interfaces, camelCase for methods/variables
- **Tests**: Test cases in tests/cases written in markdown --> tests/utils/ast-fixtures.js builds fixtures from these when running `npm run build:fixtures` or when running `build` or `build:grammar` --> tests/fixtures have complete AST and expected final output --> @interpreter/interpreter.fixture.test.ts runs the tests in our fixtures, effectively creating e2e tests. when individual tests/cases need to reference files, they go in tests/cases/files
- **Grammar:** Our peggy.js grammar uses an abstraction-focused modular design for DRY code that makes peggy's hierarchical traversal clear. Look for patterns to consolidate and abstract where possible. Refer to grammar/docs/NAMING-CONVENTIONS.md for naming patterns.

## Architecture 
- **Interpreter**: Single recursive `evaluate()` function
- **Environment class**: Combines state + capabilities (file I/O, command execution)
- **Direct evaluation**: No service orchestration or ResolutionService
- **Smart evaluators**: Each directive evaluator does all the work directly
- **CLI/API integrated**: Both now use the new interpreter directly

## Key Decisions & Context
- **Parser returns arrays** - We handle this in evaluate()
- **Newlines are nodes** - Preserved for markdown output
- **Direct execution** - Evaluators read files and execute commands directly
- **XML via llmxml** - Uses SCREAMING_SNAKE format for maximum clarity
- **AST Parsing**: ALWAYS use the AST -- never use regex

## Coding Practices
