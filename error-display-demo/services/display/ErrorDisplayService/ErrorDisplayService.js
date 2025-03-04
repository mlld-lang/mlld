/**
 * ErrorDisplayService.js
 * 
 * Service for displaying enhanced error messages with source context
 * and proper highlighting of error locations.
 */
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

class ErrorDisplayService {
  constructor() {
    this.fs = fs;
    this.path = path;
    this.chalk = chalk;
  }

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
   * Display a parse error with source context
   * @param {Error} err - The error object
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
      
      // Create the full display
      console.log(this.chalk.red.bold('Parse Error:') + ' ' + message);
      console.log(this.chalk.dim(`    at ${this.chalk.cyan(filePath)}:${this.chalk.yellow(line)}:${this.chalk.yellow(column)}`));
      console.log();
      
      // Show some context lines before the error
      for (let i = Math.max(1, line - 2); i < line; i++) {
        console.log(this.chalk.dim(`${String(i).padStart(4)} | `) + this.chalk.dim(lines[i - 1] || ''));
      }
      
      // Show the error line with highlighting
      console.log(this.chalk.bold(`${String(line).padStart(4)} | `) + 
                  this.chalk.white(beforeError) + 
                  this.chalk.bgRed.white(errorChar) + 
                  this.chalk.white(afterError));
      
      // Add the pointer line
      console.log('     | ' + ' '.repeat(beforeError.length) + this.chalk.red('^'));
      
      // Show some context lines after the error
      for (let i = line + 1; i <= Math.min(lines.length, line + 2); i++) {
        console.log(this.chalk.dim(`${String(i).padStart(4)} | `) + this.chalk.dim(lines[i - 1] || ''));
      }
    } catch (displayErr) {
      // Fallback display if something goes wrong reading the file
      console.error('Error displaying source context:', displayErr);
      console.log(this.chalk.red.bold('Parse Error:') + ' ' + message);
      console.log(this.chalk.dim(`    at ${this.chalk.cyan(filePath)}:${this.chalk.yellow(line)}:${this.chalk.yellow(column)}`));
    }
  }

  /**
   * Display an import error with source context
   * @param {Error} err - The error object
   */
  async displayImportError(err) {
    // Extract the error data from potentially nested errors
    const { message, filePath, line, column } = this.extractErrorData(err);
    
    // If we don't have enough information, fall back to basic display
    if (!filePath || line === 0) {
      console.log(this.chalk.red.bold('Import Error:') + ' ' + message);
      console.log(this.chalk.dim(`Cannot display source context: missing location information`));
      return;
    }
    
    try {
      // Read the file content
      const content = await this.fs.promises.readFile(filePath, 'utf8');
      const lines = content.split('\n');
      
      // Get the error line content
      const errorLineContent = lines[line - 1] || '';
      
      // Determine what part of the line to highlight - focus on the path
      // This is specialized for import errors which often have path issues
      const pathStartPos = errorLineContent.indexOf('[$');
      const highlightStart = pathStartPos >= 0 ? pathStartPos + 1 : column - 1; // +1 to skip [ and highlight $
      const highlightEnd = errorLineContent.indexOf(']', highlightStart);
      const highlightLength = highlightEnd > highlightStart ? highlightEnd - highlightStart : 1;
      
      // Split the line for highlighting
      const beforeError = errorLineContent.substring(0, highlightStart);
      const errorPart = errorLineContent.substring(highlightStart, highlightStart + highlightLength);
      const afterError = errorLineContent.substring(highlightStart + highlightLength);
      
      // Build the full error display
      console.log(this.chalk.red.bold('Import Error:') + ' ' + message);
      console.log(this.chalk.dim(`    at ${this.chalk.cyan(filePath)}:${this.chalk.yellow(line)}:${this.chalk.yellow(column)}`));
      console.log();
      
      // Show context lines before the error
      for (let i = Math.max(1, line - 2); i < line; i++) {
        console.log(this.chalk.dim(`${String(i).padStart(4)} | `) + this.chalk.dim(lines[i - 1] || ''));
      }
      
      // Show the error line with highlighting
      console.log(this.chalk.bold(`${String(line).padStart(4)} | `) + 
                  this.chalk.white(beforeError) + 
                  this.chalk.bgRed.white(errorPart) + 
                  this.chalk.white(afterError));
      
      // Add pointer line
      const pointerSpaces = ' '.repeat(beforeError.length);
      const pointerCarets = this.chalk.red('^'.repeat(Math.max(1, errorPart.length)));
      console.log(`     | ${pointerSpaces}${pointerCarets}`);
      
      // Show context lines after the error
      for (let i = line + 1; i <= Math.min(lines.length, line + 2); i++) {
        console.log(this.chalk.dim(`${String(i).padStart(4)} | `) + this.chalk.dim(lines[i - 1] || ''));
      }
      
      // Add additional context for import errors
      console.log();
      console.log(this.chalk.dim('The issue is that the path is incorrect. Options to fix:'));
      console.log(this.chalk.dim('1. Check if the file exists at the expected location'));
      console.log(this.chalk.dim('2. Use the correct project path: @embed [$./relative/path.md]'));
      console.log(this.chalk.dim('3. Use an absolute path if needed: @embed [$/absolute/path/to/file.md]'));
      
    } catch (displayErr) {
      console.error('Error displaying source context:', displayErr);
      console.log(this.chalk.red.bold('Import Error:') + ' ' + message);
      console.log(this.chalk.dim(`    at ${this.chalk.cyan(filePath)}:${this.chalk.yellow(line)}:${this.chalk.yellow(column)}`));
    }
  }

  /**
   * Display a resolution error with source context
   * @param {Error} err - The error object
   */
  async displayResolutionError(err) {
    // Extract the error data from potentially nested errors
    const { message, filePath, line, column } = this.extractErrorData(err);
    
    // If we don't have enough information, fall back to basic display
    if (!filePath || line === 0) {
      console.log(this.chalk.red.bold('Resolution Error:') + ' ' + message);
      console.log(this.chalk.dim(`Cannot display source context: missing location information`));
      return;
    }
    
    try {
      // Read the file content
      const content = await this.fs.promises.readFile(filePath, 'utf8');
      const lines = content.split('\n');
      
      // Get the error line content
      const errorLineContent = lines[line - 1] || '';
      
      // For resolution errors, we often want to highlight a variable name
      // Extract variable name from error message, e.g., "The variable "x" is not defined"
      const varMatch = message.match(/variable ["']([^"']+)["']/);
      const varName = varMatch ? varMatch[1] : null;
      
      let highlightStart = column - 1;
      let highlightLength = 1;
      
      // If we have a variable name, try to find it in the line
      if (varName) {
        const varPos = errorLineContent.indexOf(varName, Math.max(0, column - varName.length - 5));
        if (varPos >= 0) {
          highlightStart = varPos;
          highlightLength = varName.length;
        }
      }
      
      // Split the line for highlighting
      const beforeError = errorLineContent.substring(0, highlightStart);
      const errorPart = errorLineContent.substring(highlightStart, highlightStart + highlightLength);
      const afterError = errorLineContent.substring(highlightStart + highlightLength);
      
      // Build the full error display
      console.log(this.chalk.red.bold('Resolution Error:') + ' ' + message);
      console.log(this.chalk.dim(`    at ${this.chalk.cyan(filePath)}:${this.chalk.yellow(line)}:${this.chalk.yellow(column)}`));
      console.log();
      
      // Show context lines before the error
      for (let i = Math.max(1, line - 2); i < line; i++) {
        console.log(this.chalk.dim(`${String(i).padStart(4)} | `) + this.chalk.dim(lines[i - 1] || ''));
      }
      
      // Show the error line with highlighting
      console.log(this.chalk.bold(`${String(line).padStart(4)} | `) + 
                  this.chalk.white(beforeError) + 
                  this.chalk.bgRed.white(errorPart) + 
                  this.chalk.white(afterError));
      
      // Add pointer line
      const pointerSpaces = ' '.repeat(beforeError.length);
      const pointerCarets = this.chalk.red('^'.repeat(Math.max(1, errorPart.length)));
      console.log(`     | ${pointerSpaces}${pointerCarets}`);
      
      // Show context lines after the error
      for (let i = line + 1; i <= Math.min(lines.length, line + 2); i++) {
        console.log(this.chalk.dim(`${String(i).padStart(4)} | `) + this.chalk.dim(lines[i - 1] || ''));
      }
      
      // For resolution errors, show available variables (mock)
      console.log();
      console.log(this.chalk.dim(`Variable: ${varName || 'unknown'}`));
      console.log(this.chalk.dim('Available variables:'));
      console.log(this.chalk.dim('- Check defined variables in the current scope'));
      
    } catch (displayErr) {
      console.error('Error displaying source context:', displayErr);
      console.log(this.chalk.red.bold('Resolution Error:') + ' ' + message);
      console.log(this.chalk.dim(`    at ${this.chalk.cyan(filePath)}:${this.chalk.yellow(line)}:${this.chalk.yellow(column)}`));
    }
  }

  /**
   * Generic display method that determines the error type and calls the appropriate display method
   * @param {Error} err - The error object
   */
  async displayError(err) {
    if (!err) {
      console.log(this.chalk.red.bold('Error:') + ' Unknown error occurred');
      return;
    }
    
    const message = err.message || 'Unknown error';
    
    if (message.includes('Parse error') || message.includes('Expected ')) {
      await this.displayParseError(err);
    } else if (message.includes('Import error') || message.includes('resolve file path')) {
      await this.displayImportError(err);
    } else if (message.includes('Resolution failed') || message.includes('variable') || message.includes('not defined')) {
      await this.displayResolutionError(err);
    } else {
      // Generic error display for other types
      const { filePath, line, column } = this.extractErrorData(err);
      console.log(this.chalk.red.bold('Error:') + ' ' + message);
      
      if (filePath) {
        console.log(this.chalk.dim(`    at ${this.chalk.cyan(filePath)}${line ? `:${this.chalk.yellow(line)}:${this.chalk.yellow(column)}` : ''}`));
      }
    }
  }
}

module.exports = ErrorDisplayService;