# Source Maps UX Enhancement (Phase 2)

## Overview

The goal of this second phase is to enhance the CLI error output to leverage our source maps implementation and create a more user-friendly error display. When errors occur, we'll show the original source code line with syntax highlighting, a red highlight for the problematic section, and a caret pointing to the exact location of the error. 

## Requirements

1. Show the original source code line when errors occur
2. Apply syntax highlighting to the code for better readability
3. Highlight the error location in red
4. Add a caret (^) pointer beneath the specific token/character causing the error
5. Include the file name and line number for easy reference
6. Implement sensible fallbacks when precise location information isn't available

## Implementation Plan

### 1. Create ErrorDisplayService

Create a new service to handle error formatting and display:

```typescript
// services/display/ErrorDisplayService/ErrorDisplayService.ts
import chalk from 'chalk';
import { MeldError } from '@core/errors/MeldError';
import { SourceMapService } from '@core/utils/SourceMapService';

export interface IErrorDisplayService {
  formatError(error: MeldError): string;
  displayErrorWithSourceContext(error: MeldError): string;
}

export class ErrorDisplayService implements IErrorDisplayService {
  formatError(error: MeldError): string {
    // Basic error formatting (existing functionality)
    return `Error: ${error.message}`;
  }

  displayErrorWithSourceContext(error: MeldError): string {
    if (!error.filePath || !error.context?.sourceLocation) {
      // Fallback to basic formatting if no source information available
      return this.formatError(error);
    }

    const sourceLocation = error.context.sourceLocation;
    const { filePath, line, column } = sourceLocation;
    
    try {
      // Get the source line from the file
      const sourceCode = this.getSourceLine(filePath, line);
      if (!sourceCode) {
        return `Error in ${filePath}:${line}: ${error.message}`;
      }
      
      // Create the error display with highlighting
      const errorDisplay = this.highlightErrorInSource(sourceCode, column, error.context.length || 1);
      
      // Return the formatted error with source context
      return [
        `Error in ${chalk.cyan(filePath)}:${chalk.yellow(line.toString())}`,
        error.message,
        '',
        errorDisplay.codeLine,
        errorDisplay.pointerLine
      ].join('\n');
    } catch (e) {
      // Fallback if reading the source or highlighting fails
      return `Error in ${filePath}:${line}: ${error.message}`;
    }
  }

  private getSourceLine(filePath: string, lineNumber: number): string | null {
    // Implementation to read the specific line from the source file
    // This would use the FileSystemService to read the file
    // and extract the relevant line
    // ...
  }

  private highlightErrorInSource(sourceLine: string, column: number, length: number = 1): { codeLine: string, pointerLine: string } {
    // Ensure column is within bounds
    column = Math.max(0, Math.min(column, sourceLine.length));
    
    // Create highlighted code line
    const beforeError = sourceLine.substring(0, column);
    const errorPart = sourceLine.substring(column, column + length);
    const afterError = sourceLine.substring(column + length);
    
    const codeLine = chalk.white(beforeError) + chalk.bgRed(errorPart) + chalk.white(afterError);
    
    // Create pointer line with caret
    const pointerLine = ' '.repeat(column) + chalk.red('^'.repeat(Math.max(1, length)));
    
    return { codeLine, pointerLine };
  }
}
```

### 2. Update CLI Error Handling

Modify the CLI error handling in `cli/index.ts` to use the new error display service:

```typescript
// Import the new service
import { ErrorDisplayService } from '@services/display/ErrorDisplayService/ErrorDisplayService';

// Create instance of the service
const errorDisplayService = new ErrorDisplayService();

// In the catch block, update error display logic:
if (error instanceof MeldError) {
  if (error.filePath && error.context?.sourceLocation) {
    // Use the new display service for detailed error output
    console.error(errorDisplayService.displayErrorWithSourceContext(error));
  } else {
    // Fallback to simpler display
    console.error(`Error in ${error.filePath || 'unknown'}: ${error.message}`);
  }
} else {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
}
```

### 3. Enhance MeldError with More Context

Update the `MeldError` class to include more information about the error location:

```typescript
// Update context type to include more error location details
export interface ErrorContext {
  sourceLocation?: {
    filePath: string;
    line: number;
    column: number;
    endColumn?: number;  // For variable-length errors
  };
  code?: string;        // The problematic code snippet
  length?: number;      // Length of the error token
  suggestion?: string;  // Optional suggestion for fixing the error
}
```

### 4. Integrate with Source Maps

Update the source mapping utilities to provide more precise location information for errors:

```typescript
// core/utils/sourceMapUtils.ts
export function enhanceErrorWithSourceMap(error: MeldError): MeldError {
  if (!error.filePath || !error.location) {
    return error;
  }

  const sourceMap = SourceMapService.getInstance().getSourceMapForFile(error.filePath);
  if (!sourceMap) {
    return error;
  }

  const originalLocation = sourceMap.getOriginalLocation({
    line: error.location.line,
    column: error.location.column || 0
  });

  if (originalLocation) {
    error.context = {
      ...error.context,
      sourceLocation: {
        filePath: originalLocation.source || error.filePath,
        line: originalLocation.line,
        column: originalLocation.column || 0,
        endColumn: originalLocation.column + (error.context?.length || 1)
      }
    };
  }

  return error;
}
```

### 5. Install Dependencies

Add the necessary dependencies:

```bash
npm install chalk@4 # For terminal colors
```

## Example Output

With these changes, errors will be displayed like:

```
Error in /path/to/original.meld:15
Missing closing brace in directive

define foo {
          ^
```

Or with more context:

```
Error in /path/to/original.meld:42
Cannot access property 'name' of undefined

text greeting = Hello ${user.name}!
                       ^^^^^
```

## Testing Plan

1. Create specific test cases with known error patterns
2. Test scenarios with different error types (syntax errors, resolution errors, etc.)
3. Test with imported/embedded files to ensure source mapping works correctly
4. Test fallbacks when source information is incomplete or unavailable

## Future Enhancements (Phase 3)

1. Show multiple lines of context (before and after the error line)
2. Add more intelligent suggestions for fixing common errors
3. Implement interactive fixes for simple errors (CLI command to auto-fix)
4. Show snippet previews when errors occur in large imported files