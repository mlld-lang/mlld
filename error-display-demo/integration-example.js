/**
 * Example showing how to integrate the error display fix with your actual codebase
 * 
 * This demonstrates where to place the error extraction code in your actual
 * ErrorDisplayService implementation.
 */

// Pseudo-code example based on your likely ErrorDisplayService structure
class ErrorDisplayService {
  constructor(/* your dependencies */) {
    // Your existing constructor
  }

  /**
   * Extracts all error data by recursively searching through nested error objects
   * This is the key addition that fixes the nested error problem
   */
  extractErrorData(err) {
    // Initialize with default values
    const data = {
      message: err.message || 'Unknown error',
      filePath: null,
      line: 0,
      column: 0
    };
    
    // Helper to recursively search for properties in the error chain
    const searchErrorChain = (error) => {
      if (!error) return;
      
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
   * Display a parse error with source context
   * Modified to use the extractErrorData method
   */
  async displayParseError(err) {
    // Extract the error data from potentially nested errors
    const { message, filePath, line, column } = this.extractErrorData(err);
    
    // If we don't have enough information, fall back to basic display
    if (!filePath || line === 0) {
      console.log(this.chalk.red.bold('Parse Error:') + ' ' + message);
      console.log(this.chalk.dim(`Cannot display source context: missing location information`));
      return;
    }
    
    try {
      // Read the file content
      const content = await this.fs.promises.readFile(filePath, 'utf8');
      const lines = content.split('\n');
      
      // Get the error line
      const errorLineContent = lines[line - 1] || '';
      
      // Split the line at the error position
      const beforeError = errorLineContent.substring(0, column - 1);
      const errorChar = errorLineContent.substring(column - 1, column) || ' ';
      const afterError = errorLineContent.substring(column);
      
      // Your existing display code using the extracted values...
      console.log(this.chalk.red.bold('Parse Error:') + ' ' + message);
      console.log(this.chalk.dim(`    at ${this.chalk.cyan(filePath)}:${this.chalk.yellow(line)}:${this.chalk.yellow(column)}`));
      // ... rest of your existing display code
    } catch (displayErr) {
      // Fallback display if something goes wrong reading the file
      console.error('Error displaying source context:', displayErr);
      console.log(this.chalk.red.bold('Parse Error:') + ' ' + message);
      console.log(this.chalk.dim(`    at ${this.chalk.cyan(filePath)}:${this.chalk.yellow(line)}:${this.chalk.yellow(column)}`));
    }
  }

  // Your other display methods would similarly use extractErrorData
  async displayImportError(err) {
    const { message, filePath, line, column } = this.extractErrorData(err);
    // Your existing display code using the extracted values...
  }

  async displayResolutionError(err) {
    const { message, filePath, line, column } = this.extractErrorData(err);
    // Your existing display code using the extracted values...
  }
}

/*
Integration in cli/index.ts or wherever your error handling happens:

try {
  // Your existing pipeline execution code
} catch (err) {
  // Use the ErrorDisplayService, which will now extract data correctly
  // even from nested errors
  if (err.message.includes('Parse error')) {
    await errorDisplayService.displayParseError(err);
  } else if (err.message.includes('Import error')) {
    await errorDisplayService.displayImportError(err);
  } else if (err.message.includes('Resolution failed')) {
    await errorDisplayService.displayResolutionError(err);
  } else {
    // Default display for unknown errors
    console.error(err.message);
  }
}
*/