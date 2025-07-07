import chalk from 'chalk';
import { glob } from 'glob';
import * as path from 'path';
import * as fs from 'fs/promises';
import { interpret, Environment } from '@interpreter/index';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import { getCommandContext } from '@cli/utils/command-context';

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
 * Capture console output during test execution
 */
function captureConsoleOutput(fn: () => Promise<void>): Promise<{ output: string; error?: Error }> {
  return new Promise((resolve) => {
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    const originalStdoutWrite = process.stdout.write;
    const originalStderrWrite = process.stderr.write;
    
    let capturedOutput = '';
    let caughtError: Error | undefined;
    
    // Capture all console outputs
    const capture = (text: string) => {
      capturedOutput += text + '\n';
    };
    
    console.log = (...args) => capture(args.join(' '));
    console.error = (...args) => capture(args.join(' '));
    console.warn = (...args) => capture(args.join(' '));
    
    // Capture stdout/stderr writes
    process.stdout.write = ((text: string) => {
      capturedOutput += text;
      return true;
    }) as any;
    
    process.stderr.write = ((text: string) => {
      capturedOutput += text;
      return true;
    }) as any;
    
    const restore = () => {
      console.log = originalConsoleLog;
      console.error = originalConsoleError;
      console.warn = originalConsoleWarn;
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
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
 * Run a single test file
 */
async function runTestFile(file: string): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    const content = await fs.readFile(file, 'utf-8');
    const fileSystem = new NodeFileSystem();
    const pathService = new PathService();
    
    let capturedEnv: Environment | null = null;
    
    // Capture any console output during test execution
    const { output, error } = await captureConsoleOutput(async () => {
      await interpret(content, {
        fileSystem,
        pathService,
        format: 'markdown',
        basePath: path.dirname(file),
        filePath: file,
        captureEnvironment: (env) => { capturedEnv = env; },
        useMarkdownFormatter: false,
        approveAllImports: true, // Auto-approve imports for tests
        devMode: true // Always run tests in dev mode for flexible path resolution
      });
    });
    
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
 * Main test command handler
 */
export async function testCommand(patterns: string[]) {
  const startTime = Date.now();
  
  try {
    // Get command context
    const context = await getCommandContext();
    
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
    
    // Run tests sequentially and report as they complete
    for (const [dir, files] of byDirectory) {
      // Show directory relative to project root
      const relativeDir = path.relative(context.projectRoot, dir);
      console.log(chalk.dim(relativeDir || '.'));
      console.log(); // Add space after directory name
      
      for (const file of files) {
        const relativePath = path.relative(dir, file);
        const spinner = startTestSpinner(relativePath);
        
        const result = await runTestFile(file);
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