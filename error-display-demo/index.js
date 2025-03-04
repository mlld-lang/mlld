const fs = require('fs');
const chalk = require('chalk');
const path = require('path');

// Sample error data
const testFile = './syntax-error.meld';
const errorLine = 5;
const errorColumn = 13;
const errorMessage = 'Parse error: Expected "$", etc. but "s" found.';

/**
 * Enhanced error display function that shows source context and highlights errors
 */
async function displayErrorWithSourceContext() {
  try {
    // Check if file exists
    try {
      await fs.promises.access(testFile);
    } catch (err) {
      console.error(`File not found: ${testFile}`);
      return;
    }
    
    // Read the file content
    const content = await fs.promises.readFile(testFile, 'utf8');
    const lines = content.split('\n');
    
    // Get the error line
    const errorLineContent = lines[errorLine - 1] || '';
    
    // Split the line at the error position
    const beforeError = errorLineContent.substring(0, errorColumn - 1);
    const errorChar = errorLineContent.substring(errorColumn - 1, errorColumn) || ' ';
    const afterError = errorLineContent.substring(errorColumn);
    
    // Create the full display
    console.log(chalk.red.bold('Parse Error:') + ' ' + errorMessage);
    console.log(chalk.dim(`    at ${chalk.cyan(testFile)}:${chalk.yellow(errorLine)}:${chalk.yellow(errorColumn)}`));
    console.log();
    
    // Show some context lines before the error
    for (let i = Math.max(1, errorLine - 2); i < errorLine; i++) {
      console.log(chalk.dim(`${String(i).padStart(4)} | `) + chalk.dim(lines[i - 1] || ''));
    }
    
    // Show the error line with highlighting
    console.log(chalk.bold(`${String(errorLine).padStart(4)} | `) + 
                chalk.white(beforeError) + 
                chalk.bgRed.white(errorChar) + 
                chalk.white(afterError));
    
    // Add the pointer line
    console.log('     | ' + ' '.repeat(beforeError.length) + chalk.red('^'));
    
    // Show some context lines after the error
    for (let i = errorLine + 1; i <= Math.min(lines.length, errorLine + 2); i++) {
      console.log(chalk.dim(`${String(i).padStart(4)} | `) + chalk.dim(lines[i - 1] || ''));
    }
  } catch (err) {
    console.error('Error displaying source context:', err);
  }
}

// Display the error
displayErrorWithSourceContext();
