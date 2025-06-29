import chalk from 'chalk';
import { glob } from 'glob';
import * as path from 'path';
import * as fs from 'fs/promises';
import { interpret, Environment } from '@interpreter/index';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';

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
 * Run a single test file
 */
async function runTestFile(file: string): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    const content = await fs.readFile(file, 'utf-8');
    const fileSystem = new NodeFileSystem();
    const pathService = new PathService();
    
    let capturedEnv: Environment | null = null;
    
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
async function discoverTests(patterns: string[]): Promise<string[]> {
  const defaultPattern = '**/*.test.mld';
  const ignorePatterns = ['node_modules/**', '.mlld-cache/**', 'mlld/tests/tmp/**'];
  
  if (patterns.length === 0) {
    // No patterns provided, use default
    return glob(defaultPattern, { ignore: ignorePatterns });
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
    const files = await glob(pattern, { ignore: ignorePatterns });
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
 * Report test results with colors
 */
function reportResults(results: TestResult[]): TestSummary {
  const summary: TestSummary = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    errors: 0,
    parseErrors: [],
    successfulFiles: 0
  };
  
  // Group results by directory
  const byDirectory = new Map<string, TestResult[]>();
  for (const result of results) {
    const dir = path.dirname(result.file);
    if (!byDirectory.has(dir)) {
      byDirectory.set(dir, []);
    }
    byDirectory.get(dir)!.push(result);
  }
  
  console.log('\nRunning tests...\n');
  
  // Report results by directory
  for (const [dir, dirResults] of byDirectory) {
    console.log(chalk.dim(dir));
    
    for (const result of dirResults) {
      const relativePath = path.relative(dir, result.file);
      
      if (result.error) {
        // Test file had an error (likely parse error)
        console.log(`  ${chalk.red('✗')} ${relativePath}`);
        console.log(chalk.red(`    Error: ${result.error}`));
        summary.errors++;
        summary.parseErrors.push(result);
      } else {
        summary.successfulFiles++;
        // Report individual test results
        const testNames = Object.keys(result.tests).sort();
        const allPassed = testNames.every(name => result.tests[name]);
        
        if (testNames.length === 0) {
          // File ran but no tests were found
          console.log(`  ${chalk.yellow('○')} ${relativePath} ${chalk.dim(`(${result.duration}ms) - no tests found`)}`);
        } else if (allPassed) {
          console.log(`  ${chalk.green('✓')} ${relativePath} ${chalk.dim(`(${result.duration}ms)`)}`);
        } else {
          console.log(`  ${relativePath} ${chalk.dim(`(${result.duration}ms)`)}`);
        }
        
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
      }
    }
    
    console.log(); // Empty line between directories
  }
  
  return summary;
}

/**
 * Display test summary
 */
function displaySummary(summary: TestSummary, duration: number, totalFiles: number) {
  const { total, passed, failed, errors, successfulFiles } = summary;
  
  console.log(chalk.dim('─'.repeat(50)));
  
  if (errors > 0) {
    console.log(chalk.red(`\n${errors} test file(s) failed to parse`));
    
    // Show parse error details
    console.log('\nParse errors:');
    for (const result of summary.parseErrors) {
      console.log(`  ${chalk.red('✗')} ${result.file}`);
      if (result.error) {
        // Extract line/column info if available
        const match = result.error.match(/at line (\d+), column (\d+)/);
        if (match) {
          console.log(`    ${chalk.dim(`Line ${match[1]}, Column ${match[2]}`)}`);
        }
      }
    }
  }
  
  if (successfulFiles > 0) {
    console.log(`\n${chalk.green(successfulFiles)} file(s) ran successfully`);
  }
  
  if (total === 0 && errors === 0) {
    console.log(chalk.yellow('\nNo tests found'));
    return;
  }
  
  const parts: string[] = [];
  
  if (passed > 0) {
    parts.push(chalk.green(`${passed} passed`));
  }
  
  if (failed > 0) {
    parts.push(chalk.red(`${failed} failed`));
  }
  
  if (total > 0) {
    const time = duration > 1000 ? `${(duration / 1000).toFixed(2)}s` : `${duration}ms`;
    console.log(`\nTests: ${parts.join(', ')} (${total} total)`);
    console.log(`Time:  ${time}`);
  }
  
  console.log(`\nSummary: ${totalFiles} file(s), ${successfulFiles} succeeded, ${errors} parse errors`);
  
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
    // Discover test files
    console.log('Discovering tests...');
    const testFiles = await discoverTests(patterns);
    
    if (testFiles.length === 0) {
      console.log(chalk.yellow('No test files found'));
      if (patterns.length > 0) {
        console.log(chalk.dim(`Patterns: ${patterns.join(', ')}`));
      }
      return;
    }
    
    console.log(`Found ${testFiles.length} test file(s)`);
    
    // Run tests sequentially (MVP phase)
    const results: TestResult[] = [];
    for (const file of testFiles) {
      const result = await runTestFile(file);
      results.push(result);
    }
    
    // Report results
    const summary = reportResults(results);
    
    // Display summary
    const duration = Date.now() - startTime;
    displaySummary(summary, duration, testFiles.length);
    
  } catch (error) {
    console.error(chalk.red('Error running tests:'), error);
    process.exitCode = 1;
  }
}