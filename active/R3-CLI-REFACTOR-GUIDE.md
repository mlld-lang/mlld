# CLI System Refactoring Guide

## Executive Summary

The `cli/index.ts` file (1,611 lines) is a complex monolithic CLI entry point that handles all command routing, option parsing, file processing, and error management for mlld. This guide provides a comprehensive analysis of its intricate command dispatch logic and presents a detailed refactoring strategy to extract it into focused, maintainable modules while preserving the sophisticated CLI behavior and extensive option support.

## Current Analysis

### File Structure Overview

**Size**: 1,611 lines  
**Primary Function**: `main` - Central CLI entry point and command orchestrator  
**Key Dependencies**: Command modules, interpreter, services, error handling, configuration

### Core Responsibilities Identified

1. **Command Parsing & Routing** (Lines 144-407, 1340-1611)
   - `parseArgs` - Complex CLI argument parsing with 50+ options
   - Command detection and subcommand handling
   - Multi-level routing (commands → subcommands → flags)
   - Special command preprocessing (debug commands, aliases)

2. **Option Processing & Validation** (Lines 115-407)
   - `parseFlags` - Generic flag parsing utilities
   - `normalizeFormat` - Format validation and normalization
   - Complex option interdependencies and validation
   - CLI-to-API option transformation

3. **File Processing Pipeline** (Lines 1000-1189)
   - `processFileWithOptions` - Main file processing coordination
   - `processFile` - File processing wrapper with debug routing
   - Configuration loading and merging
   - Environment setup and interpreter integration

4. **Command Execution Dispatch** (Lines 1369-1578)
   - 15+ command handlers with individual routing logic
   - Subcommand delegation to specialized command modules
   - Flag parsing and context passing
   - Command-specific help handling

5. **Error Handling & Output Management** (Lines 1234-1334)
   - `handleError` - Central error processing and formatting
   - Error deduplication and console override
   - Trace formatting and source context
   - Exit code management

6. **Watch Mode & File Operations** (Lines 931-997)
   - `watchFiles` - File watching with pattern-based processing
   - `readStdinIfAvailable` - Stdin detection and reading
   - File existence checking and incremental naming

7. **User Interaction & Help** (Lines 409-794, 796-918)
   - `displayHelp` - Comprehensive help system for all commands
   - `confirmOverwrite` - Interactive file overwrite prompts
   - Terminal capabilities detection and fallback

## Critical Complexities and Dependencies

### 1. **Massive Option Matrix**
Complex CLI option system with 50+ flags and interdependencies:
- **URL Support**: 5 interrelated URL configuration options
- **Debug Commands**: 3 special debug modes with unique option sets
- **Output Management**: 8 output control options with validation
- **Import Approval**: 3 different bypass mechanisms
- **Context Debugging**: 6 visualization and filtering options

### 2. **Multi-Level Command Routing**
Sophisticated command dispatch with multiple routing levels:
- **Primary Commands**: 15+ main commands with individual handlers
- **Subcommand Detection**: Dynamic subcommand parsing and delegation
- **Flag Context**: Command-specific flag parsing and validation
- **Help Integration**: Per-command help with examples and usage

### 3. **File Processing Complexity**
Complex file processing pipeline with configuration merging:
- **Configuration Loading**: Multi-source config with CLI override logic
- **Service Integration**: File system, path service, and interpreter coordination
- **Environment Setup**: stdin handling, URL config, and security options
- **Output Routing**: stdout vs file output with overwrite confirmation

### 4. **Error Handling Architecture**
Sophisticated error processing with multiple formatting strategies:
- **Error Classification**: MlldError vs generic Error vs command execution errors
- **Formatting Strategies**: CLI-specific vs API formatting with fallbacks
- **Context Enhancement**: Source context, trace formatting, and path resolution
- **Console Override**: Error deduplication with bypass mechanisms

### 5. **Interactive Features**
Complex user interaction patterns:
- **Terminal Detection**: TTY detection with raw mode and readline fallbacks
- **Overwrite Prompts**: Interactive file overwrite with incremental naming
- **Watch Mode**: File watching with change detection and reprocessing
- **Help System**: Context-sensitive help with command-specific examples

### 6. **Configuration Integration**
Deep integration with configuration system:
- **Config Loading**: Multi-source configuration with precedence rules
- **Option Merging**: CLI options override configuration with validation
- **URL Configuration**: Complex URL config merging with security options
- **Output Configuration**: Output option inheritance and CLI override

## Proposed Refactoring Architecture

### Target Module Structure

```
cli/
├── CLIOrchestrator.ts              # Main coordination & entry point (~200 lines)
├── parsers/
│   ├── ArgumentParser.ts           # CLI argument parsing & validation (~250 lines)
│   ├── OptionProcessor.ts          # Option processing & normalization (~200 lines)
│   └── CommandDetector.ts          # Command detection & routing (~150 lines)
├── execution/
│   ├── CommandDispatcher.ts        # Command execution dispatch (~300 lines)
│   ├── FileProcessor.ts            # File processing pipeline (~250 lines)
│   └── WatchManager.ts             # Watch mode & file monitoring (~100 lines)
├── interaction/
│   ├── HelpSystem.ts              # Help display & documentation (~200 lines)
│   ├── UserInteraction.ts         # Interactive prompts & confirmation (~150 lines)
│   └── OutputManager.ts           # Output routing & file operations (~150 lines)
└── error/
    ├── ErrorHandler.ts            # Error processing & formatting (~200 lines)
    └── ConsoleManager.ts          # Console override & deduplication (~100 lines)
```

### Module Breakdown and Responsibilities

#### 1. CLIOrchestrator.ts (Main Coordinator)
**Responsibility**: Entry point coordination and high-level CLI orchestration

```typescript
export class CLIOrchestrator {
  constructor(
    private argumentParser: ArgumentParser,
    private commandDispatcher: CommandDispatcher,
    private fileProcessor: FileProcessor,
    private errorHandler: ErrorHandler
  ) {}

  async main(customArgs?: string[]): Promise<void> {
    // 1. Parse arguments and detect command type
    // 2. Route to appropriate handler (command vs file processing)
    // 3. Handle top-level error cases and cleanup
    // 4. Manage process lifecycle and exit codes
  }
}
```

**Key Methods**:
- `main()` - Main CLI entry point (replaces current function)
- `initializeServices()` - Service dependency injection setup
- `handleGlobalOptions()` - Global option processing (version, help, debug)
- `routeExecution()` - Route to command or file processing

#### 2. ArgumentParser.ts (CLI Argument Processing)
**Responsibility**: CLI argument parsing, validation, and option normalization

```typescript
export class ArgumentParser {
  parseArgs(args: string[]): ParsedCLIArguments {
    // Handle complex argument parsing with validation
  }
  
  validateOptions(options: CLIOptions): void {
    // Validate option interdependencies and constraints
  }
}

interface ParsedCLIArguments {
  command?: string;
  subcommands: string[];
  options: CLIOptions;
  remainingArgs: string[];
}
```

**Key Methods**:
- `parseArgs()` - Main argument parsing logic
- `parseFlags()` - Generic flag parsing utilities
- `validateOptions()` - Option validation and constraint checking
- `normalizeFormat()` - Format validation and normalization
- `detectSpecialCommands()` - Debug command preprocessing

**Complex Areas**:
- **Option Matrix**: 50+ CLI options with interdependencies
- **Command Detection**: Command vs file path disambiguation
- **Subcommand Parsing**: Dynamic subcommand detection and delegation
- **Validation Logic**: Cross-option validation and constraint checking

#### 3. CommandDispatcher.ts (Command Execution Routing)
**Responsibility**: Command routing and execution delegation

```typescript
export class CommandDispatcher {
  async executeCommand(
    command: string, 
    subcommands: string[], 
    options: CLIOptions
  ): Promise<void> {
    // Route to appropriate command handler
  }
}
```

**Key Methods**:
- `executeCommand()` - Main command routing logic
- `createCommandHandler()` - Command instance creation
- `handleSubcommands()` - Subcommand delegation
- `parseCommandFlags()` - Command-specific flag processing

**Complex Areas**:
- **Command Registry**: 15+ command handlers with different interfaces
- **Subcommand Delegation**: Dynamic subcommand parsing and context passing
- **Flag Context**: Command-specific flag parsing and validation
- **Help Integration**: Per-command help routing

#### 4. FileProcessor.ts (File Processing Pipeline)
**Responsibility**: File processing coordination and interpreter integration

```typescript
export class FileProcessor {
  constructor(
    private outputManager: OutputManager,
    private watchManager: WatchManager
  ) {}

  async processFile(options: CLIOptions): Promise<void> {
    // Coordinate file processing pipeline
  }
}
```

**Key Methods**:
- `processFile()` - Main file processing coordination
- `setupEnvironment()` - Environment and service setup
- `loadConfiguration()` - Configuration loading and merging
- `executeInterpretation()` - Interpreter execution
- `handleOutput()` - Output routing and management

**Complex Areas**:
- **Configuration Merging**: Multi-source config with CLI override logic
- **Service Integration**: File system, path service, and interpreter coordination
- **Environment Setup**: stdin handling, URL config, and security options
- **Interpreter Integration**: Option transformation and result handling

#### 5. HelpSystem.ts (Help Display & Documentation)
**Responsibility**: Comprehensive help system for all commands

```typescript
export class HelpSystem {
  displayHelp(command?: string, context?: HelpContext): void {
    // Display contextual help information
  }
}

interface HelpContext {
  showExamples: boolean;
  verboseMode: boolean;
  commandPath: string[];
}
```

**Key Methods**:
- `displayHelp()` - Main help display coordination
- `getCommandHelp()` - Command-specific help content
- `formatHelpContent()` - Help formatting and layout
- `generateExamples()` - Dynamic example generation

**Complex Areas**:
- **Command Documentation**: Individual help for 15+ commands
- **Example Generation**: Context-specific examples
- **Help Formatting**: Consistent layout and formatting
- **Context Sensitivity**: Command-path-aware help display

#### 6. ErrorHandler.ts (Error Processing & Formatting)
**Responsibility**: Centralized error processing and formatting

```typescript
export class ErrorHandler {
  constructor(private consoleManager: ConsoleManager) {}

  async handleError(error: any, options: CLIOptions): Promise<void> {
    // Process and format errors with context
  }
}
```

**Key Methods**:
- `handleError()` - Main error processing logic
- `classifyError()` - Error type classification
- `formatError()` - Error formatting with context
- `handleSeverity()` - Severity-based exit code management

**Complex Areas**:
- **Error Classification**: MlldError vs generic Error vs command execution errors
- **Formatting Strategies**: CLI-specific vs API formatting with fallbacks
- **Context Enhancement**: Source context, trace formatting, and path resolution
- **Exit Code Management**: Severity-based process termination

#### 7. UserInteraction.ts (Interactive Prompts)
**Responsibility**: User interaction and confirmation prompts

```typescript
export class UserInteraction {
  async confirmOverwrite(filePath: string): Promise<OverwriteResult> {
    // Handle interactive file overwrite confirmation
  }
}

interface OverwriteResult {
  outputPath: string;
  shouldOverwrite: boolean;
}
```

**Key Methods**:
- `confirmOverwrite()` - File overwrite confirmation
- `detectTerminalCapabilities()` - TTY and raw mode detection
- `readUserInput()` - User input reading with fallbacks
- `generateIncrementalFilename()` - Incremental filename generation

**Complex Areas**:
- **Terminal Detection**: TTY detection with raw mode and readline fallbacks
- **Input Handling**: Raw mode vs readline input with error handling
- **Filename Generation**: Incremental naming with conflict resolution

#### 8. OutputManager.ts (Output Routing & File Operations)
**Responsibility**: Output routing and file operation management

```typescript
export class OutputManager {
  async writeOutput(
    content: string, 
    options: OutputOptions
  ): Promise<void> {
    // Handle output routing and file operations
  }
}

interface OutputOptions {
  filePath?: string;
  stdout: boolean;
  format: string;
  overwriteConfirm: boolean;
}
```

**Key Methods**:
- `writeOutput()` - Main output routing logic
- `setupOutputPath()` - Output path determination and validation
- `writeToFile()` - File writing with directory creation
- `writeToStdout()` - Stdout output handling

#### 9. WatchManager.ts (Watch Mode & File Monitoring)
**Responsibility**: File watching and change detection

```typescript
export class WatchManager {
  async watchFiles(options: CLIOptions): Promise<void> {
    // Handle file watching with pattern-based processing
  }
}
```

**Key Methods**:
- `watchFiles()` - Main file watching coordination
- `setupWatcher()` - File watcher configuration
- `handleFileChange()` - Change detection and processing
- `filterWatchEvents()` - Event filtering and pattern matching

## Implementation Strategy

### Phase 1: Extract Error Handling (Low Risk)
**Target**: ErrorHandler.ts & ConsoleManager.ts  
**Timeline**: 1 day

1. Extract error handling and console management logic
2. Create unified error processing interface
3. Update main CLI to use new error handler
4. Test error scenarios and formatting

**Benefits**:
- Isolated error logic for better testing
- Clear error handling interface
- Better error attribution and context

### Phase 2: Extract User Interaction (Low Risk)
**Target**: UserInteraction.ts & OutputManager.ts  
**Timeline**: 1 day

1. Extract interactive prompts and output management
2. Create clear interaction interfaces
3. Move file operation logic to OutputManager
4. Test interactive scenarios

**Benefits**:
- Isolated interaction logic
- Better testing of user prompts
- Clear output routing

### Phase 3: Extract Help System (Low Risk)
**Target**: HelpSystem.ts  
**Timeline**: 0.5 days

1. Extract help display logic into HelpSystem
2. Create structured help content management
3. Update command routing to use help system
4. Test help display for all commands

**Benefits**:
- Centralized help management
- Better help content organization
- Easier help content updates

### Phase 4: Extract Argument Parsing (Medium Risk)
**Target**: ArgumentParser.ts & OptionProcessor.ts  
**Timeline**: 2 days

1. Extract complex argument parsing logic
2. Move option validation and normalization
3. Create clear parsing interfaces
4. Test all CLI option combinations

**Benefits**:
- Isolated parsing complexity
- Better testing of option logic
- Clear argument processing pipeline

### Phase 5: Extract File Processing (Medium Risk)
**Target**: FileProcessor.ts & WatchManager.ts  
**Timeline**: 1.5 days

1. Extract file processing pipeline
2. Move configuration loading and merging
3. Separate watch mode into WatchManager
4. Test file processing scenarios

**Benefits**:
- Clear file processing pipeline
- Better separation of concerns
- Isolated watch mode logic

### Phase 6: Extract Command Dispatch (Medium-High Risk)
**Target**: CommandDispatcher.ts & CommandDetector.ts  
**Timeline**: 2.5 days

1. Extract command routing and dispatch logic
2. Create command registry and factory
3. Move subcommand handling to dispatcher
4. Test all command routing scenarios

**Benefits**:
- Centralized command management
- Better command organization
- Easier to add new commands

### Phase 7: Create Main Coordinator (Low Risk)
**Target**: CLIOrchestrator.ts  
**Timeline**: 1 day

1. Create main coordinator with dependency injection
2. Implement service orchestration
3. Move process lifecycle management
4. Update CLI entry point

**Benefits**:
- Clear separation of coordination vs implementation
- Better dependency management
- Easier testing and mocking

## Critical Implementation Details

### 1. **Interface Design Principles**

**Clear Component Separation**:
```typescript
// Each module has focused responsibility
interface ArgumentParser {
  parseArgs(args: string[]): ParsedCLIArguments;
  validateOptions(options: CLIOptions): void;
}

interface CommandDispatcher {
  executeCommand(command: string, subcommands: string[], options: CLIOptions): Promise<void>;
  supportsCommand(command: string): boolean;
}

interface FileProcessor {
  processFile(options: CLIOptions): Promise<void>;
  setupEnvironment(options: CLIOptions): Promise<ProcessingEnvironment>;
}
```

**Dependency Injection Pattern**:
```typescript
// Clear dependency relationships
export class CLIOrchestrator {
  constructor(
    private argumentParser: ArgumentParser,
    private commandDispatcher: CommandDispatcher,
    private fileProcessor: FileProcessor,
    private errorHandler: ErrorHandler
  ) {}
}
```

### 2. **Preserving Complex Logic**

**Critical Areas to Preserve Exactly**:

1. **Option Parsing Logic** (Lines 144-407):
   ```typescript
   // Must preserve exact CLI option parsing behavior
   case '--url-allowed-domains':
     options.urlAllowedDomains = args[++i].split(',').filter(Boolean);
     break;
   ```

2. **Command Detection Logic** (Lines 158-173):
   ```typescript
   // Must preserve exact command detection and subcommand handling
   const commandsWithSubcommands = ['auth', 'registry', 'install', ...];
   if (commandsWithSubcommands.includes(arg)) {
     options._ = args.slice(i + 1);
     stopParsing = true;
   }
   ```

3. **Error Formatting Logic** (Lines 1234-1334):
   ```typescript
   // Must preserve exact error classification and formatting
   const isMlldError = error instanceof MlldError;
   const isCommandError = error.constructor.name === 'MlldCommandExecutionError';
   ```

4. **Configuration Merging** (Lines 1037-1068):
   ```typescript
   // Must preserve exact CLI option override logic
   if (cliOptions.allowUrls) {
     finalUrlConfig = { /* complex merging logic */ };
   }
   ```

### 3. **Testing Strategy**

**Unit Testing by Component**:
```typescript
// Each module can be tested independently
describe('ArgumentParser', () => {
  it('parses complex CLI options correctly', () => {
    // Test option parsing logic in isolation
  });
  
  it('validates option interdependencies', () => {
    // Test option validation logic
  });
});

describe('CommandDispatcher', () => {
  it('routes commands correctly', () => {
    // Test command routing logic
  });
  
  it('handles subcommands properly', () => {
    // Test subcommand delegation
  });
});
```

**Integration Testing**:
- Full CLI workflow tests
- Cross-component interaction validation
- Command execution integration testing

### 4. **Maintaining CLI Compatibility**

**Preserve CLI Interface**:
```typescript
// Current CLI interface must continue to work
mlld [command] [options] <input-file>
mlld --help
mlld --version
mlld install @author/module
mlld publish --dry-run
```

**Command Compatibility**:
- All existing commands continue to work
- Help output remains consistent
- Option parsing behavior unchanged
- Error messages maintain current format

### 5. **Configuration Integration**

**Maintain Configuration API**:
```typescript
// Current configuration loading must continue to work
const configLoader = new ConfigLoader(path.dirname(input));
const config = configLoader.load();
const urlConfig = configLoader.resolveURLConfig(config);
```

**Option Merging Logic**:
- Preserve exact CLI option override behavior
- Maintain configuration precedence rules
- Keep URL and output configuration merging

## Risk Mitigation

### High-Risk Areas

1. **Command Routing Logic**
   - **Risk**: Breaking command detection or routing
   - **Mitigation**: Extensive testing of all command combinations
   - **Validation**: Test all 15+ commands with subcommands

2. **Option Parsing Complexity**
   - **Risk**: Breaking CLI option parsing or validation
   - **Mitigation**: Preserve exact parsing logic and validation rules
   - **Validation**: Test all 50+ CLI options and combinations

3. **Error Handling Integration**
   - **Risk**: Breaking error formatting or classification
   - **Mitigation**: Preserve exact error processing logic
   - **Validation**: Test all error types and formatting scenarios

4. **File Processing Pipeline**
   - **Risk**: Breaking file processing or configuration merging
   - **Mitigation**: Preserve exact configuration loading and option merging
   - **Validation**: Test file processing with all configuration combinations

### Medium-Risk Areas

1. **User Interaction**: Interactive prompts and terminal detection
2. **Watch Mode**: File watching and change detection
3. **Help System**: Help display and content formatting

### Low-Risk Areas

1. **Output Management**: File writing and routing
2. **Service Coordination**: Dependency injection improvements
3. **Code Organization**: Structural improvements

## Success Metrics

### Quantitative Goals
- **Line count reduction**: 1,611 → ~1,700 lines across 9 focused modules
- **Function count reduction**: Eliminate 20+ complex nested functions
- **Test coverage**: Maintain 99%+ CLI test coverage
- **Performance**: No regression in CLI startup or execution time

### Qualitative Goals
- **Single responsibility**: Each module handles one CLI concern
- **Better error attribution**: Errors clearly identify failing component
- **Improved testability**: Components can be tested independently
- **Enhanced maintainability**: Easier to modify specific CLI aspects

## Expected Benefits

### Development Experience
- **Easier debugging**: Failures isolated to specific components
- **Better testing**: Unit tests for individual CLI phases
- **Clearer code navigation**: Find CLI logic quickly
- **Safer modifications**: Changes isolated to specific responsibilities

### System Architecture
- **Better separation of concerns**: Clear module boundaries
- **Improved error handling**: Better error context and attribution
- **Enhanced extensibility**: Easy to add new commands or options
- **Cleaner interfaces**: Clear contracts between components

### Long-term Maintainability
- **Reduced complexity**: Smaller, focused modules
- **Better documentation**: Self-documenting through organization
- **Easier onboarding**: Clear CLI architecture
- **Future-proof design**: Easy to extend for new CLI requirements

## Conclusion

The CLI system refactoring represents a high-value architectural improvement that addresses one of mlld's most complex and user-facing components. By carefully extracting the monolithic cli/index.ts into focused modules while preserving the sophisticated command routing, option parsing, and error handling behavior, this refactoring will significantly improve the maintainability and extensibility of mlld's CLI system.

The phased approach ensures manageable risk while delivering incremental value, and the focus on preserving complex logic ensures that the sophisticated CLI behavior that users depend on remains intact.