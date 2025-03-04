/**
 * Fix for the error display integration with meld-ast errors
 * 
 * This is the suggested change to make to your ErrorDisplayService
 * to ensure it can handle nested error objects correctly.
 */

// Add this method to your ErrorDisplayService class:

/**
 * Extracts all error data by recursively searching through nested error objects
 * @param {Error} err - The error object, which may contain nested errors
 * @returns {Object} Extracted error data
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
 * Main display method that uses the extracted error data
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
  
  // Continue with your existing code to display the error with source context
  // using the extracted filePath, line, and column...
}