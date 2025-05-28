# Error Reporting System

The mlld error reporting system provides rich, contextual error messages with source code snippets, smart file paths, and visual formatting to enhance debugging experience.

## Overview

The error system is built on a foundation of specialized error classes that extend `MlldError`, each providing detailed location information and contextual messaging. The system automatically extracts source code context and formats errors for optimal readability in both CLI and API environments.

## Architecture

### Core Components

1. **Error Classes** (`core/errors/`) - Specialized error types with detailed context
2. **Location Tracking** - Source location information with line/column precision
3. **Source Context Extraction** - Automatic extraction of relevant source code snippets
4. **Smart Path Resolution** - Intelligent relative/absolute path handling
5. **Format Selection** - Unified CLI and API error formatting

### Data Flow

```
Parser → AST (with locations) → Interpreter → Error Classes → Enhanced Display
                                                     ↓
                                        Source Context Extractor
                                                     ↓
                                         Error Display Formatter
                                                     ↓
                                           Smart Path Resolver
                                                     ↓
                                         Format Selector (CLI/API)
```

## Error Display Format

### Standard Error Format

```
ErrorType: Clear description of what went wrong

  ./file.mlld:2:1
  1 | @text author = "First Author"
  2 | @text author = "Second Author"
      ^
  3 | @add @author

Details:
  variableName: author
  existingLocation: ./file.mlld:1:1
  newLocation: ./file.mlld:2:1

💡 Helpful suggestion for fixing the issue
```

### Multi-Location Errors (Import Conflicts)

```
VariableRedefinitionError: Variable 'title' is already imported and cannot be redefined

  config.mld:2:1
  2 | @text title = "Config Title"
    |       ^^^^^ imported here
    
  main.mld:3:1  
  3 | @text title = "Local Title"
    |       ^^^^^ redefinition attempt

Consider using import aliases: @import { title as configTitle } from "config.mld"
```

## Key Features

### Source Context Display

- **Line Numbers**: Shows 1-2 lines of context around the error
- **Visual Indicators**: Uses arrows (`^`) and highlighting to pinpoint exact locations
- **Color Coding**: Red for errors, gray for context, blue for file paths
- **Performance Optimized**: Intelligent caching with TTL and LRU eviction

### Smart File Paths

- **Relative Paths**: Shows `./file.mlld` when within project structure
- **Absolute Fallback**: Uses full paths when relative paths aren't meaningful
- **Cross-Project Imports**: Handles files outside the current project gracefully

### Error Types

#### Variable Redefinition
```typescript
// Same file redefinition
new VariableRedefinitionError(
  variableName,
  existingLocation,
  newLocation
);

// Import conflict
new VariableRedefinitionError(
  variableName,
  existingLocation,
  newLocation,
  'imported' // context type
);
```

#### Parse Errors
```typescript
new MlldParseError(
  'Invalid syntax in directive',
  location,
  { expectedTokens: ['[', 'identifier'] }
);
```

#### File System Errors
```typescript
new MlldFileNotFoundError(
  filePath,
  location,
  { suggestion: 'Check file path and permissions' }
);
```

## Implementation

### Creating Custom Errors

```typescript
import { MlldError } from '@core/errors';

export class CustomError extends MlldError {
  constructor(
    message: string,
    location?: InterpreterLocation,
    details?: Record<string, any>
  ) {
    super(message, location, details);
    this.name = 'CustomError';
  }
}
```

### Using in Code

```typescript
// Throw with location context
throw new VariableRedefinitionError(
  variableName,
  existingLocation,
  currentLocation
);

// Error handling preserves context
try {
  // ... operation
} catch (error) {
  if (error instanceof MlldError) {
    // Rich error information available
    console.log(error.formatForDisplay());
  }
  throw error; // Re-throw with context preserved
}
```

### API Integration

The error system provides both formatted text and structured data:

```typescript
import { ErrorFormatSelector } from '@core/utils/errorFormatSelector';

const formatter = new ErrorFormatSelector();

// For CLI display
const formatted = formatter.formatError(error, { target: 'cli' });

// For API responses
const apiResponse = formatter.formatError(error, { 
  target: 'api',
  includeSourceContext: true 
});
```

## Configuration

### Source Context Settings

- **Cache TTL**: 1 minute for file content caching
- **Cache Size**: Maximum 100 files in LRU cache
- **Context Lines**: 1-2 lines before/after error location
- **Performance**: Lazy-loading only when errors occur

### Path Resolution

- **Project Root Detection**: Automatic detection via `package.json`, `.git`, etc.
- **Relative Path Preference**: Shows `./file.mlld` when within project
- **Cross-Project Handling**: Graceful fallback to absolute paths

## Testing

### Error Test Framework

Tests are written in markdown format in `tests/cases/exceptions/`:

```markdown
# Variable Redefinition Error

@text author = "First"
@text author = "Second"
```

Expected error format is validated automatically, ensuring consistent error display across the system.

### Manual Testing Checklist

- [ ] Variable redefinition scenarios (same file)
- [ ] Import conflict scenarios (cross-file)
- [ ] Parse error display with source context
- [ ] File not found errors with suggestions
- [ ] Edge cases (missing files, invalid locations)
- [ ] CLI color output formatting
- [ ] API structured error responses

## Performance Considerations

### Caching Strategy

- **File Content**: TTL-based cache (1 minute) with LRU eviction
- **Path Resolution**: Cached project root detection
- **Lazy Loading**: Source context only extracted when errors occur

### Memory Management

- **Cache Limits**: Maximum 100 files to prevent memory bloat
- **Automatic Cleanup**: TTL expiration and LRU eviction
- **Efficient Storage**: Only store necessary source lines, not entire files

## Best Practices

### Error Creation

1. **Always provide location** when available from parser/interpreter
2. **Include helpful details** in the details object for debugging
3. **Use appropriate error types** for different categories of issues
4. **Provide actionable suggestions** in error messages when possible

### Error Handling

1. **Preserve error context** when re-throwing or wrapping errors
2. **Use structured logging** to capture error details for debugging
3. **Format appropriately** for CLI vs API consumption
4. **Test error scenarios** as part of regular development workflow

### Performance

1. **Lazy-load source context** only when displaying errors
2. **Cache file reads** to avoid repeated disk access
3. **Use relative paths** when possible for cleaner output
4. **Limit context scope** to relevant lines around errors

## Future Enhancements

### Planned Improvements

- **Type Consolidation**: Unify `InterpreterLocation` and `ErrorSourceLocation` types
- **Enhanced Testing**: Comprehensive test coverage for all error formatting features
- **Documentation Examples**: API usage examples with real error scenarios
- **IDE Integration**: Support for error format parsing in development tools

### Extensibility

The system is designed for easy extension:

- **New Error Types**: Simply extend `MlldError` with specific context
- **Custom Formatters**: Implement additional output formats (JSON, XML, etc.)
- **Enhanced Context**: Add more sophisticated source analysis
- **Integration Points**: API hooks for external error handling systems