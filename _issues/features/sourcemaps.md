<think>The user is enthusiastic about the source mapping approach for LLMXML errors and wants to extend it to handle meld-ast errors as well. They're suggesting we integrate this into the overarching error handling system documented in ERROR_HANDLING.md.

Let me analyze what this would entail:

1. Implement source mapping for LLMXML errors (as we've already discussed)
2. Extend this approach to meld-ast parser errors
3. Normalize error formats to be more user-friendly
4. Integrate with the existing error severity system (Fatal/Recoverable/Warning)
5. Provide verbose error details for debugging
6. Track error origins (which parser/component generated the error)

Looking at the ERROR_HANDLING.md document, Meld already has a sophisticated error handling system with severity levels and different modes (strict vs. permissive). Our source mapping enhancement would fit well into this system.

I should propose a comprehensive approach that ties together our source mapping solution with the existing error handling architecture.</think>You're absolutely right! This is a perfect enhancement to our error handling system. Let's create a comprehensive plan to implement source mapping for both LLMXML and meld-ast errors, integrated with our existing error handling architecture.

## Enhanced Error Handling with Source Mapping

I'll outline how we can implement this as part of our overall error handling system:

### 1. Create a Source Mapping Module

First, let's create a reusable source mapping service that can be used by multiple components:

```typescript
// services/core/SourceMapService/SourceMapService.ts

import { injectable } from 'inversify';
import { ISourceMapService, SourceLocation } from './ISourceMapService';
import { logger } from '@core/utils/logger';

@injectable()
export class SourceMapService implements ISourceMapService {
  private sources = new Map<string, string[]>();
  private mappings: Array<{
    source: SourceLocation;
    combined: { line: number; column: number };
  }> = [];

  registerSource(filePath: string, content: string): void {
    this.sources.set(filePath, content.split('\n'));
    logger.debug(`Registered source file for mapping: ${filePath}`);
  }

  addMapping(source: SourceLocation, combinedLine: number, combinedColumn: number): void {
    this.mappings.push({
      source,
      combined: { line: combinedLine, column: combinedColumn }
    });
    logger.debug(`Added source mapping: ${source.filePath}:${source.line} -> ${combinedLine}`);
  }

  findOriginalLocation(combinedLine: number, combinedColumn: number): SourceLocation | null {
    // Find the most relevant mapping using the algorithm from our demo
    // ...implementation similar to our example code...
  }
}
```

### 2. Normalize Error Formats with Source Information

Create a consistent error enhancement function that works across different parsers:

```typescript
// services/core/errors/enhanceErrorWithSource.ts

import { MeldError, ErrorSeverity } from '@core/errors/MeldError';
import { ISourceMapService } from '@core/SourceMapService/ISourceMapService';

interface EnhancedErrorOptions {
  sourceMapService: ISourceMapService;
  originalError: any;
  errorType: typeof MeldError;
  severity: ErrorSeverity;
  code: string;
  combinedLine?: number;
  combinedColumn?: number;
}

export function enhanceErrorWithSource({
  sourceMapService,
  originalError,
  errorType,
  severity,
  code,
  combinedLine,
  combinedColumn
}: EnhancedErrorOptions): MeldError {
  if (combinedLine && combinedColumn) {
    const originalLocation = sourceMapService.findOriginalLocation(combinedLine, combinedColumn);
    
    if (originalLocation) {
      // Create enhanced error with source mapping info
      const enhancedError = new errorType(
        `${originalError.message} at line ${combinedLine} (in file ${originalLocation.filePath}, line ${originalLocation.line})`,
        {
          severity,
          code,
          cause: originalError,
          details: {
            combinedLocation: { line: combinedLine, column: combinedColumn },
            originalLocation,
            originalError
          }
        }
      );
      
      return enhancedError;
    }
  }
  
  // If no mapping found, return a standard error
  return new errorType(originalError.message, {
    severity,
    code,
    cause: originalError,
    details: { originalError }
  });
}
```

### 3. Enhance LLMXML Error Handling

Update the OutputService to use source mapping with LLMXML errors:

```typescript
// services/pipeline/OutputService/OutputService.ts

private async convertToXML(
  nodes: MeldNode[],
  state: IStateService,
  options?: OutputOptions
): Promise<string> {
  try {
    // Track source mappings during markdown conversion
    const markdown = await this.convertToMarkdown(nodes, state, options);
    const sourceMapService = container.resolve<ISourceMapService>('SourceMapService');
    
    // Use llmxml
    const { createLLMXML } = await import('llmxml');
    const llmxml = createLLMXML({/* options */});
    
    return await llmxml.toXML(markdown);
  } catch (error) {
    // Check if it's an LLMXML parsing error with position info
    if (error.details?.node?.position) {
      const { line, column } = error.details.node.position.start;
      
      // Enhance error with source mapping
      const enhancedError = enhanceErrorWithSource({
        sourceMapService: container.resolve<ISourceMapService>('SourceMapService'),
        originalError: error,
        errorType: MeldOutputError,
        severity: ErrorSeverity.Recoverable, // Use recoverable per our error handling policy
        code: 'LLMXML_PARSE_ERROR',
        combinedLine: line,
        combinedColumn: column
      });
      
      // Log the enhanced error and rethrow
      logger.error(`Enhanced LLMXML error: ${enhancedError.message}`, {
        originalError: error,
        enhancedError
      });
      
      throw enhancedError;
    }
    
    // Fallback for other error types
    throw new MeldOutputError('Failed to convert output', {
      severity: ErrorSeverity.Recoverable,
      code: 'LLMXML_CONVERSION_ERROR',
      cause: error instanceof Error ? error : undefined
    });
  }
}
```

### 4. Enhance meld-ast Error Handling

Similarly, update the ParserService to provide better context for parser errors:

```typescript
// services/pipeline/ParserService/ParserService.ts

public async parseWithLocations(content: string, filePath?: string): Promise<MeldNode[]> {
  try {
    // Register source with source map service for tracking
    if (filePath) {
      const sourceMapService = container.resolve<ISourceMapService>('SourceMapService');
      sourceMapService.registerSource(filePath, content);
    }
    
    return await this.parseContent(content, filePath);
  } catch (error) {
    if (isMeldAstError(error) && error.location && filePath) {
      // Enhance parser error with file context
      const enhancedError = new MeldParseError(
        `${error.message} in file ${path.basename(filePath)}`,
        error.location,
        {
          severity: ErrorSeverity.Fatal, // Parser errors are fatal per our policy
          code: 'MELD_PARSE_ERROR',
          filePath,
          details: { originalError: error }
        }
      );
      
      throw enhancedError;
    }
    
    // Rethrow original error if we can't enhance it
    throw error;
  }
}
```

### 5. Add CLI Verbosity Options

Update the CLI to support different verbosity levels for errors:

```typescript
// services/cli/CLIService/CLIService.ts

// Parse CLI options
const options = {
  // ... existing options
  errorVerbosity: argv.errorVerbosity || 'normal'
};

// Configure error handler based on verbosity
let errorHandler;
switch (options.errorVerbosity) {
  case 'minimal':
    errorHandler = (error: MeldError) => {
      console.error(error.message);
    };
    break;
  
  case 'normal':
    errorHandler = (error: MeldError) => {
      const location = error.getSourceLocation();
      if (location) {
        console.error(`Error in ${location.filePath}:${location.line}: ${error.message}`);
      } else {
        console.error(`Error: ${error.message}`);
      }
    };
    break;
  
  case 'verbose':
    errorHandler = (error: MeldError) => {
      console.error(error.getVerboseMessage());
      if (error.details?.originalError) {
        console.error('\nOriginal error:');
        console.error(error.details.originalError);
      }
    };
    break;
}
```

### 6. Update Error Documentation

I'll create a draft update to the ERROR_HANDLING.md file to include our source mapping approach:

```markdown
## Source Mapping for Error Locations

Meld now supports source mapping for error locations, which helps trace errors back to their original source files, particularly when working with embedded or imported content.

### How Source Mapping Works

1. **Source Registration**: When files are loaded, they're registered with the `SourceMapService`
2. **Mapping Creation**: As content is combined, line mappings are created between original and combined locations
3. **Error Enhancement**: When errors occur, they're enhanced with original source information
4. **User-Friendly Messages**: Error messages include both combined and original source locations

### Using Source Mapped Errors

Source mapped errors provide the following benefits:

1. **Precise Error Location**: Errors point to the exact file and line where the issue originated
2. **Context Across Files**: Understand how content from multiple files relates to errors
3. **Enhanced Debugging**: Verbose mode shows both original and combined locations

Example of an enhanced error message:
```
Error: Empty code block at line 140 (in file examples/embedded.meld, line 12)
```

### Debugging Source Mappings

Use the `--debug-source-maps` flag with the CLI to output detailed source mapping information:

```bash
meld examples/api-demo.meld --debug-source-maps
```

For debugging specific line numbers, use:

```bash
meld examples/api-demo.meld --debug-source-maps --debug-line 140
```
```

### 7. Implementation Strategy

Here's a phased approach to implement this system:

1. **Phase 1**: Create the SourceMapService and basic integration
   - Implement core source mapping functionality
   - Add to OutputService for LLMXML errors
   - Add simple line directive comments for debugging

2. **Phase 2**: Extend to meld-ast and normalize errors
   - Enhance ParserService with source mapping
   - Create error enhancement utilities
   - Standardize error messages across parsers

3. **Phase 3**: Add CLI support and documentation
   - Add verbosity options to CLI
   - Update error handling documentation
   - Add debugging utilities for source maps

This integrated approach would give us a consistent way to handle errors from different sources (LLMXML, meld-ast, etc.) while providing useful context to help users locate and fix issues quickly. It respects our existing error severity system while enhancing it with source location information.

===================

After this, we had a ton of issues. So we took a step back.

===== UPDATE ======

<think>The user is asking why we needed to use Inversify (dependency injection) for the source mapping implementation and suggesting that's the root of the problems we're facing. They want me to revise the source mapping implementation plan without relying on Inversify.

Let's analyze why we used Inversify in our initial implementation:

1. We implemented the source mapping service as an injectable service (using `@injectable()` decorator)
2. We added the service to the existing DI container
3. We injected the service into various components using `@inject()` decorators

This approach caused several issues:
- Decorator support required enabling experimental decorators in tsconfig.json
- Path aliases didn't work properly with Vitest/esbuild (needed vite-tsconfig-paths)
- Complex import paths when switching to relative paths

You're right that the core functionality of source mapping (intercepting errors, tracking line/column information, and enhancing error messages) doesn't inherently require dependency injection.

I should revise the implementation plan to provide a simpler approach that doesn't rely on Inversify, making it more lightweight and easier to integrate without dependency issues.</think># Sourcemaps Implementation Plan

## Overview

This document outlines the implementation plan for source mapping capabilities in Meld. The source mapping system will provide better error reporting by tracking the original location of content in imported and embedded files, enabling more precise error messages that point to the actual source of problems.

## Goals

1. Enhance error messages with original source file information
2. Integrate with the existing error handling architecture
3. Support both `@import` and `@embed` directives
4. Map LLMXML and meld-ast parser errors back to source files
5. Provide debugging utilities for inspecting source maps
6. Maintain compatibility with both strict and permissive error modes

## Technical Approach

After examining the codebase and considering the existing architecture, we'll implement source mapping using a standalone service that integrates with key components without requiring dependency injection or changes to the core error architecture.

### 1. Source Map Service

```typescript
// core/utils/SourceMapService.ts
export interface SourceLocation {
  filePath: string;
  line: number;
  column: number;
}

export class SourceMapService {
  private sources = new Map<string, string[]>();
  private mappings: Array<{
    source: SourceLocation;
    combined: { line: number; column: number };
  }> = [];
  
  // Register a source file and its content
  registerSource(filePath: string, content: string): void {
    this.sources.set(filePath, content.split('\n'));
  }
  
  // Add a mapping from source file location to combined file location
  addMapping(source: SourceLocation, combinedLine: number, combinedColumn: number): void {
    this.mappings.push({
      source,
      combined: { line: combinedLine, column: combinedColumn }
    });
  }
  
  // Find the original location for a given line/column in the combined content
  findOriginalLocation(combinedLine: number, combinedColumn: number): SourceLocation | null {
    // Find the closest mapping that's less than or equal to the target line
    let bestMapping = null;
    let bestDistance = Infinity;
    
    for (const mapping of this.mappings) {
      if (mapping.combined.line <= combinedLine) {
        const distance = combinedLine - mapping.combined.line;
        if (distance < bestDistance) {
          bestDistance = distance;
          bestMapping = mapping;
        }
      }
    }
    
    if (bestMapping) {
      // Calculate the original line by adding the line offset to the source line
      const originalLine = bestMapping.source.line + (combinedLine - bestMapping.combined.line);
      
      // For column, only use the original column if we're on the exact same line
      const originalColumn = combinedLine === bestMapping.combined.line
        ? bestMapping.source.column + (combinedColumn - bestMapping.combined.column)
        : combinedColumn;
      
      return {
        filePath: bestMapping.source.filePath,
        line: originalLine,
        column: originalColumn
      };
    }
    
    return null;
  }
  
  // Get debug information about all mappings
  getDebugInfo(): string {
    return this.mappings.map(m => 
      `${m.source.filePath}:${m.source.line}:${m.source.column} -> combined:${m.combined.line}:${m.combined.column}`
    ).join('\n');
  }
  
  // Reset all mappings (useful for tests)
  reset(): void {
    this.sources.clear();
    this.mappings = [];
  }
}

// Create a singleton instance for use throughout the app
export const sourceMapService = new SourceMapService();
```

### 2. Error Enhancement Utilities

```typescript
// core/utils/sourceMapUtils.ts
import { sourceMapService, SourceLocation } from './SourceMapService';
import { MeldError, MeldErrorOptions, ErrorSeverity } from '@core/errors/MeldError';

// Extract line/column from error messages
export function extractErrorLocation(error: Error): { line: number; column: number } | null {
  const lineColPattern = /(?:at\s+)?(?:line\s+)?(\d+)(?:,\s+column\s+|:)(\d+)/i;
  const match = error.message.match(lineColPattern);
  
  if (match && match.length >= 3) {
    return {
      line: parseInt(match[1], 10),
      column: parseInt(match[2], 10)
    };
  }
  
  return null;
}

// Enhance a MeldError with source location information
export function enhanceMeldErrorWithSourceInfo(
  error: MeldError, 
  options?: { 
    preferExistingSourceInfo?: boolean 
  }
): MeldError {
  // Extract location from the error message
  const location = extractErrorLocation(error);
  
  // Skip enhancement if location can't be extracted
  if (!location) {
    return error;
  }
  
  // Try to find the original source location
  const sourceLocation = sourceMapService.findOriginalLocation(
    location.line, 
    location.column
  );
  
  // Skip if source location not found
  if (!sourceLocation) {
    return error;
  }
  
  // If error already has a filePath and we should prefer it, don't override
  if (options?.preferExistingSourceInfo && error.filePath) {
    return error;
  }
  
  // Create new error options with source info
  const newOptions: MeldErrorOptions = {
    code: error.code,
    severity: error.severity,
    context: error.context,
    filePath: sourceLocation.filePath,
  };
  
  // Add sourceLocation to context
  if (!newOptions.context) {
    newOptions.context = {};
  }
  newOptions.context.sourceLocation = sourceLocation;
  
  // Create enhanced message
  const enhancedMessage = `${error.message} (in ${sourceLocation.filePath}:${sourceLocation.line})`;
  
  // Create a new error of the same type with enhanced information
  const EnhancedErrorConstructor = Object.getPrototypeOf(error).constructor;
  return new EnhancedErrorConstructor(enhancedMessage, newOptions);
}

// Helper to register source file content
export function registerSource(filePath: string, content: string): void {
  sourceMapService.registerSource(filePath, content);
}

// Helper to add source mapping
export function addMapping(
  sourceFilePath: string, 
  sourceLine: number, 
  sourceColumn: number,
  targetLine: number, 
  targetColumn: number
): void {
  sourceMapService.addMapping(
    { filePath: sourceFilePath, line: sourceLine, column: sourceColumn },
    targetLine,
    targetColumn
  );
}

// Debug helper for CLI
export function getSourceMapDebugInfo(): string {
  return sourceMapService.getDebugInfo();
}
```

## Implementation Plan

### Phase 1: Core Implementation and Integration Tests

1. **Source Map Service Implementation**
   - Create the `SourceMapService` class and utilities
   - Implement source location tracking and mapping algorithms
   - Add unit tests for the service

2. **Integration Tests & Debugging Utilities**
   - Create test cases for source mapping functionality
   - Implement debug CLI options for source map inspection
   - Add error enhancement utilities for MeldErrors

### Phase 2: Directive Handler Integration

3. **EmbedDirectiveHandler Integration**
   - Modify `EmbedDirectiveHandler` to register source files and add mappings
   - Add source mapping test cases for embed errors
   - Update error handling to enhance errors with source information

4. **ImportDirectiveHandler Integration**
   - Modify `ImportDirectiveHandler` to register source files and add mappings
   - Add source mapping test cases for import errors
   - Update error handling to enhance errors with source information

### Phase 3: Parser Integration and Output Enhancement

5. **Parser Error Integration**
   - Enhance `ParserService` to map parser errors to original sources
   - Update MeldParseError to include source location information
   - Add test cases for parser error mapping

6. **OutputService Integration**
   - Enhance `OutputService` to map LLMXML errors to original sources
   - Add source mapping support to error handling in XML conversion
   - Create test cases for LLMXML error mapping

### Phase 4: CLI Integration and Documentation

7. **CLI Integration**
   - Add CLI options for source map debugging
   - Update error reporting to include source information
   - Add `--debug-source-maps` flag to show mapping information

8. **Documentation**
   - Update ERROR_HANDLING.md with source mapping information
   - Document source mapping in user documentation
   - Add examples and guidelines for working with source-mapped errors

## Detailed Implementation

### Directive Handler Integration

For each directive handler that imports or embeds content, we'll add source mapping:

```typescript
// Example implementation for EmbedDirectiveHandler.ts
import { registerSource, addMapping } from '@core/utils/sourceMapUtils';

// In the execute method
async execute(node: DirectiveNode, context: DirectiveContext): Promise<DirectiveResult> {
  // ... existing code ...
  
  // After reading file content
  const content = await this.fileSystemService.readFile(resolvedPath);
  
  // Register the source file with source mapping
  registerSource(resolvedPath, content);
  
  // Create mapping between the embedded file and the current location
  if (node.location && node.location.start) {
    addMapping(
      resolvedPath,
      1, // Start at line 1 of the embedded file
      1, // Start at column 1
      node.location.start.line,
      node.location.start.column
    );
  }
  
  // ... rest of existing code ...
}
```

### Error Enhancement Integration

We'll update error handling in key services to enhance errors with source information:

```typescript
// Example for OutputService.ts
import { enhanceMeldErrorWithSourceInfo } from '@core/utils/sourceMapUtils';

// In the convertToXML method
private async convertToXML(
  nodes: MeldNode[],
  state: IStateService,
  options?: OutputOptions
): Promise<string> {
  try {
    // ... existing code ...
    
    try {
      return llmxml.toXML(markdown);
    } catch (error) {
      // Wrap the error
      const meldError = new MeldOutputError(
        `LLMXML error: ${error instanceof Error ? error.message : String(error)}`,
        'xml',
        { cause: error instanceof Error ? error : undefined }
      );
      
      // Enhance with source mapping information
      throw enhanceMeldErrorWithSourceInfo(meldError);
    }
  } catch (error) {
    // If it's already a MeldError, enhance it with source info
    if (error instanceof MeldError) {
      throw enhanceMeldErrorWithSourceInfo(error);
    }
    
    // Otherwise, create a new MeldError and enhance it
    const meldError = new MeldOutputError(
      `Failed to convert output: ${error instanceof Error ? error.message : String(error)}`,
      'xml',
      { cause: error instanceof Error ? error : undefined }
    );
    
    throw enhanceMeldErrorWithSourceInfo(meldError);
  }
}
```

### CLI Integration

We'll update the CLI to support the debug flag and include source information in error messages:

```typescript
// Example for CLIService.ts
import { getSourceMapDebugInfo } from '@core/utils/sourceMapUtils';

// Add CLI options
const options = {
  // ... existing options
  debugSourceMaps: argv['debug-source-maps'] || false
};

// If debug flag is set, print source mapping debug info
if (options.debugSourceMaps) {
  console.log('Source mapping debug information:');
  console.log(getSourceMapDebugInfo());
}

// In error handling
try {
  // ... existing code ...
} catch (error) {
  if (error instanceof MeldError) {
    const errorMsg = error.filePath 
      ? `Error in ${error.filePath}:${error.context?.sourceLocation?.line || '?'}: ${error.message}`
      : `Error: ${error.message}`;
    
    console.error(errorMsg);
    // ... existing error handling ...
  }
}
```

## Testing Strategy

1. **Unit Tests**
   - Test the `SourceMapService` mapping functionality
   - Test error enhancement utilities
   - Test location extraction and pattern matching

2. **Integration Tests**
   - Test error mapping with embedded content
   - Test error mapping with imported content
   - Test nested import/embed scenarios

3. **Error Handling Tests**
   - Test that errors are properly enhanced with source information
   - Test error presentation in both strict and permissive modes

## Documentation Updates

The ERROR_HANDLING.md document will be updated to include a new section on source mapping:

```markdown
## Source Mapping for Error Locations

Meld now supports source mapping for error locations, helping trace errors back to their original source files.

### How Source Mapping Works

1. **Registration**: When files are loaded, they're registered with the source mapping system
2. **Mapping Creation**: As content is combined, mappings are created between original and output locations
3. **Error Enhancement**: When errors occur, they're enhanced with original source information
4. **User-Friendly Messages**: Error messages include the file and line where the issue originated

### Debugging Source Maps

Use the `--debug-source-maps` flag with the CLI to output source mapping information:

```bash
meld examples/api-demo.meld --debug-source-maps
```
```

## Conclusion

This implementation plan provides a comprehensive approach to implementing source mapping in Meld that:

1. Works with the existing error handling system
2. Integrates with import and embed directives
3. Enhances both LLMXML and meld-ast parser errors
4. Provides debugging tools
5. Maintains compatibility with both strict and permissive modes

By using a simple singleton approach rather than dependency injection, we avoid the complexity and issues encountered in previous attempts, while ensuring that the source mapping functionality is accessible throughout the application.
