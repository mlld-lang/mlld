# Service Reorganization Plan

## Overview

We've identified that several "services" are actually test/debug utilities and should be moved to better reflect their role in the codebase. Additionally, the remaining services should be organized into logical groups based on their responsibilities.

## Current Structure

```
core/                       # Shared core functionality
  types/                   # Common type definitions
  errors/                  # Error definitions
  utils/                   # Shared utilities
  config/                  # Configuration
  version.ts              # Version information

services/
  StateService/
  StateEventService/
  StateDebuggerService/
  StateVisualizationService/
  StateHistoryService/
  StateTrackingService/
  ParserService/
  InterpreterService/
  DirectiveService/
  OutputService/
  ResolutionService/
  ValidationService/
  CircularityService/
  FileSystemService/
  PathService/
  CLIService/
```

## Target Structure

```
core/                       # Shared core functionality
  types/                   # Common type definitions
  errors/                  # Error definitions
  utils/                   # Shared utilities
  config/                  # Configuration
  version.ts              # Version information

services/
  pipeline/                # Main transformation pipeline
    ParserService/        # Initial parsing
    InterpreterService/   # Pipeline orchestration
    DirectiveService/     # Directive handling
    OutputService/        # Final output generation

  state/                      # State management
    StateService/             # Core state management
    StateEventService/        # Core event system

  resolution/                 # Resolution and validation
    ResolutionService/        # Variable/path resolution
    ValidationService/        # Directive validation
    CircularityService/       # Circular dependency detection

  fs/                         # File system operations
    FileSystemService/        # File operations
    PathService/              # Path handling
    PathOperationsService/    # Path utilities

  cli/                        # Command line interface
    CLIService/               # CLI entry point

tests/
  utils/
    debug/                    # Test debug utilities
      StateDebuggerService/   # Test debugging utilities
      StateVisualizationService/ # Test visualization
      StateHistoryService/    # Test history tracking
      StateTrackingService/   # Test state tracking
```

## Service Classification

### Pipeline Services (services/pipeline/)
1. **ParserService**
   - Initial AST parsing
   - Core pipeline component
   - Uses meld-ast

2. **InterpreterService**
   - Main pipeline orchestration
   - Handles node transformation
   - Core execution flow

3. **DirectiveService**
   - Directive handling and routing
   - Handler management
   - Core directive processing

4. **OutputService**
   - Final output generation
   - Format conversion
   - Clean output production

### State Services (services/state/)
1. **StateService**
   - Core state management
   - Used in production pipeline
   - Essential for directive processing
   - Handles variables and transformations

2. **StateEventService**
   - Core event system
   - Used for state change notifications
   - Required for pipeline operation
   - Production event handling

### Resolution Services (services/resolution/)
1. **ResolutionService**
   - Variable and path resolution
   - Reference handling
   - Context-aware resolution

2. **ValidationService**
   - Directive validation
   - Constraint checking
   - Error handling

3. **CircularityService**
   - Circular dependency detection
   - Import loop prevention
   - Reference cycle checking

### File System Services (services/fs/)
1. **FileSystemService**
   - File operations abstraction
   - Real/test filesystem support
   - Path validation

2. **PathService**
   - Path handling
   - Security constraints
   - Path normalization

3. **PathOperationsService**
   - Path utilities
   - Path joining/manipulation
   - Path validation

### CLI Services (services/cli/)
1. **CLIService**
   - Command line interface
   - Entry point handling
   - Pipeline orchestration

### Test Utilities (move to tests/utils/debug/)
1. **StateDebuggerService**
   - Purpose: Debug session management and diagnostics
   - Used only in: Test files, debugging
   - Features: Debug sessions, state analysis, operation tracing
   - Test-specific functionality

2. **StateVisualizationService**
   - Purpose: State visualization for debugging
   - Used only in: Test analysis, debugging
   - Features: Mermaid/DOT graphs, metrics
   - Test-specific visualizations

3. **StateHistoryService**
   - Purpose: Track state history for tests
   - Used only in: Test analysis
   - Features: Operation history, transformation chains
   - Test-specific history tracking

4. **StateTrackingService**
   - Purpose: Track state relationships in tests
   - Used only in: Test infrastructure
   - Features: State lineage, relationship tracking
   - Test-specific metadata

## Migration Steps

1. **Create New Directory Structure**
   ```bash
   mkdir -p tests/utils/debug
   mkdir -p services/{pipeline,state,resolution,fs,cli}
   ```

2. **Move Files**
   - Move test utilities to tests/utils/debug/
   - Move core state services to services/state/
   - VSCode will handle import updates automatically

3. **Update TestContext**
   - Update imports in TestContext.ts
   - Verify test utility initialization
   - Ensure debug service configuration

## Import Updates
VSCode will handle most import updates automatically when moving files, but special attention needed for:

1. **Core Imports**
   - Services use `@core/types` for shared types
   - Update tsconfig.json paths if needed
   - Verify core imports remain correct after moves

2. **Service Imports**
   - Update service-to-service imports
   - Maintain consistent import patterns
   - Use aliased imports where configured

3. **Test Utilities**
   - Update test utility imports in TestContext.ts
   - Verify debug service imports
   - Check mock implementations

4. **Key Files to Verify**
   - TestContext.ts
   - Service test files
   - Interface imports
   - Mock implementations

## Testing the Changes

1. **Verify Imports**
   ```bash
   npm run build  # Check for any missed imports
   ```

2. **Run Tests**
   ```bash
   npm test       # Verify all tests still pass
   ```

3. **Check Bundle**
   ```bash
   npm run build:prod  # Verify production bundle excludes test utilities
   ```

## Benefits

1. **Clearer Organization**
   - Test utilities properly categorized
   - Better separation of concerns
   - More intuitive file structure

2. **Reduced Production Bundle**
   - Test utilities excluded from production
   - Smaller deployment size
   - Better tree-shaking

3. **Improved Maintainability**
   - Clear distinction between production/test code
   - Easier to find debug utilities
   - Better organized test infrastructure

4. **Better Documentation**
   - Clear purpose for each service
   - Explicit test utility designation
   - Better developer experience

## Validation

After moving files:

1. **Build Validation**
   - [ ] All imports resolve correctly
   - [ ] No TypeScript errors
   - [ ] Clean build output

2. **Test Validation**
   - [ ] All tests pass
   - [ ] Debug utilities work as expected
   - [ ] Test infrastructure intact

3. **Production Validation**
   - [ ] Production build excludes test utils
   - [ ] Core functionality works
   - [ ] No debug code in production

## Future Considerations

1. Consider similar reorganization for other test utilities
2. Review other services for proper categorization
3. Consider creating a debug module for common test utilities
4. Document patterns for adding new test utilities 