# Source Map Enhancements for Imported Content

## Issue Description

The current source mapping system doesn't properly track or report error locations for imported content, making it difficult to debug issues in files included via `@import` directives. When an error occurs in imported content, the error location is reported relative to the imported file rather than providing context about both the original location and the importing context.

## Current Behavior

1. When an error occurs in imported content (e.g., at line 5 of an imported file), the error is reported with the line/column from the imported file.
2. There is no clear indication in the error message about:
   - Which file the error originated from
   - Where the `@import` directive was located in the parent file
   - The relationship between the error location and the original importing point

## Observed Example

```
Error executing import directive: Parse error: Parse error: Expected "$", ">>", "`", "{{", or end of input but "{" found. at line 5, column 31
```

This error message indicates a problem at line 5, column 31, but doesn't clearly state which file this is in or how it relates to the file containing the `@import` directive.

## Root Causes

1. **Incomplete Mapping Registration**: When importing content, source mappings are not consistently registered between the original file and the imported content.

2. **One-way Mapping**: The current system primarily maps from the combined/processed content back to sources, but doesn't fully track the importing hierarchy.

3. **Error Enhancement Limitations**: The `enhanceMeldErrorWithSourceInfo` function doesn't have sufficient context about the importing relationship to provide clear error messages.

4. **Missing File Context**: Error messages don't include both the imported file path and the original file containing the `@import` directive.

## Why This Matters for Imports

Unlike `@embed` (which should treat content as literal text), the `@import` directive actively interprets and executes Meld code from another file. This means:

1. Complex syntax errors can occur within imported files
2. Errors may appear in imported files that import other files (nested imports)
3. Variables and directives in imported files interact with the parent context
4. For proper debugging, understanding the entire import chain is essential

## Proposed Enhancements

### 1. Hierarchical Source Mapping

Implement a hierarchical source mapping system that tracks the full import chain:

```typescript
interface SourceMappingContext {
  filePath: string;
  importedFrom?: {
    filePath: string;
    directiveLocation: SourceLocation;
  };
}
```

### 2. Enhanced Error Reporting

Modify error reporting to include context about both the imported file and the importing location:

```
Error in imported file 'examples/example-import.meld' at line 5, column 31
  Imported from 'examples/example.meld' at line 4, column 2
  Error: Expected "$", ">>", "`", "{{", or end of input but "{" found.
```

### 3. Visual Error Indication

When displaying errors in the CLI, show both the relevant snippets from:
- The imported file where the error occurred
- The location in the original file where the `@import` directive was used

### 4. Debuggability Improvements

Enhance the `debugSourceMapForLocation` function to:
- Show the full import chain
- Provide more context about how locations are mapped
- Make the debug output more user-friendly for complex importing scenarios

## Implementation Approach

1. **Modify ImportDirectiveHandler**: When importing content, register comprehensive source mappings:
   ```typescript
   contentLines.forEach((line, index) => {
     sourceMapUtils.addMapping(
       sourceFilePath,
       index + 1,
       0,
       targetLine + index,
       0,
       {
         importedFrom: {
           filePath: context.filePath,
           directiveLocation: node.location
         }
       }
     );
   });
   ```

2. **Enhance MeldError**: Add support for tracking the full import chain:
   ```typescript
   interface MeldErrorOptions {
     // ...existing options
     importingContext?: {
       importChain: Array<{
         filePath: string;
         location: SourceLocation;
       }>;
     };
   }
   ```

3. **Improve Error Display**: Update error display logic to show the full context:
   ```typescript
   function formatErrorWithContext(error: MeldError): string {
     let message = error.message;
     
     if (error.importingContext?.importChain) {
       message += '\n\nImport chain:\n';
       error.importingContext.importChain.forEach((context, index) => {
         message += `  ${index+1}. ${context.filePath} at line ${context.location.line}, column ${context.location.column}\n`;
       });
     }
     
     return message;
   }
   ```

## Benefits

1. **Clearer Error Messages**: Users will immediately understand where an error occurred in the import hierarchy
2. **Improved Debugging**: Easier to trace issues through multiple levels of imported content
3. **Better Developer Experience**: Reduced time spent trying to locate the actual source of errors
4. **Support for Complex Documents**: Makes it practical to debug documents with multiple layers of imported content

## Related Issues

This feature enhancement is related to but distinct from the "Embed Directive Should Treat Files as Strings" issue:
- The embed directive issue focuses on how content is included (as literal text)
- This issue focuses on how errors are tracked and reported in interpreted imported content 