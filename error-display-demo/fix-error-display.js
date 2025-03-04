/**
 * Proposed fix for the error display issues with meld-ast errors
 * This approach recursively extracts error data from nested error objects
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
    const error = new Error('Expected "$", "\\"", "{", or other valid token but "s" found.');
    error.line = 5;
    error.column = 13;
    error.sourceFile = testFile;
    // Throw the error to simulate parser behavior
    throw error;
  }
  
  return { success: true, ast: {} };
}

// Mock nested error scenario from your application
function createNestedError() {
  try {
    const content = fs.readFileSync(testFile, 'utf8');
    mockMeldParser(content);
  } catch (astError) {
    // Level 1 wrapping (might happen in ParserService)
    const parserError = new Error('Parse error: ' + astError.message);
    parserError.originalError = astError;
    parserError.filePath = testFile;
    
    try {
      // Simulate some other process that might re-throw
      throw parserError;
    } catch (midError) {
      // Level 2 wrapping (might happen in Pipeline or CLI)
      const topError = new Error('Error processing file: ' + midError.message);
      topError.cause = midError;
      topError.file = testFile;
      return topError;
    }
  }
}

/**
 * Improved error display service that recursively extracts error data
 */
class ImprovedErrorDisplayService {
  /**
   * Extract all useful error data, searching recursively through nested errors
   */
  extractErrorData(err) {
    // Initialize with default values
    const data = {
      message: 'Unknown error',
      filePath: null,
      line: 0,
      column: 0
    };
    
    // Helper to recursively search for properties in the error chain
    const searchErrorChain = (error) => {
      if (!error) return;
      
      // Extract message if not already found
      if (data.message === 'Unknown error') {
        data.message = error.message || data.message;
      }
      
      // Extract file path from any available property
      if (!data.filePath) {
        data.filePath = error.filePath || error.sourceFile || error.file || error.fileName || data.filePath;
      }
      
      // Extract line and column
      if (data.line === 0) {
        data.line = error.line || error.lineNumber || data.line;
      }
      
      if (data.column === 0) {
        data.column = error.column || error.columnNumber || error.col || data.column;
      }
      
      // Continue searching in any nested error objects
      if (error.originalError) searchErrorChain(error.originalError);
      if (error.cause) searchErrorChain(error.cause);
      if (error.previous) searchErrorChain(error.previous);
      if (error.parent) searchErrorChain(error.parent);
    };
    
    // Start searching from the top-level error
    searchErrorChain(err);
    
    return data;
  }
  
  /**
   * Display error with enhanced source context
   */
  async displayError(err) {
    // Extract all useful data from the error chain
    const { message, filePath, line, column } = this.extractErrorData(err);
    
    // If we don't have enough information, fall back to basic display
    if (!filePath || line === 0) {
      console.log(chalk.red.bold('Error:') + ' ' + message);
      console.log(chalk.dim(`Cannot display source context: missing location information`));
      return;
    }
    
    try {
      // Read the file content
      const content = await fs.promises.readFile(filePath, 'utf8');
      const lines = content.split('\n');
      
      // Get the error line
      const errorLineContent = lines[line - 1] || '';
      
      // Split the line at the error position
      const beforeError = errorLineContent.substring(0, column - 1);
      const errorChar = errorLineContent.substring(column - 1, column) || ' ';
      const afterError = errorLineContent.substring(column);
      
      // Create the full display
      console.log(chalk.red.bold('Parse Error:') + ' ' + message);
      console.log(chalk.dim(`    at ${chalk.cyan(filePath)}:${chalk.yellow(line)}:${chalk.yellow(column)}`));
      console.log();
      
      // Show some context lines before the error
      for (let i = Math.max(1, line - 2); i < line; i++) {
        console.log(chalk.dim(`${String(i).padStart(4)} | `) + chalk.dim(lines[i - 1] || ''));
      }
      
      // Show the error line with highlighting
      console.log(chalk.bold(`${String(line).padStart(4)} | `) + 
                  chalk.white(beforeError) + 
                  chalk.bgRed.white(errorChar) + 
                  chalk.white(afterError));
      
      // Add the pointer line
      console.log('     | ' + ' '.repeat(beforeError.length) + chalk.red('^'));
      
      // Show some context lines after the error
      for (let i = line + 1; i <= Math.min(lines.length, line + 2); i++) {
        console.log(chalk.dim(`${String(i).padStart(4)} | `) + chalk.dim(lines[i - 1] || ''));
      }
    } catch (displayErr) {
      console.error('Error in display:', displayErr);
      console.log(chalk.red.bold('Error:') + ' ' + message);
      console.log(chalk.dim(`    at ${chalk.cyan(filePath || 'unknown')}:${chalk.yellow(line || '?')}:${chalk.yellow(column || '?')}`));
    }
  }
}

/**
 * Test the improved error display with deeply nested errors
 */
async function testImprovedDisplay() {
  // Get our deeply nested error
  const nestedError = createNestedError();
  
  console.log(chalk.yellow('\n=== DEEPLY NESTED ERROR ==='));
  console.log('Top error message:', nestedError.message);
  console.log('Top error has direct line/column:', nestedError.line, nestedError.column);
  console.log('Error nesting depth: 3 levels (top → cause → originalError)');
  
  // Create and use the improved display service
  const errorDisplay = new ImprovedErrorDisplayService();
  
  console.log(chalk.yellow('\n=== EXTRACTED ERROR DATA ==='));
  const data = errorDisplay.extractErrorData(nestedError);
  console.log('Extracted message:', data.message);
  console.log('Extracted file:', data.filePath);
  console.log('Extracted line:', data.line);
  console.log('Extracted column:', data.column);
  
  console.log(chalk.yellow('\n=== IMPROVED ERROR DISPLAY ==='));
  await errorDisplay.displayError(nestedError);
}

// Run the test
testImprovedDisplay();