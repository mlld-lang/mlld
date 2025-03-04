/**
 * Test script to capture and handle nested errors that might occur in the real application
 * This simulates when errors from meld-ast might be wrapped or transformed
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

// Mock ParserService that wraps meld-ast errors
class MockParserService {
  parse(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return mockMeldParser(content);
    } catch (err) {
      // Wrap the original error in a new one, which might be what's happening
      const wrapperError = new Error('Parse error: ' + err.message);
      wrapperError.originalError = err;
      wrapperError.filePath = filePath;
      throw wrapperError;
    }
  }
}

// Mock ErrorDisplayService that might not be accessing the original error correctly
class MockErrorDisplayService {
  displayError(err) {
    console.log(chalk.yellow('\n=== ORIGINAL DISPLAY METHOD ==='));
    console.log('Error:', err.message);
    console.log('File:', err.filePath || 'unknown');
    
    // This might not correctly access line and column if they're in the originalError
    const line = err.line || 'unknown';
    const column = err.column || 'unknown';
    console.log('Location:', line + ':' + column);
  }
  
  // Fixed version that correctly accesses nested error properties
  displayErrorFixed(err) {
    // Try to find the original error with line/column info
    const originalErr = err.originalError || err;
    const filePath = err.filePath || originalErr.sourceFile || testFile;
    const line = originalErr.line || err.line || 0;
    const column = originalErr.column || err.column || 0;
    
    console.log(chalk.yellow('\n=== FIXED DISPLAY METHOD ==='));
    this.displayWithSourceContext(filePath, line, column, err.message);
  }
  
  // Enhanced display with source context
  async displayWithSourceContext(filePath, line, column, message) {
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
    } catch (err) {
      console.error('Error in enhanced display:', err);
    }
  }
}

/**
 * Test function to simulate the real application flow
 */
async function testApplicationFlow() {
  const parser = new MockParserService();
  const errorDisplay = new MockErrorDisplayService();
  
  try {
    // Try to parse, which will throw our nested error
    const result = parser.parse(testFile);
    console.log('Parse successful (should not happen):', result);
  } 
  catch (err) {
    // Log the error structure to understand how it might be nested
    console.log(chalk.yellow('\n=== NESTED ERROR STRUCTURE ==='));
    console.log('Top error message:', err.message);
    console.log('Top error properties:', Object.keys(err));
    console.log('Has originalError:', !!err.originalError);
    
    if (err.originalError) {
      console.log('Original error message:', err.originalError.message);
      console.log('Original error properties:', Object.keys(err.originalError));
      console.log('Original error line:', err.originalError.line);
      console.log('Original error column:', err.originalError.column);
    }
    
    // Try both display methods
    errorDisplay.displayError(err);
    await errorDisplay.displayErrorFixed(err);
  }
}

// Run the test
testApplicationFlow();