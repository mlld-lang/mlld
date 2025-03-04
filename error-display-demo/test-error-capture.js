/**
 * Test script to capture and log raw errors from parsing a Meld file
 * This helps understand the error structure coming from meld-ast
 */
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

// File with syntax error
const testFile = './syntax-error.meld';

// Mock meld-ast parser function that will throw an error similar to the real parser
function mockMeldParser(content) {
  // Check for our specific syntax error
  if (content.includes('syntax error here')) {
    // Create an error object similar to what meld-ast might produce
    const error = new Error('Parse error: Expected "$", etc. but "s" found.');
    error.line = 5;
    error.column = 13;
    error.sourceFile = testFile;
    // Throw the error to simulate parser behavior
    throw error;
  }
  
  return { success: true, ast: {} };
}

/**
 * Test function to capture and inspect errors
 */
async function testErrorCapture() {
  try {
    // Read the file content
    const content = await fs.promises.readFile(testFile, 'utf8');
    
    // Try to parse, which will throw our mocked error
    const result = mockMeldParser(content);
    console.log('Parse successful (should not happen):', result);
  } 
  catch (err) {
    // Log the raw error object structure
    console.log(chalk.yellow('\n=== RAW ERROR OBJECT ==='));
    console.log('Error type:', Object.prototype.toString.call(err));
    console.log('Error message:', err.message);
    console.log('Error properties:', Object.keys(err));
    console.log('Error stack available:', !!err.stack);
    console.log('Error line:', err.line);
    console.log('Error column:', err.column);
    console.log('Error sourceFile:', err.sourceFile);
    
    // Now try to apply our enhanced display to this error
    console.log(chalk.yellow('\n=== ENHANCED ERROR DISPLAY ==='));
    displayEnhancedError(err);
  }
}

/**
 * Enhanced error display function that extracts info from error object
 */
async function displayEnhancedError(err) {
  try {
    // Extract error details
    const errorFile = err.sourceFile || testFile;
    const errorLine = err.line || 0;
    const errorColumn = err.column || 0;
    const errorMessage = err.message || 'Unknown error';
    
    // Read the file content
    const content = await fs.promises.readFile(errorFile, 'utf8');
    const lines = content.split('\n');
    
    // Get the error line
    const errorLineContent = lines[errorLine - 1] || '';
    
    // Split the line at the error position
    const beforeError = errorLineContent.substring(0, errorColumn - 1);
    const errorChar = errorLineContent.substring(errorColumn - 1, errorColumn) || ' ';
    const afterError = errorLineContent.substring(errorColumn);
    
    // Create the full display
    console.log(chalk.red.bold('Parse Error:') + ' ' + errorMessage);
    console.log(chalk.dim(`    at ${chalk.cyan(errorFile)}:${chalk.yellow(errorLine)}:${chalk.yellow(errorColumn)}`));
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
    console.error('Error in enhanced display:', err);
  }
}

// Run the test
testErrorCapture();