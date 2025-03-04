/**
 * This demonstration script shows what the enhanced error display would look like
 * when processing the examples/example.meld file.
 * 
 * It uses the same techniques implemented in the ErrorDisplayService but in a standalone
 * way to show the improvements without relying on the full build integration.
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

// Define the path to the example file we're analyzing
const exampleFilePath = path.resolve(__dirname, '../examples/example.meld');
const errorLine = 23;  // line with the problematic @embed directive
const errorColumn = 19; // position of the error in the line
const errorMessage = 'Import error: Could not resolve file path "$/docs/UX.md" - file does not exist';

/**
 * Displays an error with source context, with the same enhancements as ErrorDisplayService
 */
async function displayEnhancedError() {
  try {
    // Check if the file exists first
    try {
      await fs.promises.access(exampleFilePath);
    } catch (err) {
      console.error(`File not found: ${exampleFilePath}`);
      return;
    }
    
    // Read the file content
    const content = await fs.promises.readFile(exampleFilePath, 'utf8');
    const lines = content.split('\n');
    
    // Get the error line content
    const errorLineContent = lines[errorLine - 1] || '';
    
    // Determine what part of the line to highlight - focus on the path
    const pathStartPos = errorLineContent.indexOf('[$./docs/');
    const highlightStart = pathStartPos >= 0 ? pathStartPos + 2 : errorColumn; // +2 to skip [$ and highlight ./docs
    const highlightEnd = highlightStart + 8; // highlight "./docs/UX" part
    
    // Split the line for highlighting
    const beforeError = errorLineContent.substring(0, highlightStart);
    const errorPart = errorLineContent.substring(highlightStart, highlightEnd);
    const afterError = errorLineContent.substring(highlightEnd);
    
    // Build the full error display
    console.log(chalk.red.bold('Import Error:') + ' ' + errorMessage);
    console.log(chalk.dim(`    at ${chalk.cyan(path.relative(process.cwd(), exampleFilePath))}:${chalk.yellow(errorLine)}:${chalk.yellow(errorColumn)}`));
    console.log();
    
    // Show context lines before the error
    for (let i = Math.max(1, errorLine - 2); i < errorLine; i++) {
      console.log(chalk.dim(`${String(i).padStart(4)} | `) + chalk.dim(lines[i - 1] || ''));
    }
    
    // Show the error line with highlighting
    console.log(chalk.bold(`${String(errorLine).padStart(4)} | `) + 
                chalk.white(beforeError) + 
                chalk.bgRed.white(errorPart) + 
                chalk.white(afterError));
    
    // Add pointer line
    const pointerSpaces = ' '.repeat(beforeError.length);
    const pointerCarets = chalk.red('^'.repeat(errorPart.length));
    console.log(`     | ${pointerSpaces}${pointerCarets}`);
    
    // Show context lines after the error
    for (let i = errorLine + 1; i <= Math.min(lines.length, errorLine + 2); i++) {
      console.log(chalk.dim(`${String(i).padStart(4)} | `) + chalk.dim(lines[i - 1] || ''));
    }
    
    // Add additional context for this specific error
    console.log();
    console.log(chalk.dim('The issue is that the path is incorrect. Options to fix:'));
    console.log(chalk.dim('1. Check if the file exists at the expected location'));
    console.log(chalk.dim('2. Use the correct project path: @embed [$./docs/UX.md]'));
    console.log(chalk.dim('3. Use an absolute path if needed: @embed [$/absolute/path/to/UX.md]'));
    
  } catch (err) {
    console.error('Error displaying enhanced error:', err);
  }
}

// Run the enhanced error display
displayEnhancedError();
