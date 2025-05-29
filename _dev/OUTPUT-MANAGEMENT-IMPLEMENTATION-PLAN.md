# Output Management Implementation Plan

**Issue:** [#85 Enhanced Command Output Management System](https://github.com/mlld-lang/mlld/issues/85)

## Overview

This document provides a step-by-step implementation plan for adding comprehensive output management to mlld with **complete integration** of the error location system. The implementation ensures command execution errors receive the same rich formatting and source context as other mlld errors.

## Implementation Strategy

### Core Principles
1. **Incremental Delivery** - Each step provides immediate value
2. **Backward Compatibility** - Existing scripts continue to work unchanged
3. **Complete Error Integration** - Command errors use the same rich formatting system
4. **Source Context Preservation** - All errors include source location when available
5. **Testable Changes** - Each step can be validated independently

### Development Approach
- Start with error integration and core infrastructure
- Add CLI integration with new options
- Implement output processing with rich error formatting
- Add configuration support
- Comprehensive testing throughout

## Step-by-Step Implementation

### Step 1: Error System Integration
**Files:** `core/errors/MlldCommandExecutionError.ts`, `core/errors/index.ts`
**Estimated Effort:** 2-3 hours

#### 1.1 Create Command Execution Error Class
```typescript
// core/errors/MlldCommandExecutionError.ts
import { MlldError, ErrorSeverity } from './MlldError';
import type { SourceLocation } from '@core/types';

export interface CommandExecutionDetails {
  command: string;
  exitCode: number;
  duration: number;
  stdout?: string;
  stderr?: string;
  workingDirectory: string;
  directiveType?: string;
}

export class MlldCommandExecutionError extends MlldError {
  constructor(
    message: string,
    sourceLocation?: SourceLocation,
    details?: CommandExecutionDetails
  ) {
    super(message, {
      code: 'COMMAND_EXECUTION_FAILED',
      severity: ErrorSeverity.Recoverable, // Commands can fail but mlld continues
      sourceLocation,
      details
    });
  }

  /**
   * Creates a command execution error with enhanced context
   */
  static create(
    command: string,
    exitCode: number,
    duration: number,
    sourceLocation?: SourceLocation,
    additionalContext?: {
      stdout?: string;
      stderr?: string;
      workingDirectory: string;
      directiveType?: string;
    }
  ): MlldCommandExecutionError {
    const message = `Command execution failed: ${command}`;
    
    return new MlldCommandExecutionError(message, sourceLocation, {
      command,
      exitCode,
      duration,
      stdout: additionalContext?.stdout,
      stderr: additionalContext?.stderr,
      workingDirectory: additionalContext?.workingDirectory || process.cwd(),
      directiveType: additionalContext?.directiveType || 'run'
    });
  }
}
```

#### 1.2 Update Error Index
```typescript
// core/errors/index.ts
export { MlldCommandExecutionError } from './MlldCommandExecutionError';
export type { CommandExecutionDetails } from './MlldCommandExecutionError';
// ... existing exports
```

**Testing Step 1:**
```typescript
describe('MlldCommandExecutionError', () => {
  test('creates error with source location', () => {
    const location = { line: 10, column: 5, filePath: '/test/demo.mld' };
    const error = MlldCommandExecutionError.create(
      'npm test', 1, 2000, location, { workingDirectory: '/test' }
    );
    
    expect(error.sourceLocation).toEqual(location);
    expect(error.details.command).toBe('npm test');
    expect(error.details.exitCode).toBe(1);
  });
  
  test('provides helpful context', () => {
    const error = MlldCommandExecutionError.create('npm test', 1, 1000);
    expect(error.message).toContain('Command execution failed');
    expect(error.severity).toBe(ErrorSeverity.Recoverable);
  });
});
```

### Step 2: Enhanced Environment Infrastructure
**Files:** `interpreter/env/Environment.ts`
**Estimated Effort:** 3-4 hours

#### 2.1 Add Command Execution Context and Options
```typescript
// Add to Environment.ts imports
import { MlldCommandExecutionError, type CommandExecutionDetails } from '@core/errors';
import type { SourceLocation, DirectiveNode } from '@core/types';

interface CommandExecutionOptions {
  showProgress?: boolean;
  maxOutputLines?: number;
  errorBehavior?: 'halt' | 'continue';
  timeout?: number;
  collectErrors?: boolean;
}

interface CommandExecutionContext {
  sourceLocation?: SourceLocation;
  directiveNode?: DirectiveNode;
  filePath?: string;
  directiveType?: string;
}

interface CollectedError {
  error: MlldCommandExecutionError; // Changed from generic Error
  command: string;
  timestamp: Date;
  duration: number;
  sourceLocation?: SourceLocation;
  context?: CommandExecutionContext;
}
```

#### 2.2 Update executeCommand Method
```typescript
async executeCommand(
  command: string, 
  options?: CommandExecutionOptions,
  context?: CommandExecutionContext // NEW: Source context for error reporting
): Promise<string> {
  // Merge with instance defaults
  const finalOptions = { ...this.outputOptions, ...options };
  const { showProgress, maxOutputLines, errorBehavior, timeout } = finalOptions;
  
  const startTime = Date.now();
  
  if (showProgress) {
    console.log(`⚡ Running: ${command}`);
  }
  
  try {
    const result = execSync(command, {
      encoding: 'utf8',
      cwd: await this.getProjectPath(),
      env: { ...process.env },
      maxBuffer: 10 * 1024 * 1024, // 10MB limit
      timeout: timeout || 30000
    });
    
    const duration = Date.now() - startTime;
    const { processed } = this.processOutput(result, maxOutputLines);
    
    if (showProgress) {
      console.log(`✅ Completed in ${duration}ms`);
    }
    
    return processed;
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    if (showProgress) {
      console.log(`❌ Failed in ${duration}ms`);
    }
    
    // Create rich MlldCommandExecutionError with source context
    const commandError = MlldCommandExecutionError.create(
      command,
      error.status || error.code || 1,
      duration,
      context?.sourceLocation,
      {
        stdout: error.stdout,
        stderr: error.stderr,
        workingDirectory: await this.getProjectPath(),
        directiveType: context?.directiveType || 'run'
      }
    );
    
    // Collect error if in continue mode or if collectErrors is enabled
    if (errorBehavior === 'continue' || finalOptions.collectErrors) {
      this.collectError(commandError, command, duration, context);
    }
    
    if (errorBehavior === 'halt') {
      throw commandError; // Throw rich error instead of generic error
    }
    
    // Return available output for continue mode
    const output = error.stdout || error.stderr || '';
    const { processed } = this.processOutput(output, maxOutputLines);
    return processed;
  }
}
```

#### 2.3 Add Infrastructure Methods
```typescript
private outputOptions: CommandExecutionOptions = {
  showProgress: true,
  maxOutputLines: 50,
  errorBehavior: 'continue',
  timeout: 30000,
  collectErrors: false
};

private collectedErrors: CollectedError[] = [];

setOutputOptions(options: Partial<CommandExecutionOptions>): void {
  this.outputOptions = { ...this.outputOptions, ...options };
}

private collectError(
  error: MlldCommandExecutionError, 
  command: string, 
  duration: number,
  context?: CommandExecutionContext
): void {
  this.collectedErrors.push({
    error,
    command,
    timestamp: new Date(),
    duration,
    sourceLocation: context?.sourceLocation,
    context
  });
}

getCollectedErrors(): CollectedError[] {
  return this.collectedErrors;
}

clearCollectedErrors(): void {
  this.collectedErrors = [];
}

private processOutput(output: string, maxLines?: number): { 
  processed: string; 
  truncated: boolean; 
  originalLineCount: number 
} {
  if (!maxLines || maxLines <= 0) {
    return { processed: output.trimEnd(), truncated: false, originalLineCount: 0 };
  }
  
  const lines = output.split('\n');
  if (lines.length <= maxLines) {
    return { 
      processed: output.trimEnd(), 
      truncated: false, 
      originalLineCount: lines.length 
    };
  }
  
  const truncated = lines.slice(0, maxLines).join('\n');
  const remaining = lines.length - maxLines;
  return {
    processed: `${truncated}\n... (${remaining} more lines, use --verbose to see all)`,
    truncated: true,
    originalLineCount: lines.length
  };
}
```

#### 2.4 Add Rich Error Display Method
```typescript
async displayCollectedErrors(): Promise<void> {
  const errors = this.getCollectedErrors();
  if (errors.length === 0) return;
  
  console.log(`\n❌ ${errors.length} error${errors.length > 1 ? 's' : ''} occurred:\n`);
  
  // Use ErrorFormatSelector for consistent rich formatting
  const { ErrorFormatSelector } = await import('@core/utils/errorFormatSelector');
  const formatter = new ErrorFormatSelector(this.fileSystem);
  
  for (let i = 0; i < errors.length; i++) {
    const item = errors[i];
    console.log(`${i + 1}. Command execution failed:`);
    
    try {
      // Format using the same rich system as other mlld errors
      const formatted = await formatter.formatForCLI(item.error, {
        useColors: true,
        useSourceContext: true,
        useSmartPaths: true,
        basePath: this.basePath,
        workingDirectory: process.cwd(),
        contextLines: 2
      });
      
      console.log(formatted);
    } catch (formatError) {
      // Fallback to basic display if rich formatting fails
      console.log(`   ├─ Command: ${item.command}`);
      console.log(`   ├─ Duration: ${item.duration}ms`);
      console.log(`   ├─ ${item.error.message}`);
      if (item.error.details?.exitCode !== undefined) {
        console.log(`   ├─ Exit code: ${item.error.details.exitCode}`);
      }
      console.log(`   └─ Use --verbose to see full output\n`);
    }
  }
  
  console.log(`💡 Use --verbose to see full command output`);
  console.log(`💡 Use --help error-handling for error handling options\n`);
}
```

**Testing Step 2:**
```typescript
describe('Enhanced executeCommand with Error Integration', () => {
  test('creates rich errors with source location', async () => {
    const env = new Environment(mockFS, mockPath, '/test');
    const context = {
      sourceLocation: { line: 10, column: 5, filePath: '/test/demo.mld' },
      directiveType: 'run'
    };
    
    env.setOutputOptions({ errorBehavior: 'continue' });
    
    await env.executeCommand('exit 1', undefined, context);
    
    const errors = env.getCollectedErrors();
    expect(errors).toHaveLength(1);
    expect(errors[0].error).toBeInstanceOf(MlldCommandExecutionError);
    expect(errors[0].sourceLocation).toEqual(context.sourceLocation);
  });
  
  test('displays rich error formatting', async () => {
    const consoleSpy = jest.spyOn(console, 'log');
    const env = new Environment(mockFS, mockPath, '/test');
    
    const error = MlldCommandExecutionError.create('npm test', 1, 2000);
    env['collectError'](error, 'npm test', 2000, {});
    
    await env.displayCollectedErrors();
    
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Command execution failed'));
  });
  
  test('truncates long output', async () => {
    const env = new Environment(mockFS, mockPath, '/test');
    env.setOutputOptions({ maxOutputLines: 5 });
    
    const result = await env.executeCommand('seq 1 100');
    
    expect(result).toContain('(95 more lines');
  });
});
```

### Step 3: Run Evaluator Integration
**Files:** `interpreter/eval/run.ts`
**Estimated Effort:** 1 hour

#### 3.1 Pass Source Context to Environment
```typescript
// In interpreter/eval/run.ts
export async function evaluateRun(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  let output = '';
  
  // Create execution context with source information
  const executionContext = {
    sourceLocation: directive.location,
    directiveNode: directive,
    filePath: env.getCurrentFilePath(),
    directiveType: directive.directiveType || 'run'
  };
  
  if (directive.subtype === 'runCommand') {
    const commandNodes = directive.values?.identifier || directive.values?.command;
    if (!commandNodes) {
      throw new Error('Run command directive missing command');
    }
    
    const command = await interpolate(commandNodes, env);
    
    // Pass context for rich error reporting
    output = await env.executeCommand(command, undefined, executionContext);
    
  } else if (directive.subtype === 'runCode') {
    const codeNodes = directive.values?.code;
    if (!codeNodes) {
      throw new Error('Run code directive missing code');
    }
    
    const code = await interpolate(codeNodes, env);
    const language = directive.raw?.lang || directive.meta?.language || 'javascript';
    
    // Code execution also needs context for errors
    output = await env.executeCode(code, language, undefined, executionContext);
    
  } else if (directive.subtype === 'runExec') {
    // ... existing exec handling with context
    const cleanTemplate = cmdDef.commandTemplate.map((seg: any, idx: number) => {
      if (idx === 0 && seg.type === 'Text' && seg.content.startsWith('[')) {
        return { ...seg, content: seg.content.substring(1) };
      }
      return seg;
    });
    
    const command = await interpolate(cleanTemplate, tempEnv);
    
    // Pass context for exec command errors too
    output = await env.executeCommand(command, undefined, executionContext);
  }
  
  // ... rest of function unchanged
}
```

#### 3.2 Update executeCode for Context Support
```typescript
// In Environment.ts, update executeCode method signature
async executeCode(
  code: string, 
  language: string, 
  params?: Record<string, any>,
  context?: CommandExecutionContext // NEW: Add context support
): Promise<string> {
  const startTime = Date.now();
  
  // ... existing implementation
  
  // If code execution fails, create rich error with context
  try {
    // ... existing code execution logic
  } catch (error) {
    if (context?.sourceLocation) {
      const codeError = new MlldCommandExecutionError(
        `Code execution failed: ${language}`,
        context.sourceLocation,
        {
          command: `${language} code execution`,
          exitCode: 1,
          duration: Date.now() - startTime,
          stderr: error.message,
          workingDirectory: await this.getProjectPath(),
          directiveType: context.directiveType || 'run'
        }
      );
      throw codeError;
    }
    throw new Error(`Code execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
```

**Testing Step 3:**
```typescript
describe('Run Evaluator Error Integration', () => {
  test('passes source context to executeCommand', async () => {
    const mockEnv = {
      executeCommand: jest.fn().mockResolvedValue('success')
    } as any;
    
    const directive = {
      subtype: 'runCommand',
      values: { command: [{ type: 'Text', content: 'echo test' }] },
      location: { line: 5, column: 1, filePath: '/test/demo.mld' },
      directiveType: 'run'
    } as DirectiveNode;
    
    await evaluateRun(directive, mockEnv);
    
    expect(mockEnv.executeCommand).toHaveBeenCalledWith(
      'echo test',
      undefined,
      expect.objectContaining({
        sourceLocation: directive.location,
        directiveType: 'run'
      })
    );
  });
});
```

### Step 4: CLI Integration with Rich Error Display
**Files:** `cli/index.ts`
**Estimated Effort:** 2-3 hours

#### 4.1 Extend CLIOptions Interface
```typescript
export interface CLIOptions {
  // ... existing options
  maxOutputLines?: number;
  showProgress?: boolean;
  errorBehavior?: 'halt' | 'continue';
  collectErrors?: boolean;
  progressStyle?: 'emoji' | 'text';
  showCommandContext?: boolean; // NEW: Show source context for command errors
}
```

#### 4.2 Update Argument Parsing
```typescript
// In parseArgs function, add new cases:
case '--max-output-lines':
  options.maxOutputLines = parseInt(args[++i]);
  if (isNaN(options.maxOutputLines) || options.maxOutputLines < 0) {
    throw new Error('--max-output-lines must be a positive number');
  }
  break;
case '--show-progress':
  options.showProgress = true;
  break;
case '--no-progress':
  options.showProgress = false;
  break;
case '--error-behavior':
  const behavior = args[++i];
  if (behavior !== 'halt' && behavior !== 'continue') {
    throw new Error('--error-behavior must be "halt" or "continue"');
  }
  options.errorBehavior = behavior;
  break;
case '--collect-errors':
  options.collectErrors = true;
  break;
case '--show-command-context':
  options.showCommandContext = true;
  break;
```

#### 4.3 Enhanced Error Handling
```typescript
// Update handleError function to handle command execution errors
async function handleError(error: any, options: CLIOptions): Promise<void> {
  const isMlldError = error instanceof MlldError;
  const isCommandError = error instanceof MlldCommandExecutionError;
  const severity = isMlldError ? error.severity : ErrorSeverity.Fatal;

  logger.level = options.debug ? 'debug' : (options.verbose ? 'info' : 'warn');

  if (isMlldError) {
    const fileSystem = new NodeFileSystem();
    const errorFormatter = new ErrorFormatSelector(fileSystem);
    
    try {
      let result: string;
      
      if (isCommandError && options.showCommandContext) {
        // Enhanced formatting for command errors with full context
        result = await errorFormatter.formatForCLI(error, {
          useColors: true,
          useSourceContext: true,
          useSmartPaths: true,
          basePath: path.resolve(path.dirname(options.input)),
          workingDirectory: process.cwd(),
          contextLines: 3 // More context for command errors
        });
      } else {
        // Standard formatting
        result = await errorFormatter.formatForCLI(error, {
          useColors: true,
          useSourceContext: true,
          useSmartPaths: true,
          basePath: path.resolve(path.dirname(options.input)),
          workingDirectory: process.cwd(),
          contextLines: 2
        });
      }
      
      console.error('\n' + result + '\n');
    } catch (formatError) {
      // Fallback formatting
      const fallbackFormatter = new ErrorFormatSelector();
      const result = fallbackFormatter.formatForAPI(error);
      console.error('\n' + result.formatted + '\n');
    }
  } else if (error instanceof Error) {
    // ... existing error handling for non-mlld errors
  }

  if (severity === ErrorSeverity.Fatal) {
    process.exit(1);
  }
}
```

#### 4.4 Update Help Text
```typescript
function displayHelp() {
  console.log(`
Usage: mlld [options] <input-file>

Options:
  // ... existing options
  --max-output-lines <n>      Limit command output to n lines [default: 50]
  --show-progress             Show command execution progress [default: true]
  --no-progress               Disable progress display
  --error-behavior <mode>     How to handle command failures: halt, continue [default: continue]
  --collect-errors            Collect errors and display summary at end
  --show-command-context      Show source context for command execution errors
  --progress-style <style>    Progress display style: emoji, text [default: emoji]
  `);
}
```

**Testing Step 4:**
```typescript
describe('CLI Integration with Rich Errors', () => {
  test('parses all output management options', () => {
    const args = [
      '--max-output-lines', '25', 
      '--no-progress', 
      '--error-behavior', 'halt',
      '--show-command-context',
      'test.mld'
    ];
    const options = parseArgs(args);
    
    expect(options.maxOutputLines).toBe(25);
    expect(options.showProgress).toBe(false);
    expect(options.errorBehavior).toBe('halt');
    expect(options.showCommandContext).toBe(true);
  });
  
  test('handles command execution errors with rich formatting', async () => {
    const commandError = MlldCommandExecutionError.create(
      'npm test', 1, 2000,
      { line: 10, column: 5, filePath: '/test/demo.mld' }
    );
    
    const consoleSpy = jest.spyOn(console, 'error');
    await handleError(commandError, { 
      input: '/test/demo.mld',
      showCommandContext: true 
    } as CLIOptions);
    
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Command execution failed'));
  });
});
```

### Step 5: Interpreter Integration
**Files:** `interpreter/index.ts`
**Estimated Effort:** 1-2 hours

#### 5.1 Update InterpretOptions
```typescript
export interface InterpretOptions {
  basePath?: string;
  filePath?: string;
  strict?: boolean;
  format?: 'markdown' | 'xml';
  fileSystem: IFileSystemService;
  pathService: IPathService;
  urlConfig?: ResolvedURLConfig;
  outputOptions?: CommandExecutionOptions & {
    showCommandContext?: boolean; // NEW: Enhanced command error context
  };
}
```

#### 5.2 Pass Options to Environment
```typescript
// In interpret function:
const env = new Environment(
  options.fileSystem,
  options.pathService,
  options.basePath || process.cwd()
);

// Set output options if provided
if (options.outputOptions) {
  env.setOutputOptions(options.outputOptions);
}

// Set current file path for error context
if (options.filePath) {
  env.setCurrentFilePath(options.filePath);
}

// Configure URL settings if provided
if (options.urlConfig) {
  env.setURLConfig(options.urlConfig);
}

// Evaluate the AST
await evaluate(ast, env);

// Display collected errors with rich formatting if enabled
if (options.outputOptions?.collectErrors) {
  await env.displayCollectedErrors();
}

// Get the final nodes from environment
const nodes = env.getNodes();

return await formatOutput(nodes, {
  format: options.format || 'markdown',
  variables: env.getAllVariables()
});
```

**Testing Step 5:**
```typescript
describe('Interpreter Integration with Rich Errors', () => {
  test('passes enhanced output options to environment', async () => {
    const mockEnv = jest.spyOn(Environment.prototype, 'setOutputOptions');
    
    await interpret('test content', {
      fileSystem: mockFS,
      pathService: mockPath,
      outputOptions: { 
        showProgress: false,
        showCommandContext: true,
        collectErrors: true
      }
    });
    
    expect(mockEnv).toHaveBeenCalledWith(expect.objectContaining({
      showCommandContext: true,
      collectErrors: true
    }));
  });
  
  test('displays collected errors with rich formatting', async () => {
    const consoleSpy = jest.spyOn(console, 'log');
    
    const content = `
@run [exit 1]
@run [echo "continuing"]
    `;
    
    await interpret(content, {
      fileSystem: mockFS,
      pathService: mockPath,
      outputOptions: {
        errorBehavior: 'continue',
        collectErrors: true
      }
    });
    
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('error'));
  });
});
```

### Step 6: Configuration Support with Error Integration
**Files:** `core/config/types.ts`, `core/config/loader.ts`
**Estimated Effort:** 2 hours

#### 6.1 Add Enhanced Output Configuration Types
```typescript
// In core/config/types.ts
export interface OutputConfiguration {
  showProgress?: boolean;
  maxOutputLines?: number;
  errorBehavior?: 'halt' | 'continue';
  collectErrors?: boolean;
  progressStyle?: 'emoji' | 'text';
  preserveFullOutput?: boolean;
  logOutputToFile?: boolean;
  showCommandContext?: boolean; // NEW: Rich command error context
  errorFormatting?: {
    useColors?: boolean;
    useSourceContext?: boolean;
    contextLines?: number;
    showCommandDetails?: boolean;
  };
}

export interface MlldConfiguration {
  // ... existing config
  output?: OutputConfiguration;
}
```

#### 6.2 Update Configuration Loader
```typescript
// In core/config/loader.ts
resolveOutputConfig(config: MlldConfiguration): OutputConfiguration {
  return {
    showProgress: config.output?.showProgress ?? true,
    maxOutputLines: config.output?.maxOutputLines ?? 50,
    errorBehavior: config.output?.errorBehavior ?? 'continue',
    collectErrors: config.output?.collectErrors ?? false,
    progressStyle: config.output?.progressStyle ?? 'emoji',
    preserveFullOutput: config.output?.preserveFullOutput ?? false,
    logOutputToFile: config.output?.logOutputToFile ?? false,
    showCommandContext: config.output?.showCommandContext ?? true,
    errorFormatting: {
      useColors: config.output?.errorFormatting?.useColors ?? true,
      useSourceContext: config.output?.errorFormatting?.useSourceContext ?? true,
      contextLines: config.output?.errorFormatting?.contextLines ?? 2,
      showCommandDetails: config.output?.errorFormatting?.showCommandDetails ?? true
    }
  };
}
```

#### 6.3 Integration Example Configuration
```json
// Example mlld.config.json
{
  "output": {
    "showProgress": true,
    "maxOutputLines": 30,
    "errorBehavior": "continue",
    "collectErrors": true,
    "showCommandContext": true,
    "errorFormatting": {
      "useColors": true,
      "useSourceContext": true,
      "contextLines": 3,
      "showCommandDetails": true
    }
  }
}
```

**Testing Step 6:**
```typescript
describe('Configuration Integration with Rich Errors', () => {
  test('loads enhanced output configuration', () => {
    const config = {
      output: {
        showProgress: false,
        maxOutputLines: 100,
        errorBehavior: 'halt' as const,
        showCommandContext: true,
        errorFormatting: {
          contextLines: 5,
          showCommandDetails: true
        }
      }
    };
    
    const loader = new ConfigLoader('/test');
    const resolved = loader.resolveOutputConfig(config);
    
    expect(resolved.showCommandContext).toBe(true);
    expect(resolved.errorFormatting.contextLines).toBe(5);
    expect(resolved.errorFormatting.showCommandDetails).toBe(true);
  });
});
```

### Step 7: End-to-End Integration & Testing
**Files:** Multiple
**Estimated Effort:** 3-4 hours

#### 7.1 Complete Integration Test
```typescript
// Integration test showing complete error location integration
describe('Complete Error Location Integration', () => {
  test('command execution errors show rich source context', async () => {
    const testFile = `
@text greeting = "Hello"
@run [echo "Starting process"]
@run [npm test]
@run [echo "Final step"]
    `;
    
    const result = await interpret(testFile, {
      fileSystem: mockFS,
      pathService: mockPath,
      filePath: '/test/demo.mld',
      outputOptions: {
        showProgress: true,
        maxOutputLines: 10,
        errorBehavior: 'continue',
        collectErrors: true,
        showCommandContext: true
      }
    });
    
    // Verify that command errors include:
    // 1. Source location (line 4, npm test command)
    // 2. Rich formatting with source context
    // 3. Actionable suggestions
    // 4. Command execution details
  });
  
  test('CLI end-to-end with rich command errors', async () => {
    // Create test file with failing command
    const testContent = '@run [exit 1]\\n@run [echo "continuing"]';
    await fs.writeFile('/tmp/test-rich-errors.mld', testContent);
    
    // Run CLI with enhanced error options
    const result = await main([
      '--error-behavior', 'continue',
      '--collect-errors',
      '--show-command-context',
      '/tmp/test-rich-errors.mld'
    ]);
    
    // Verify rich error output appears at end
    // Verify source context is shown
    // Verify execution continues after error
  });
});
```

## Testing Strategy

### Unit Tests
Each step should have comprehensive unit tests covering:
- Happy path functionality
- Error conditions with rich formatting
- Edge cases (empty output, very long output, timeouts)
- Source context preservation
- Option validation
- Configuration parsing

### Integration Tests
Test combinations of features:
- CLI options + configuration file with error integration
- Multiple commands with different behaviors and rich errors
- Error collection across command failures with source context
- Progress display in different scenarios

### Manual Testing Scenarios

#### Scenario 1: Rich Command Error Display
```bash
# Create test file
echo -e '@text greeting = "Hello"\n@run [npm test]\n@text final = "done"' > test.mld

# Run with enhanced error display
mlld test.mld --show-command-context --collect-errors

# Expected output with source context:
# ❌ 1 error occurred:
# 
# 1. Command execution failed: npm test
#
#   ./test.mld:2:1
#   1 | @text greeting = "Hello"
#   2 | @run [npm test]
#       |      ^^^^^^^^ command failed here
#   3 | @text final = "done"
#
# Details:
#   command: npm test
#   exitCode: 1
#   duration: 2.1s
#   workingDirectory: /current/path
#
# 💡 Run with --verbose to see test details, or use npm test -- --verbose for more output
```

#### Scenario 2: Multiple Command Errors
```bash
echo -e '@run [exit 1]\n@run [npm test]\n@run [git status]' > multi-errors.mld
mlld multi-errors.mld --error-behavior continue --show-command-context --collect-errors
```

#### Scenario 3: Configuration File Integration
```bash
echo '{"output": {"showCommandContext": true, "collectErrors": true, "errorFormatting": {"contextLines": 5}}}' > mlld.config.json
echo '@run [exit 1]' > test.mld
mlld test.mld
```

## Documentation Updates

### Help Text Updates
- Document `--show-command-context` option
- Add examples of rich error display
- Document error formatting configuration

### README Updates
```markdown
## Enhanced Error Reporting

mlld provides rich error reporting for both syntax errors and command execution failures:

### Command Execution Errors

When commands fail, mlld shows the exact source location with context:

```bash
$ mlld demo.mld --show-command-context
❌ Command execution failed: npm test

  ./demo.mld:23:1
  22 | @text user = "Alice"
  23 | @run [npm test]
      |      ^^^^^^^^ command failed here
  24 | @text final = "done"

Details:
  exitCode: 1
  duration: 2.1s
💡 Run with --verbose to see test details
```

### Error Collection

Collect all errors and display them at the end:

```bash
mlld demo.mld --collect-errors --error-behavior continue
```
```

## Rollout Plan

### Phase 1: Error Integration & Core Implementation (Days 1-2)
- Steps 1-2: Error system integration and enhanced Environment
- Basic testing and validation

### Phase 2: Source Context Integration (Day 3)
- Step 3: Run evaluator integration with source context
- Manual testing of rich error display

### Phase 3: CLI & Interpreter Integration (Days 4-5)
- Steps 4-5: CLI options and interpreter integration
- Comprehensive testing

### Phase 4: Configuration & Polish (Days 6-7)
- Steps 6-7: Configuration support and end-to-end testing
- Documentation updates
- Final integration testing

## Success Criteria

### Complete Error Integration
- [ ] Command execution errors use MlldCommandExecutionError class
- [ ] All command errors include source location when available
- [ ] Rich formatting matches other mlld error displays
- [ ] Error collection preserves source context
- [ ] CLI displays enhanced command error context

### Functionality
- [ ] Commands show progress by default
- [ ] Output can be truncated with clear indicators
- [ ] Errors show source context and actionable suggestions
- [ ] CLI options work as specified with error integration
- [ ] Configuration file supports enhanced error settings
- [ ] Backward compatibility maintained

### Quality
- [ ] All unit tests pass
- [ ] Integration tests cover key scenarios with rich errors
- [ ] Manual testing scenarios validate UX
- [ ] Performance is not significantly impacted
- [ ] Code follows existing patterns and conventions

### Documentation
- [ ] Help text accurately reflects new options
- [ ] README has examples of enhanced error functionality
- [ ] Configuration options are documented
- [ ] Migration guide exists for any breaking changes

## Risk Mitigation

### Breaking Changes
- All new functionality is opt-in or has sensible defaults
- Existing scripts continue to work unchanged
- Configuration is additive only

### Performance Impact
- Progress display adds minimal overhead
- Output processing is efficient
- Memory usage is controlled through truncation
- Rich error formatting only occurs when errors happen

### User Experience
- Defaults provide immediate value with enhanced errors
- Options are intuitive and well-documented
- Error messages are actionable and informative
- Source context helps users identify exact problem locations

## Post-Implementation

### Monitoring
- Watch for user feedback on enhanced error display
- Monitor performance impact in real usage
- Track adoption of new CLI options and error features

### Future Enhancements
This implementation provides the foundation for:
- Plugin system for command-specific error handling
- Streaming output for real-time display
- Advanced progress indicators
- Web interface support with rich error display

### Maintenance
- Regular testing with new mlld examples
- Updates as new CLI options are added
- Performance optimization based on usage patterns
- Continuous improvement of error suggestions and context

This revised implementation plan ensures command execution errors receive the same level of rich, contextual display as other mlld errors, providing users with an excellent debugging experience throughout the entire system.