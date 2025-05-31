# Output Management System Design

## Overview

This document outlines the comprehensive design for mlld's output management system. The goal is to provide excellent user experience for command execution, error handling, progress tracking, and interactive prompts while maintaining extensibility for future features and web interface support.

## Current State Analysis

### Existing Output Types

1. **Command Output** - `@run` directives using `execSync` in Environment.ts
2. **Error Messages** - `MlldError` instances with source locations, handled by ErrorFormatSelector
3. **Security Approvals** - Interactive import prompts using readline (ImportApproval.ts)
4. **Progress Information** - Currently minimal logging only
5. **Debug Information** - Controlled by CLI flags (--verbose, --debug)
6. **File Operations** - Overwrite confirmations in CLI

### Key Problems Identified

- **No Progress Visibility**: Long-running commands execute silently
- **No Output Control**: Can't truncate high-volume output or handle streaming
- **Inconsistent Error Handling**: Some commands halt on error, others continue
- **Limited Extensibility**: No plugin architecture for command-specific handling
- **Poor Test Runner Integration**: Test output doesn't show real-time progress
- **Memory Issues**: Large outputs captured entirely in memory
- **Web Interface Limitations**: Current design doesn't support browser environments

## Proposed Architecture

### Core Output Management System

```typescript
// Central output dispatcher - handles all forms of output
interface IOutputManager {
  // Command execution with progress tracking
  executeCommand(command: string, options: CommandOptions): Promise<CommandResult>
  
  // Error handling with severity-based behavior
  handleError(error: MlldError, context: ErrorContext): Promise<ErrorAction>
  
  // Interactive prompts with timeout support
  prompt(request: PromptRequest): Promise<PromptResponse>
  
  // Progress tracking for long operations
  showProgress(operation: ProgressOperation): ProgressTracker
  
  // Output formatting and display
  displayOutput(content: OutputContent, format: OutputFormat): void
}

// Command execution options
interface CommandOptions {
  cwd?: string
  timeout?: number
  maxOutputSize?: number
  showProgress?: boolean
  errorHandling?: 'halt' | 'continue' | 'prompt'
  truncateAt?: number
  streamOutput?: boolean
  customHandler?: CommandHandler
  verbosity?: 'silent' | 'minimal' | 'normal' | 'verbose' | 'debug'
}

// Command execution result
interface CommandResult {
  stdout: string
  stderr: string
  exitCode: number
  truncated: boolean
  duration: number
  outputType: 'success' | 'warning' | 'error'
  metadata?: CommandMetadata
}

interface CommandMetadata {
  startTime: Date
  endTime: Date
  workingDirectory: string
  environmentVariables: Record<string, string>
  processId: number
}
```

### Progress Management

```typescript
interface ProgressTracker {
  update(message: string, progress?: number): void
  complete(result?: string): void
  error(error: Error): void
  cancel(): void
  setDetails(details: ProgressDetails): void
}

interface ProgressDetails {
  totalSteps?: number
  currentStep?: number
  currentOperation?: string
  estimatedTimeRemaining?: number
}

// Different progress display modes
type ProgressMode = 
  | 'silent'        // No output
  | 'spinner'       // Simple spinner with basic info
  | 'detailed'      // Show command output in real-time
  | 'summarized'    // Show start/end with duration only
  | 'interactive'   // User can toggle between modes
```

### Output Control System

```typescript
interface OutputController {
  // Verbosity levels
  setVerbosity(level: 'silent' | 'minimal' | 'normal' | 'verbose' | 'debug'): void
  
  // Output filtering
  addFilter(filter: OutputFilter): void
  removeFilter(filterId: string): void
  
  // Custom formatters
  registerFormatter(type: string, formatter: OutputFormatter): void
  
  // Output streaming
  enableStreaming(commands: string[]): void
  
  // Error collection
  enableErrorCollection(collectUntilEnd: boolean): void
  getCollectedErrors(): CollectedError[]
  displayCollectedErrors(): void
}

interface OutputFilter {
  id: string
  pattern: RegExp | string
  action: 'hide' | 'highlight' | 'redirect'
  target?: string // For redirect action
}

interface CollectedError {
  error: Error
  command: string
  timestamp: Date
  context: ErrorContext
}
```

## Plugin Architecture

### Command Handler Plugins

```typescript
interface IOutputPlugin {
  name: string
  version: string
  description: string
  
  // Command pattern matching
  getCommandPatterns(): CommandPattern[]
  
  // Execute with custom handling
  executeCommand(command: string, options: CommandOptions): Promise<CommandResult>
  
  // Custom progress display
  createProgressDisplay(command: string): ProgressDisplay
  
  // Output post-processing
  processOutput(output: CommandResult): ProcessedOutput
  
  // Configuration schema
  getConfigurationSchema(): PluginConfigSchema
}

interface CommandPattern {
  pattern: RegExp | string
  priority: number // Higher numbers take precedence
  description: string
  examples: string[]
}

interface ProcessedOutput {
  formatted: string
  metadata: OutputMetadata
  highlights: OutputHighlight[]
  actionableItems: ActionableItem[]
}

interface OutputHighlight {
  type: 'error' | 'warning' | 'success' | 'info'
  message: string
  location?: SourceLocation
}

interface ActionableItem {
  type: 'fix' | 'investigate' | 'rerun'
  description: string
  command?: string
  automated?: boolean
}
```

### Built-in Plugin Examples

```typescript
class NpmOutputPlugin implements IOutputPlugin {
  name = 'npm-plugin'
  version = '1.0.0'
  description = 'Enhanced output handling for npm commands'
  
  getCommandPatterns(): CommandPattern[] {
    return [
      { 
        pattern: /^npm (install|i)/, 
        priority: 10, 
        description: 'npm install commands',
        examples: ['npm install', 'npm i --save-dev jest']
      },
      { 
        pattern: /^npm (run|test|build)/, 
        priority: 10, 
        description: 'npm script execution',
        examples: ['npm run build', 'npm test']
      }
    ]
  }
  
  async executeCommand(command: string, options: CommandOptions): Promise<CommandResult> {
    // Custom npm execution with:
    // - Progress parsing for package installation
    // - Dependency tree visualization
    // - Security vulnerability warnings
    // - Disk space monitoring
    // - Network speed estimation
  }
  
  createProgressDisplay(command: string): ProgressDisplay {
    if (command.includes('install')) {
      return new NpmInstallProgressDisplay(command)
    }
    return new NpmScriptProgressDisplay(command)
  }
}

class TestRunnerPlugin implements IOutputPlugin {
  name = 'test-runner-plugin'
  version = '1.0.0'
  description = 'Enhanced output for test runners'
  
  getCommandPatterns(): CommandPattern[] {
    return [
      { 
        pattern: /jest|vitest|mocha|tap|ava/, 
        priority: 15, 
        description: 'JavaScript test runners',
        examples: ['npm test', 'jest --watch', 'vitest run']
      },
      {
        pattern: /pytest|unittest/,
        priority: 15,
        description: 'Python test runners',
        examples: ['pytest', 'python -m unittest']
      }
    ]
  }
  
  async executeCommand(command: string, options: CommandOptions): Promise<CommandResult> {
    // Custom test execution with:
    // - Real-time test pass/fail counts
    // - Failed test details shown immediately
    // - Test coverage progress
    // - Performance regression detection
    // - Flaky test identification
  }
}

class GitOutputPlugin implements IOutputPlugin {
  name = 'git-plugin'
  version = '1.0.0'
  description = 'Enhanced git command output'
  
  getCommandPatterns(): CommandPattern[] {
    return [
      { 
        pattern: /^git/, 
        priority: 8, 
        description: 'Git commands',
        examples: ['git status', 'git commit', 'git push']
      }
    ]
  }
  
  async executeCommand(command: string, options: CommandOptions): Promise<CommandResult> {
    // Custom git execution with:
    // - Branch status visualization
    // - Merge conflict highlighting
    // - Commit graph display
    // - Remote sync status
    // - Suggested next actions
  }
}
```

## Implementation Phases

### Phase 1: MVP Foundation (2-3 weeks)

**Core Infrastructure:**
1. Enhanced `Environment.executeCommand()` method with basic options
2. Progress tracking with spinner and duration display
3. Output truncation with configurable limits
4. Error collection system for displaying at end
5. New CLI options: `--max-output-lines`, `--show-progress`, `--error-behavior`

**Changes to Environment.ts:**
```typescript
interface CommandExecutionOptions {
  showProgress?: boolean
  maxOutputLines?: number
  errorBehavior?: 'halt' | 'continue'
  timeout?: number
}

async executeCommand(command: string, options: CommandExecutionOptions = {}): Promise<string> {
  const { showProgress = true, maxOutputLines = 50, errorBehavior = 'continue' } = options;
  
  if (showProgress) {
    console.log(`⚡ Running: ${command}`);
  }
  
  const startTime = Date.now();
  
  try {
    const result = execSync(command, {
      encoding: 'utf8',
      cwd: await this.getProjectPath(),
      env: { ...process.env },
      maxBuffer: 10 * 1024 * 1024, // 10MB limit
      timeout: options.timeout || 30000
    });
    
    const duration = Date.now() - startTime;
    const output = this.processOutput(result, maxOutputLines);
    
    if (showProgress) {
      console.log(`✅ Completed in ${duration}ms`);
    }
    
    return output;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.log(`❌ Failed after ${duration}ms`);
    
    if (errorBehavior === 'halt') {
      throw error;
    }
    
    // Collect error for later display
    this.collectError(error, command);
    return error.stdout || error.message || '';
  }
}

private processOutput(output: string, maxLines: number): string {
  const lines = output.split('\n');
  if (lines.length <= maxLines) {
    return output.trimEnd();
  }
  
  const truncated = lines.slice(0, maxLines).join('\n');
  const remaining = lines.length - maxLines;
  return `${truncated}\n... (${remaining} more lines, use --verbose to see all)`;
}
```

**CLI Option Enhancements:**
```typescript
interface CLIOptions {
  // ... existing options
  maxOutputLines?: number;
  showProgress?: boolean;
  errorBehavior?: 'halt' | 'continue';
  collectErrors?: boolean;
  progressMode?: 'spinner' | 'detailed' | 'silent';
}
```

**Expected User Experience Improvements:**
```
$ mlld demo.mld
⚡ Running: npm install
✅ Completed in 2.3s
⚡ Running: npm test
❌ Failed after 1.8s
⚡ Running: git status
✅ Completed in 0.1s

❌ 1 error occurred:
1. Command failed: npm test
   └─ Exit code: 1 (Test failures)
   └─ Use --verbose to see full output
```

### Phase 2: Plugin System Foundation (1-2 months)

**Plugin Manager Implementation:**
```typescript
// core/output/PluginManager.ts
class OutputPluginManager {
  private plugins: Map<string, IOutputPlugin> = new Map();
  private enabledPlugins: Set<string> = new Set();
  
  registerPlugin(plugin: IOutputPlugin): void {
    this.plugins.set(plugin.name, plugin);
  }
  
  enablePlugin(name: string): void {
    this.enabledPlugins.add(name);
  }
  
  async executeCommand(command: string, options: CommandOptions): Promise<CommandResult> {
    const plugin = this.findBestPlugin(command);
    
    if (plugin) {
      return plugin.executeCommand(command, options);
    }
    
    return this.defaultExecution(command, options);
  }
  
  private findBestPlugin(command: string): IOutputPlugin | null {
    let bestMatch: { plugin: IOutputPlugin; priority: number } | null = null;
    
    for (const plugin of this.getEnabledPlugins()) {
      for (const pattern of plugin.getCommandPatterns()) {
        if (this.matchesPattern(command, pattern.pattern)) {
          if (!bestMatch || pattern.priority > bestMatch.priority) {
            bestMatch = { plugin, priority: pattern.priority };
          }
        }
      }
    }
    
    return bestMatch?.plugin || null;
  }
}
```

**Built-in Plugins:**
- NpmOutputPlugin - Enhanced npm command handling
- TestRunnerPlugin - Better test output parsing
- GitOutputPlugin - Improved git command display

**Configuration Integration:**
```json
// mlld.config.json
{
  "output": {
    "verbosity": "normal",
    "progressMode": "detailed",
    "plugins": {
      "enabled": ["npm-plugin", "test-runner-plugin", "git-plugin"],
      "npm-plugin": {
        "showDependencyTree": true,
        "warnOnSecurityIssues": true
      }
    }
  }
}
```

### Phase 3: Advanced Output Control (2-3 months)

**Streaming Output System:**
```typescript
// core/output/StreamingExecutor.ts
class StreamingExecutor {
  async executeStreamingCommand(
    command: string, 
    outputHandler: OutputHandler
  ): Promise<CommandResult> {
    
    const child = spawn(command, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true
    });
    
    const outputBuffer: string[] = [];
    const errorBuffer: string[] = [];
    const startTime = Date.now();
    
    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      outputBuffer.push(text);
      outputHandler.onStdout(text);
    });
    
    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      errorBuffer.push(text);
      outputHandler.onStderr(text);
    });
    
    return new Promise((resolve, reject) => {
      child.on('close', (code) => {
        resolve({
          stdout: outputBuffer.join(''),
          stderr: errorBuffer.join(''),
          exitCode: code || 0,
          truncated: false,
          duration: Date.now() - startTime,
          outputType: code === 0 ? 'success' : 'error'
        });
      });
      
      child.on('error', reject);
    });
  }
}

interface OutputHandler {
  onStdout(data: string): void;
  onStderr(data: string): void;
  onProgress(progress: ProgressUpdate): void;
  onComplete(result: CommandResult): void;
}
```

**Advanced Configuration System:**
```typescript
interface OutputConfiguration {
  verbosity: 'silent' | 'minimal' | 'normal' | 'verbose' | 'debug';
  progressMode: 'none' | 'spinner' | 'detailed' | 'streaming';
  
  truncation: {
    enabled: boolean;
    maxLines: number;
    maxCharacters: number;
    preserveErrors: boolean;
  };
  
  errorHandling: {
    default: 'halt' | 'continue' | 'prompt';
    perCommand: Record<string, 'halt' | 'continue' | 'prompt'>;
    collectAndDisplayAtEnd: boolean;
    maxErrorsToShow: number;
  };
  
  plugins: {
    enabled: string[];
    config: Record<string, any>;
    autoDetect: boolean;
  };
  
  formatting: {
    useColors: boolean;
    useEmoji: boolean;
    timestampFormat: string;
    indentLevel: number;
  };
  
  streaming: {
    enabled: boolean;
    bufferSize: number;
    commands: string[];
    liveOutput: boolean;
  };
  
  performance: {
    trackCommandTiming: boolean;
    warnOnSlowCommands: number; // milliseconds
    maxConcurrentCommands: number;
  };
}
```

### Phase 4: Web Interface Support (3-4 months)

**Abstract Output Interface:**
```typescript
// core/output/AbstractOutput.ts
interface IOutputChannel {
  write(content: string, type: OutputType): void;
  writeProgress(progress: ProgressUpdate): void;
  writeError(error: Error, context?: any): void;
  prompt(request: PromptRequest): Promise<PromptResponse>;
  clear(): void;
  enableRealTimeUpdates(enabled: boolean): void;
}

enum OutputType {
  STDOUT = 'stdout',
  STDERR = 'stderr',
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  SUCCESS = 'success',
  DEBUG = 'debug'
}

// CLI implementation
class CLIOutputChannel implements IOutputChannel {
  write(content: string, type: OutputType): void {
    switch (type) {
      case OutputType.STDOUT:
        console.log(content);
        break;
      case OutputType.STDERR:
        console.error(chalk.red(content));
        break;
      case OutputType.INFO:
        console.info(chalk.blue(content));
        break;
      case OutputType.WARNING:
        console.warn(chalk.yellow(content));
        break;
      case OutputType.ERROR:
        console.error(chalk.red(content));
        break;
      case OutputType.SUCCESS:
        console.log(chalk.green(content));
        break;
      case OutputType.DEBUG:
        console.debug(chalk.gray(content));
        break;
    }
  }
  
  writeProgress(progress: ProgressUpdate): void {
    // Update CLI progress display (spinner, progress bar, etc.)
    this.clearCurrentLine();
    process.stdout.write(`${progress.emoji} ${progress.message}`);
    if (progress.percentage !== undefined) {
      process.stdout.write(` (${progress.percentage}%)`);
    }
  }
  
  async prompt(request: PromptRequest): Promise<PromptResponse> {
    // Use readline for interactive prompts
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    try {
      const answer = await rl.question(request.message);
      return { response: answer, cancelled: false };
    } finally {
      rl.close();
    }
  }
}

// Web implementation (future)
class WebOutputChannel implements IOutputChannel {
  constructor(private websocket: WebSocket) {}
  
  write(content: string, type: OutputType): void {
    this.websocket.send(JSON.stringify({
      type: 'output',
      content,
      outputType: type,
      timestamp: new Date().toISOString()
    }));
  }
  
  writeProgress(progress: ProgressUpdate): void {
    this.websocket.send(JSON.stringify({
      type: 'progress',
      progress,
      timestamp: new Date().toISOString()
    }));
  }
  
  async prompt(request: PromptRequest): Promise<PromptResponse> {
    return new Promise((resolve) => {
      const requestId = Math.random().toString(36);
      
      this.websocket.send(JSON.stringify({
        type: 'prompt',
        request: { ...request, id: requestId }
      }));
      
      const handler = (event: MessageEvent) => {
        const data = JSON.parse(event.data);
        if (data.type === 'prompt-response' && data.requestId === requestId) {
          this.websocket.removeEventListener('message', handler);
          resolve(data.response);
        }
      };
      
      this.websocket.addEventListener('message', handler);
    });
  }
}
```

## User Experience Examples

### Enhanced Command Progress
```
$ mlld demo.mld --progress-mode=detailed

⚡ Running: npm install
📦 Installing dependencies...
├── react@18.2.0
├── typescript@5.0.0
└── jest@29.0.0
✅ Completed in 3.2s (24 packages installed)

⚡ Running: npm test
🧪 Running tests...
├── ✅ user.test.ts (5 tests)
├── ❌ auth.test.ts (2/3 tests failed)
└── ✅ utils.test.ts (8 tests)
❌ Failed in 2.1s (15/16 tests passed)

⚡ Running: git status
📊 Repository status...
✅ Completed in 0.1s (3 files modified)

❌ 1 command failed:
1. npm test (Exit code: 1)
   └─ 2 test failures in auth.test.ts
   └─ Run `npm test -- --verbose` for details
```

### Error Collection Display
```
❌ 3 errors occurred during execution:

1. Command failed: npm test
   ├─ File: demo.mld:23
   ├─ Duration: 2.1s
   ├─ Exit code: 1
   └─ Suggestion: Run with --verbose to see test details

2. Import security warning: external-api.mld:8
   ├─ URL: https://api.example.com/data.mld
   ├─ Issue: Domain not in allowed list
   └─ Suggestion: Add domain to mlld.config.json or use --allow-domain

3. Variable resolution failed: main.mld:42
   ├─ Variable: @config.database.url
   ├─ Issue: Property 'database' not found
   └─ Suggestion: Check import from config.mld

💡 Use `mlld --show-logs` to see full command output
💡 Use `mlld --help error-handling` for error handling options
```

### High-Volume Output Truncation
```
⚡ Running: npm run build:all
📦 Building production bundle...

webpack compiled successfully
Asset       Size  Chunks             Chunk Names
main.js     2.3M       0  [emitted]  main
vendor.js   1.8M       1  [emitted]  vendor
... (247 more files)

✅ Build completed in 45.2s
📊 Generated 250 files (12.3MB total)
📝 Full output saved to: .mlld/logs/build-20240127-143052.log
```

## File Structure

The output management system will be organized as follows:

```
core/
├── output/
│   ├── IOutputManager.ts           # Core interface
│   ├── OutputManager.ts            # Main implementation
│   ├── PluginManager.ts            # Plugin system
│   ├── StreamingExecutor.ts        # Streaming command execution
│   ├── ProgressTracker.ts          # Progress management
│   ├── OutputController.ts         # Output control and filtering
│   └── channels/
│       ├── IOutputChannel.ts       # Abstract output interface
│       ├── CLIOutputChannel.ts     # CLI implementation
│       └── WebOutputChannel.ts     # Web implementation (future)
├── plugins/
│   ├── IOutputPlugin.ts            # Plugin interface
│   ├── NpmOutputPlugin.ts          # npm command handling
│   ├── TestRunnerPlugin.ts         # Test runner handling
│   ├── GitOutputPlugin.ts          # Git command handling
│   └── BuiltinPluginRegistry.ts    # Built-in plugin registration
└── config/
    └── OutputConfiguration.ts      # Configuration types and loading
```

## Migration Strategy

### Phase 1: Non-Breaking Changes
- Add new methods to Environment class alongside existing ones
- Introduce new CLI options with sensible defaults
- Maintain backward compatibility for existing scripts

### Phase 2: Gradual Migration
- Deprecate old methods with migration warnings
- Update documentation with new patterns
- Provide migration scripts for common use cases

### Phase 3: Full Migration
- Remove deprecated methods
- Make new system the default
- Update all internal usage

## Testing Strategy

### Unit Tests
- Test each plugin independently
- Test output formatting and truncation
- Test error collection and display
- Test progress tracking accuracy

### Integration Tests
- Test plugin interactions
- Test CLI option combinations
- Test configuration loading and validation
- Test web interface communication

### Performance Tests
- Test memory usage with large outputs
- Test streaming performance
- Test concurrent command execution
- Test plugin overhead

### User Experience Tests
- Test with real-world mlld files
- Test with slow commands (network requests, builds)
- Test error scenarios and recovery
- Test interactive prompt flows

## Success Metrics

### User Experience
- **Command Visibility**: Users can see what commands are running
- **Progress Feedback**: Users know how long operations will take
- **Error Clarity**: Users understand what went wrong and how to fix it
- **Output Control**: Users can control verbosity and output format

### Technical
- **Performance**: No significant overhead for normal operations
- **Memory Usage**: Streaming prevents memory issues with large outputs
- **Extensibility**: Easy to add new command handlers
- **Maintainability**: Clean separation of concerns

### Adoption
- **Configuration**: Most users can use defaults without configuration
- **Customization**: Advanced users can customize behavior extensively
- **Plugin Ecosystem**: Community can contribute command handlers
- **Web Interface**: System supports future web-based interfaces

## Conclusion

This output management system design provides a comprehensive solution for mlld's output challenges. It offers immediate improvements through the MVP phase while establishing a foundation for advanced features and future web interface support.

The plugin architecture ensures extensibility, the configuration system provides user control, and the abstract output interface enables future platform support. The phased implementation approach allows for incremental delivery of value while maintaining system stability.

Key benefits:
- **Immediate UX improvements** through progress feedback and error collection
- **Extensible architecture** supporting community plugins
- **Future-ready design** for web interfaces and advanced features
- **Backward compatibility** ensuring existing scripts continue to work
- **Performance optimization** through streaming and memory management

This design positions mlld to provide an excellent user experience for command execution while maintaining the flexibility needed for future growth and platform expansion.