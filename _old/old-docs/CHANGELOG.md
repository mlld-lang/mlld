# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2024-01-11

### Added
- Initial project setup
- Basic repository structure
- Development environment configuration
- Package.json configuration
- TypeScript configuration
- Basic documentation (README.md, CHANGELOG.md) 

## [Unreleased]

### Added
- AST Parser Integration
  - Created `src/interpreter/parser.ts` with `parseMeldContent` function
  - Added error handling for parsing failures
  - Added unit tests for parser functionality
- State Management Implementation
  - Created `src/interpreter/state/state.ts` with `MeldState` interface
  - Implemented `InterpreterState` class with variable and command management
  - Added comprehensive unit tests for state functionality
  - Added state cloning capability for isolated execution contexts
- Directive Handler Architecture
  - Created `src/interpreter/directives/index.ts` with handler interface
  - Implemented directive registry with handler management
  - Added type-safe directive kind handling
  - Added comprehensive tests for handler registration and execution
- Main Interpreter Implementation
  - Created `src/interpreter/interpreter.ts` with core interpretation logic
  - Added support for Text, CodeFence, and Directive nodes
  - Implemented robust error handling with node context
  - Added comprehensive test suite with 100% coverage 
- Implemented core directive handler architecture with registry and type-safe handling
- Added comprehensive unit tests for state functionality and state cloning
- Implemented main interpreter with support for text, code fence, and directive nodes
- Added `@run` directive with support for:
  - Command execution with proper state management
  - Background process handling
  - Error handling for missing commands
  - Comprehensive test coverage 
- Added `@embed` directive with support for:
  - Basic file embedding
  - Section extraction with header preservation
  - Header level adjustment
  - Item extraction with subsection preservation
  - Adding content under headers
  - Proper text node integration
  - Comprehensive test coverage 