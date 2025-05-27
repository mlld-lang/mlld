# Code Standards

## TypeScript

- Strict mode enabled
- No `any` types
- Explicit return types for functions
- Interface over type aliases
- Use `const` assertions where appropriate

## Code Style

- 2-space indentation
- Single quotes for strings
- Trailing commas in multiline objects/arrays
- Semicolons required
- Max line length: 100 characters

## Architecture

- Pure functions where possible
- Immutable data patterns
- Single responsibility principle
- Dependency injection for testability

## Testing

- Jest for unit tests
- 100% test coverage for core logic
- Integration tests for pub/sub behavior
- Property-based testing for state transitions

## Documentation

- JSDoc comments for public APIs
- README for each major component
- Architecture decision records (ADRs)
- Examples in documentation