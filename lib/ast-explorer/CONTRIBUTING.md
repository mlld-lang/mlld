# Contributing to AST Explorer

The AST Explorer is designed to help understand and work with the Meld grammar's Abstract Syntax Tree (AST). This guide covers the development setup, testing strategies, and contribution workflow.

## Development Setup

1. **Clone the Repository**

   The AST Explorer is part of the Meld codebase. If you haven't already, clone the Meld repository:

   ```bash
   git clone https://github.com/adamavenir/meld.git
   cd meld
   ```

2. **Install Dependencies**

   From the project root:

   ```bash
   npm install
   ```

   This will install all necessary dependencies, including the AST Explorer's dependencies.

3. **Build**

   ```bash
   npm run ast:build
   ```

4. **Run Tests**

   ```bash
   cd lib/ast-explorer
   npm test
   ```

## Project Structure

```
lib/ast-explorer/
├── bin/                   # Command-line executables
├── src/                   # Source code
│   ├── index.ts           # Main entry point
│   ├── config.ts          # Configuration system
│   ├── parse.ts           # Parser adapter
│   ├── explorer.ts        # Main Explorer class
│   ├── command.ts         # CLI command handlers
│   ├── generate/          # Generation utilities
│   │   ├── types.ts       # TypeScript type generation
│   │   ├── fixtures.ts    # Test fixture generation
│   │   ├── snapshots.ts   # AST snapshot generation
│   │   └── docs.ts        # Documentation generation
├── tests/                 # Test files
│   ├── utils/             # Test utilities
│   │   ├── FsManager.ts   # Filesystem test manager
│   │   ├── MemfsTestFileSystem.ts  # In-memory filesystem
│   │   └── PathResolver.ts         # Path resolution
│   ├── MemfsAdapter.ts    # Memfs adapter implementation
│   └── explorer.test.ts   # Explorer tests
```

## Testing Strategy

The AST Explorer uses a filesystem adapter pattern to enable testing without touching the real filesystem:

1. **Filesystem Adapter Interface**: The `IFileSystemAdapter` interface defines methods for file operations (read, write, etc.).

2. **Adapters**:
   - `NodeFsAdapter`: Uses Node.js fs module for real filesystem operations
   - `MemfsAdapter`: Uses memfs for in-memory filesystem operations during tests
   - `TracedAdapter`: Logs all filesystem operations for debugging

3. **FsManager**: A centralized manager for filesystem patching to prevent conflicts between tests

4. **Test Setup**:
   ```typescript
   import { setupTestFileSystem } from './utils/FsManager';
   
   it('should write files correctly', async () => {
     // Setup test filesystem
     const { fsAdapter, cleanup } = setupTestFileSystem();
     
     // Create explorer with test adapter
     const explorer = new Explorer({ fileSystem: fsAdapter });
     
     // Run tests...
     
     // Cleanup (important!)
     await cleanup();
   });
   ```

## Contribution Guidelines

1. **Branch Strategy**:
   - Create a feature branch from `main`
   - Follow naming convention: `feature/ast-explorer-<description>` or `fix/ast-explorer-<description>`

2. **Commit Messages**:
   - Use clear, descriptive commit messages
   - Follow the format: `[ast-explorer] <subject>`

3. **Testing**:
   - Add tests for new features and bug fixes
   - Ensure all tests pass before submitting PRs

4. **Pull Requests**:
   - Reference any related issues
   - Provide a clear description of changes
   - Update documentation if needed

## Using the AST Explorer

From the project root, you can use the AST Explorer with:

```bash
# Run various AST Explorer commands
npm run ast:explore -- '@text greeting = "Hello!"'
npm run ast:extract -- path/to/meld/file.meld
npm run ast:types -- '@text greeting = "Hello!"' -n greeting
npm run ast:workflow
```

Or directly within the `lib/ast-explorer` directory:

```bash
cd lib/ast-explorer
npm run cli -- explore '@text greeting = "Hello!"'
```