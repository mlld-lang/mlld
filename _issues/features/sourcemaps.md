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

I should revise the implementation plan to provide a simpler approach that doesn't rely on Inversify, making it more lightweight and easier to integrate without dependency issues.</think># Revised Source Mapping Implementation Plan

You're absolutely right - we don't need to use Inversify's dependency injection for this feature. The core functionality of source mapping is straightforward and can be implemented without the complexity of DI containers and decorators.

## Why Inversify Caused Problems

The problems we encountered were primarily due to:
1. Using `@injectable()` and `@inject()` decorators requiring experimental decorator support
2. Complex dependency chains through the DI container
3. Path alias resolution issues in tests

## Simpler Implementation Approach

Here's a revised approach that avoids dependency injection:

### 1. Create a Plain Source Mapping Service

```typescript
// core/SourceMapService.ts
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

  registerSource(filePath: string, content: string): void {
    // Split content into lines for easier line-based access
    this.sources.set(filePath, content.split('\n'));
  }

  addMapping(source: SourceLocation, combinedLine: number, combinedColumn: number): void {
    this.mappings.push({
      source,
      combined: { line: combinedLine, column: combinedColumn }
    });
  }

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

  getDebugInfo(): string {
    return this.mappings.map(m => 
      `${m.source.filePath}:${m.source.line}:${m.source.column} -> combined:${m.combined.line}:${m.combined.column}`
    ).join('\n');
  }
}
```

### 2. Use a Module-Level Instance (Singleton Pattern)

Instead of using DI, we can use a module-level singleton pattern:

```typescript
// core/sourceMapping.ts
import { SourceLocation, SourceMapService } from './SourceMapService';

// Create a single instance to be used throughout the application
export const sourceMapService = new SourceMapService();

// Helper functions that work with the singleton instance
export function registerSource(filePath: string, content: string): void {
  sourceMapService.registerSource(filePath, content);
}

export function addMapping(source: SourceLocation, combinedLine: number, combinedColumn: number): void {
  sourceMapService.addMapping(source, combinedLine, combinedColumn);
}

export function findOriginalLocation(combinedLine: number, combinedColumn: number): SourceLocation | null {
  return sourceMapService.findOriginalLocation(combinedLine, combinedColumn);
}

export function getDebugInfo(): string {
  return sourceMapService.getDebugInfo();
}

// Helper to enhance error messages with source information
export function enhanceErrorWithSourceInfo(error: Error): Error {
  // Extract line/column from error message if available
  const lineColPattern = /(?:at\s+)?(?:line\s+)?(\d+)(?:,\s+column\s+|:)(\d+)/i;
  const match = error.message.match(lineColPattern);
  
  if (match && match.length >= 3) {
    const line = parseInt(match[1], 10);
    const column = parseInt(match[2], 10);
    
    // Try to find the original source location
    const sourceLocation = findOriginalLocation(line, column);
    
    if (sourceLocation) {
      return new Error(
        `${error.message}\n\nOriginal source: ${sourceLocation.filePath}:${sourceLocation.line}:${sourceLocation.column}`
      );
    }
  }
  
  return error;
}
```

### 3. Integration with Directive Handlers

For the EmbedDirectiveHandler, we can integrate without dependency injection:

```typescript
// Inside EmbedDirectiveHandler.ts
import { registerSource, addMapping } from '@core/sourceMapping';

// In the execute method:
async execute(node: DirectiveNode, context: DirectiveContext): Promise<DirectiveResult> {
  // ... existing code ...
  
  // Read file content
  const content = await this.fileSystemService.readFile(resolvedPath);
  
  // Register the source file with source mapping
  registerSource(resolvedPath, content);
  
  // If we know the location of the embed directive, create a mapping
  if (node.location && node.location.start) {
    addMapping(
      {
        filePath: resolvedPath,
        line: 1, // Start at line 1 of the embedded file
        column: 1
      },
      node.location.start.line,
      node.location.start.column
    );
  }
  
  // ... rest of existing code ...
}
```

### 4. Integration with Output Service for LLMXML Errors

Similarly, we can enhance LLMXML errors without dependency injection:

```typescript
// Inside OutputService.ts
import { enhanceErrorWithSourceInfo } from '@core/sourceMapping';

// In the convertToXML method:
private async convertToXML(
  nodes: MeldNode[],
  state: IStateService,
  options?: OutputOptions
): Promise<string> {
  try {
    // ... existing code ...
    
    try {
      return llmxml.toXML(processedMarkdown);
    } catch (processingError) {
      // Enhance the error with source mapping information
      const enhancedError = enhanceErrorWithSourceInfo(
        processingError instanceof Error ? processingError : new Error(String(processingError))
      );
      throw enhancedError;
    }
  } catch (error) {
    // Enhance the error with source mapping information
    const enhancedError = error instanceof Error ? 
      enhanceErrorWithSourceInfo(error) : 
      new Error(String(error));
    
    throw new MeldOutputError(
      'Failed to convert output',
      'xml',
      { cause: enhancedError }
    );
  }
}
```

### 5. Integration with Error Handling System

Update the CLI service to support source mapping without dependency injection:

```typescript
// Inside CLIService.ts
import { getDebugInfo } from '@core/sourceMapping';

// Add CLI options to print debug info:
if (argv['debug-source-maps']) {
  console.log('Source mapping debug information:');
  console.log(getDebugInfo());
}
```

## Implementation Guidelines

1. **Start Simple**: Begin with a straightforward implementation of the SourceMapService without DI

2. **Use Module Exports**: Export a singleton instance and helper functions 

3. **Gradual Integration**: Integrate with EmbedDirectiveHandler and ImportDirectiveHandler first

4. **Error Enhancement**: Add error enhancement to the OutputService for LLMXML errors

5. **Debug Support**: Add command-line options to show mapping debug info

6. **Path Aliases**: Continue using path aliases (like `@core/`) for imports, as they make code more maintainable

7. **Testing**: Add specific tests for source mapping functionality

This approach avoids the complexity of dependency injection while still providing the same functionality. It's more lightweight, easier to understand, and less likely to cause issues with build tools and test frameworks.

The core of source mapping is just math and string manipulation - all we're doing is tracking source locations and transforming error messages, which doesn't require DI. This simpler approach should work well with your existing codebase while avoiding the path resolution issues we encountered.
