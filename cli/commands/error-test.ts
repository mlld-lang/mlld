import * as path from 'path';
import * as fs from 'fs/promises';
import { parse } from '@grammar/parser';
import { createErrorContext } from '@core/errors/patterns/context';
import type { ErrorPattern } from '@core/errors/patterns/types';
import { MlldParseError } from '@core/errors';
import chalk from 'chalk';

/**
 * Run error-test command to test pattern matching
 */
export async function errorTestCommand(args: string[]): Promise<void> {
  if (args.length === 0) {
    console.error('Usage: mlld error-test <path-to-error-case>');
    console.error('Example: mlld error-test errors/captured/001');
    process.exit(1);
  }

  const errorCasePath = path.resolve(args[0]);

  try {
    // Find the example file
    let inputFile: string | undefined;
    let sourceContent: string;

    // Try different file names
    const possibleFiles = ['input.mld', 'example.mld', 'test.mld', 'example.md', 'test.md'];
    for (const fileName of possibleFiles) {
      const filePath = path.join(errorCasePath, fileName);
      try {
        await fs.access(filePath);
        inputFile = filePath;
        break;
      } catch {
        // Continue trying other files
      }
    }

    if (!inputFile) {
      console.error(`No input file found in ${errorCasePath}`);
      console.error(`Looked for: ${possibleFiles.join(', ')}`);
      process.exit(1);
    }

    // Read the source file
    sourceContent = await fs.readFile(inputFile, 'utf-8');
    console.log(chalk.blue(`\nTesting with: ${path.relative(process.cwd(), inputFile)}`));

    // Parse and capture the error
    const parseResult = await parse(sourceContent);
    
    if (parseResult.success) {
      console.error(chalk.yellow('\n⚠ No error produced - file parsed successfully'));
      return;
    }

    const error = parseResult.error;
    if (!error) {
      console.error(chalk.red('\n✗ No error object returned'));
      return;
    }

    // Load the pattern
    const patternPath = path.join(errorCasePath, 'pattern.ts');
    try {
      await fs.access(patternPath);
    } catch {
      console.error(chalk.red(`\n✗ Pattern file not found: ${patternPath}`));
      return;
    }

    // For error-test, check if this pattern is already in the registry
    let pattern: ErrorPattern | undefined;
    
    // First try to find it in the registry
    const patternName = path.basename(path.dirname(patternPath));
    const { errorPatternMap } = await import('@core/errors/patterns/registry');
    pattern = errorPatternMap.get(patternName);
    
    if (!pattern) {
      console.error(chalk.yellow('\n⚠ Pattern not found in registry'));
      console.error(chalk.gray(`Pattern name: ${patternName}`));
      console.error(chalk.gray('\nTo test a new pattern:'));
      console.error(chalk.gray('1. Add it to core/errors/patterns/registry.ts'));
      console.error(chalk.gray('2. Run npm run build'));
      console.error(chalk.gray('3. Run mlld error-test again'));
      
      // For convenience, show what to add to registry
      console.error(chalk.blue('\nAdd to registry.ts:'));
      console.error(chalk.gray(`import { pattern as ${patternName} } from '../../../${path.relative(process.cwd(), patternPath).replace('.ts', '')}';`));
      console.error(chalk.gray(`// Then add ${patternName} to the errorPatterns array`));
      return;
    }

    if (!pattern) {
      console.error(chalk.red('\n✗ No pattern export found in pattern.ts'));
      return;
    }

    // Create error context
    const context = createErrorContext(error, sourceContent);

    // Test the pattern
    console.log(chalk.blue('\nTesting pattern match...'));
    const matches = pattern.test(error, context);

    if (!matches) {
      console.error(chalk.red('\n✗ Pattern does not match'));
      console.error(chalk.gray('\nError details:'));
      console.error(chalk.gray(`  Message: ${error.message}`));
      console.error(chalk.gray(`  Found: ${JSON.stringify(error.found)}`));
      console.error(chalk.gray(`  Expected: ${error.expected?.map((e: any) => e.text || e.type).join(', ')}`));
      console.error(chalk.gray(`  Line: ${context.line}`));
      return;
    }

    console.log(chalk.green('✓ Pattern matches!'));

    // Test enhancement
    console.log(chalk.blue('\nTesting error enhancement...'));
    try {
      const enhanced = pattern.enhance(error, context);
      
      if (!(enhanced instanceof MlldParseError)) {
        console.error(chalk.red('\n✗ Enhanced error is not an MlldParseError'));
        return;
      }

      console.log(chalk.green('✓ Enhancement successful!'));
      console.log(chalk.blue('\nEnhanced error:'));
      console.log(chalk.white(enhanced.message));

      // Show location info if available
      if (enhanced.location) {
        const loc = enhanced.location;
        if ('start' in loc) {
          console.log(chalk.gray(`  at line ${loc.start.line}, column ${loc.start.column}`));
        } else {
          console.log(chalk.gray(`  at line ${loc.line}, column ${loc.column}`));
        }
      }

    } catch (err) {
      console.error(chalk.red('\n✗ Enhancement failed:'));
      console.error(err);
    }

  } catch (err) {
    console.error(chalk.red('Error running test:'));
    console.error(err);
    process.exit(1);
  }
}