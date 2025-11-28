import chalk from 'chalk';
import { glob } from 'glob';
import * as path from 'path';
import * as fs from 'fs/promises';
import { interpret, Environment } from '@interpreter/index';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import { getCommandContext } from '@cli/utils/command-context';
import { EnvLoader } from '@cli/utils/env-loader';
import { spawn } from 'child_process';

interface TestResult {
  file: string;
  tests: Record<string, boolean>;
  duration: number;
  error?: string;
}

interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  errors: number;
  parseErrors: TestResult[];
  successfulFiles: number;
}

/**
 * Generate a unique namespace for a test file
 */
function generateTestNamespace(filePath: string): string {
  const fileName = path.basename(filePath, '.test.mld');
  const timestamp = Date.now().toString(36);
  return `${fileName}_${timestamp}`;
}

/**
 * Namespace shadow environment declarations to prevent contamination between tests
 * This function modifies shadow environment setup lines like "/exe js = { func1, func2 }"
 * to use namespaced function names, preventing conflicts between tests
 */
function namespaceShadowEnvironments(content: string, namespace: string): string {
  let modifiedContent = content;
  
  // Pattern 1: /exe js = { function_names }
  const shadowEnvPattern = /\/exe\s+js\s*=\s*\{\s*([^}]+)\s*\}/g;
  
  modifiedContent = modifiedContent.replace(shadowEnvPattern, (match, functionList) => {
    console.log(`ENV DEBUG: Found shadow env declaration: ${match}`);
    
    // Parse the function list and add namespace prefixes
    const functions = functionList.split(',').map((fn: string) => {
      const trimmed = fn.trim();
      if (trimmed) {
        const namespacedFn = `${namespace}_${trimmed}`;
        console.log(`ENV DEBUG: Namespacing ${trimmed} -> ${namespacedFn}`);
        return namespacedFn;
      }
      return trimmed;
    });
    
    const namespacedMatch = `/exe js = { ${functions.join(', ')} }`;
    console.log(`ENV DEBUG: Replaced shadow env: ${namespacedMatch}`);
    return namespacedMatch;
  });
  
  // Pattern 2: /exe @functionName(...) = js { ... }
  const functionDefPattern = /\/exe\s+@(\w+)\s*\([^)]*\)\s*=\s*js\s*\{/g;
  
  modifiedContent = modifiedContent.replace(functionDefPattern, (match, functionName) => {
    const namespacedFn = `${namespace}_${functionName}`;
    console.log(`ENV DEBUG: Namespacing function definition ${functionName} -> ${namespacedFn}`);
    return match.replace(`@${functionName}`, `@${namespacedFn}`);
  });
  
  // Pattern 3: Function references in function bodies and variable assignments
  const functionCallPattern = /\b(\w+_request|authGet|authPost|pr_view|pr_files|github_request)\b/g;
  
  modifiedContent = modifiedContent.replace(functionCallPattern, (match, functionName) => {
    // Only namespace known shadow environment functions
    const shadowFunctions = [
      'github_request', 'pr_view', 'pr_files', 'pr_diff', 'pr_list', 'pr_comment', 'pr_review', 'pr_edit',
      'issue_create', 'issue_list', 'issue_comment',
      'repo_view', 'repo_clone',
      'collab_check',
      'workflow_run', 'workflow_list',
      'authGet', 'authPost', 'authPut', 'authPatch', 'authDelete',
      'fetchGet', 'fetchPost', 'fetchPut', 'fetchPatch', 'fetchDelete',
      'customRequest'
    ];
    
    if (shadowFunctions.includes(functionName)) {
      const namespacedFn = `${namespace}_${functionName}`;
      console.log(`ENV DEBUG: Namespacing function call ${functionName} -> ${namespacedFn}`);
      return namespacedFn;
    }
    
    return match;
  });
  
  // Pattern 4: Function references in test variable assignments like @ok(@isExecutable(@github.pr.view))
  const testFunctionCallPattern = /@(\w+)\(/g;
  
  modifiedContent = modifiedContent.replace(testFunctionCallPattern, (match, functionName) => {
    // Check if this function was defined in this test file and needs namespacing
    const originalPattern = new RegExp(`/exe\\s+@${functionName}\\s*\\([^)]*\\)\\s*=\\s*js\\s*\\{`);
    if (originalPattern.test(content)) {
      const namespacedFn = `${namespace}_${functionName}`;
      console.log(`ENV DEBUG: Namespacing test function call @${functionName} -> @${namespacedFn}`);
      return `@${namespacedFn}(`;
    }
    
    return match;
  });
  
  return modifiedContent;
}

/**
 * Extract test results from captured environment
 */
function extractTestResults(env: Environment): Record<string, boolean> {
  const tests: Record<string, boolean> = {};
  const variables = env.getAllVariables();
  
  for (const [name, value] of variables) {
    if (name.startsWith('test_')) {
      // Handle boolean values returned by test helpers
      if (typeof value === 'boolean') {
        tests[name] = value;
      } else if (typeof value === 'string') {
        // Legacy string handling
        tests[name] = value === 'true';
      } else if (value === null || value === undefined) {
        tests[name] = false;
      } else {
        // Objects, arrays, numbers are truthy
        tests[name] = true;
      }
    }
  }
  
  return tests;
}

/**
 * Capture console output during test execution (without interfering with HTTP)
 */
function captureConsoleOutput(fn: () => Promise<void>): Promise<{ output: string; error?: Error }> {
  return new Promise((resolve) => {
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    
    let capturedOutput = '';
    let caughtError: Error | undefined;
    
    // Capture all console outputs
    const capture = (text: string) => {
      capturedOutput += text + '\n';
    };
    
    console.log = (...args) => capture(args.join(' '));
    console.error = (...args) => capture(args.join(' '));
    console.warn = (...args) => capture(args.join(' '));
    
    // DON'T capture process.stdout/stderr.write as it interferes with HTTP requests
    
    const restore = () => {
      console.log = originalConsoleLog;
      console.error = originalConsoleError;
      console.warn = originalConsoleWarn;
    };
    
    fn()
      .then(() => {
        restore();
        resolve({ output: capturedOutput.trim() });
      })
      .catch((error) => {
        restore();
        resolve({ output: capturedOutput.trim(), error });
      });
  });
}

/**
 * Run a single test file in a separate process for better isolation
 */
async function runTestFileInProcess(file: string): Promise<TestResult> {
  const startTime = Date.now();
  
  return new Promise((resolve) => {
    // Find the mlld executable - use mlld-shadow-import since that's our working version
    const mlldCommand = 'mlld-shadow-import';
    
    
    // Add a special env var to prevent infinite recursion
    const childEnv = { ...process.env, MLLD_TEST_SINGLE_FILE: 'true' };
    
    const child = spawn(mlldCommand, ['test', file], {
      cwd: process.cwd(),
      env: childEnv,
      stdio: ['inherit', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      const duration = Date.now() - startTime;
      
      // Parse the output to extract test results
      const tests: Record<string, boolean> = {};
      const lines = stdout.split('\n');
      
      for (const line of lines) {
        // Look for test result lines like "✓ test name" or "✗ test name"
        const passMatch = line.match(/^\s*✓\s+(.+)$/);
        const failMatch = line.match(/^\s*✗\s+(.+)$/);
        
        if (passMatch) {
          const testName = 'test_' + passMatch[1].trim().replace(/\s+/g, '_');
          tests[testName] = true;
        } else if (failMatch) {
          const testName = 'test_' + failMatch[1].trim().replace(/\s+/g, '_');
          tests[testName] = false;
        }
      }
      
      if (code !== 0) {
        // Non-zero exit code indicates actual test failure
        resolve({
          file,
          tests,
          duration,
          error: stderr || `Test process exited with code ${code}`
        });
      } else {
        // Exit code 0 means tests passed, even if there was stderr output
        // Some tests legitimately write to stderr (like env.require testing missing vars)
        resolve({
          file,
          tests,
          duration
        });
      }
    });
  });
}

/**
 * Run a single test file in the current process
 */
async function runTestFile(file: string): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    const originalContent = await fs.readFile(file, 'utf-8');
    
    // Use original content - process isolation provides sufficient separation
    const content = originalContent;
    
    const fileSystem = new NodeFileSystem();
    const pathService = new PathService();
    let capturedEnv: Environment | null = null;

    // Remove console capture entirely to test if that's causing contamination
    let output = '';
    let error: Error | undefined;

    try {
      await interpret(content, {
        fileSystem,
        pathService,
        format: 'markdown',
        basePath: path.resolve(path.dirname(file)), 
        filePath: path.resolve(file),
        captureEnvironment: (env) => { capturedEnv = env; },
        useMarkdownFormatter: false,
        approveAllImports: true,
        strict: false,
        normalizeBlankLines: true,
        outputOptions: {
          showProgress: false,
          maxOutputLines: undefined,
          errorBehavior: 'halt',
          collectErrors: false,
          showCommandContext: false,
          timeout: undefined
        }
      });
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err));
    } finally {
      // Clean up shadow environment between tests
      if (capturedEnv && 'cleanup' in capturedEnv) {
        try {
          (capturedEnv as any).cleanup();
        } catch (cleanupError) {
          console.error(`Cleanup error for ${file}:`, cleanupError);
        }
      }
    }
    
    // If there was an error during execution, include the captured output
    if (error) {
      const duration = Date.now() - startTime;
      let errorMessage = error.message;
      if (output) {
        errorMessage += '\n\nCaptured output:\n' + output;
      }
      return {
        file,
        tests: {},
        duration,
        error: errorMessage
      };
    }
    
    if (!capturedEnv) {
      throw new Error('Failed to capture environment from test execution');
    }
    
    const tests = extractTestResults(capturedEnv);
    const duration = Date.now() - startTime;
    
    return { file, tests, duration };
  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      file,
      tests: {},
      duration,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Discover test files based on patterns
 */
async function discoverTests(patterns: string[], context: ReturnType<typeof getCommandContext> extends Promise<infer T> ? T : never): Promise<string[]> {
  const defaultPattern = '**/*.test.mld';
  const ignorePatterns = ['node_modules/**', '.mlld-cache/**', 'mlld/tests/tmp/**'];
  
  // Always search from project root for consistency
  const globOptions = { 
    cwd: context.projectRoot,
    ignore: ignorePatterns,
    absolute: true
  };
  
  if (patterns.length === 0) {
    // No patterns provided, use default
    return glob(defaultPattern, globOptions);
  }
  
  // Convert patterns to test file patterns
  const testPatterns: string[] = [];
  for (const pattern of patterns) {
    if (pattern.endsWith('.test.mld')) {
      // Already a test file pattern
      testPatterns.push(pattern);
    } else if (pattern.includes('*')) {
      // Already a glob pattern
      testPatterns.push(pattern);
    } else {
      // Add wildcards to match test files
      testPatterns.push(`**/*${pattern}*.test.mld`);
    }
  }
  
  // Run glob for each pattern and combine results
  const allFiles = new Set<string>();
  for (const pattern of testPatterns) {
    const files = await glob(pattern, globOptions);
    files.forEach(f => allFiles.add(f));
  }
  
  return Array.from(allFiles).sort();
}

/**
 * Format test name for display
 */
function formatTestName(name: string): string {
  // Remove test_ prefix and convert underscores to spaces
  return name.replace(/^test_/, '').replace(/_/g, ' ');
}

/**
 * Simple static dots indicator for individual tests
 */
class InlineSpinner {
  private filename: string;

  constructor(filename: string) {
    this.filename = filename;
  }

  start() {
    process.stdout.write(`  ${this.filename}...`);
  }

  stop(finalLine: string) {
    // Clear the line and write the final result
    process.stdout.write(`\r${finalLine}\n`);
  }
}

/**
 * Show spinner for a test that's about to run
 */
function startTestSpinner(relativePath: string): InlineSpinner {
  const spinner = new InlineSpinner(relativePath);
  spinner.start();
  return spinner;
}

/**
 * Complete a test and show the final result
 */
function completeTestResult(spinner: InlineSpinner, result: TestResult, summary: TestSummary): void {
  const dir = path.dirname(result.file);
  const relativePath = path.relative(dir, result.file);
  
  if (result.error) {
    // Test file had an error - collect for summary but show minimal info here
    spinner.stop(`  ${chalk.red('✗')} ${relativePath}`);
    console.log(); // Add blank line after error
    summary.errors++;
    summary.parseErrors.push(result);
  } else {
    summary.successfulFiles++;
    // Report individual test results
    const testNames = Object.keys(result.tests).sort();
    const allPassed = testNames.every(name => result.tests[name]);
    
    let finalLine: string;
    if (testNames.length === 0) {
      // File ran but no tests were found
      finalLine = `  ${chalk.yellow('○')} ${relativePath} ${chalk.dim(`(${result.duration}ms) - no tests found`)}`;
    } else if (allPassed) {
      finalLine = `  ${chalk.green('✓')} ${relativePath} ${chalk.dim(`(${result.duration}ms)`)}`;
    } else {
      finalLine = `  ${chalk.red('✗')} ${relativePath} ${chalk.dim(`(${result.duration}ms)`)}`;
    }
    
    spinner.stop(finalLine);
    
    // Show individual test results
    for (const testName of testNames) {
      const passed = result.tests[testName];
      summary.total++;
      
      if (passed) {
        console.log(`    ${chalk.green('✓')} ${chalk.dim(formatTestName(testName))}`);
        summary.passed++;
      } else {
        console.log(`    ${chalk.red('✗')} ${formatTestName(testName)}`);
        summary.failed++;
      }
    }
    
    console.log(); // Empty line after each test file
  }
}

/**
 * Display test summary
 */
function displaySummary(summary: TestSummary, duration: number, totalFiles: number) {
  const { total, passed, failed, errors, successfulFiles } = summary;
  
  console.log('_'.repeat(50));
  console.log();
  
  // Show detailed errors if any
  if (errors > 0) {
    const errorWord = errors === 1 ? 'error' : 'errors';
    console.log(`${errors} ${errorWord}:\n`);
    
    for (let i = 0; i < summary.parseErrors.length; i++) {
      const result = summary.parseErrors[i];
      const fileName = path.basename(result.file);
      
      // Split error message to separate main error from captured output
      const errorParts = result.error?.split('\n\nCaptured output:\n') || ['Unknown error'];
      const mainError = errorParts[0];
      const capturedOutput = errorParts[1];
      
      console.log(`${i + 1}. ${chalk.red(fileName)} - ${chalk.red('Error:')} ${mainError}`);
      
      // If there's captured output, show it in a dimmed format
      if (capturedOutput) {
        console.log(chalk.dim('   Captured output:'));
        const outputLines = capturedOutput.split('\n');
        outputLines.forEach(line => {
          if (line.trim()) {
            console.log(chalk.dim(`   ${line}`));
          }
        });
      }
      
      console.log();
    }
  }
  
  console.log('_'.repeat(50));
  console.log();
  
  // Calculate failed files (files with failed tests, not parse errors)
  const failedFiles = totalFiles - successfulFiles - errors;
  
  // Format counts with proper alignment
  const fileStats = [];
  if (successfulFiles > 0) {
    fileStats.push(chalk.green(`${successfulFiles} passed`));
  }
  if (failedFiles > 0) {
    fileStats.push(chalk.red(`${failedFiles} failed`));
  }
  if (errors > 0) {
    fileStats.push(chalk.red(`${errors} errored`));
  }
  
  const testStats = [];
  if (passed > 0) {
    testStats.push(chalk.green(`${passed} passed`));
  }
  if (failed > 0) {
    testStats.push(chalk.red(`${failed} failed`));
  }
  
  // Display formatted summary with proper right alignment
  console.log(`${chalk.dim('Test Files'.padStart(10))}   ${fileStats.join('  |  ')}`);
  if (total > 0) {
    console.log(`${chalk.dim('Tests'.padStart(10))}   ${testStats.join('  |  ')}`);
  }
  
  const time = duration > 1000 ? `${(duration / 1000).toFixed(2)}s` : `${duration}ms`;
  console.log(`${chalk.dim('Time'.padStart(10))}   ${time}`);
  
  console.log('_'.repeat(50));
  
  if (failed > 0 || errors > 0) {
    process.exitCode = 1;
  }
}


/**
 * Parse test command arguments to extract patterns and flags
 */
function parseTestArgs(args: string[]): { patterns: string[]; envFile?: string; isolate?: boolean } {
  const patterns: string[] = [];
  let envFile: string | undefined;
  let isolate = false;
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--env' && i + 1 < args.length) {
      envFile = args[++i];
    } else if (arg === '--isolate') {
      isolate = true;
    } else if (!arg.startsWith('-')) {
      patterns.push(arg);
    }
  }
  
  return { patterns, envFile, isolate };
}

/**
 * Main test command handler
 */
export async function testCommand(args: string[]) {
  const startTime = Date.now();
  
  try {
    // Parse command arguments
    const { patterns, envFile, isolate } = parseTestArgs(args);
    
    // Get command context
    const context = await getCommandContext();
    
    // Load environment variables
    if (envFile) {
      // Load specific env file if provided
      EnvLoader.loadEnvFile(path.resolve(envFile));
    } else {
      // Auto-load .env and .env.test files from current working directory
      EnvLoader.autoLoadEnvFiles(process.cwd());
    }
    
    // Discover test files from project root
    const testFiles = await discoverTests(patterns, context);
    
    if (testFiles.length === 0) {
      console.log(chalk.yellow('No test files found'));
      if (patterns.length > 0) {
        console.log(chalk.dim(`Patterns: ${patterns.join(', ')}`));
      }
      console.log(chalk.dim(`Searched from: ${context.projectRoot}`));
      return;
    }
    
    // Initialize summary
    const summary: TestSummary = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      errors: 0,
      parseErrors: [],
      successfulFiles: 0
    };
    
    // Group test files by directory for display
    const byDirectory = new Map<string, string[]>();
    for (const file of testFiles) {
      const dir = path.dirname(file);
      if (!byDirectory.has(dir)) {
        byDirectory.set(dir, []);
      }
      byDirectory.get(dir)!.push(file);
    }
    
    console.log('Running tests...\n');
    
    // Determine if we need process isolation
    // If running multiple test files, use isolation to prevent shadow env contamination
    // But don't use isolation if we're already in a subprocess (to prevent infinite recursion)
    const useIsolation = testFiles.length > 1 && !process.env.MLLD_TEST_SINGLE_FILE;
    
    if (useIsolation) {
      console.log(chalk.dim('Running tests in isolated processes for better environment separation\n'));
    }
    
    // Run tests sequentially and report as they complete
    for (const [dir, files] of byDirectory) {
      // Show directory relative to project root
      const relativeDir = path.relative(context.projectRoot, dir);
      console.log(chalk.dim(relativeDir || '.'));
      console.log(); // Add space after directory name
      
      for (const file of files) {
        const relativePath = path.relative(dir, file);
        const spinner = startTestSpinner(relativePath);
        
        const result = useIsolation ? 
          await runTestFileInProcess(file) : 
          await runTestFile(file);
        completeTestResult(spinner, result, summary);
      }
    }
    
    // Display summary
    const duration = Date.now() - startTime;
    displaySummary(summary, duration, testFiles.length);
    
    // Workaround for Prettier hanging issue (see docs/dev/PRETTIER-HANGING-ISSUE.md)
    // Force exit after a brief delay to ensure all output is flushed
    setTimeout(() => {
      process.exit(summary.failed > 0 || summary.errors > 0 ? 1 : 0);
    }, 100);
    
  } catch (error) {
    console.error(chalk.red('Error running tests:'), error);
    process.exitCode = 1;
    // Force exit on error as well
    setTimeout(() => process.exit(1), 100);
  }
}
