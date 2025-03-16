# Newlines Handling in Meld Output

This document outlines the architecture and implementation details for newlines handling in Meld's output system following the standardization on transformation mode (output-literal mode) and the introduction of Prettier integration.

## Architecture Overview

### Terminology

- **Transformation Mode**: The mode where directives are replaced with their transformed results and original document formatting is preserved exactly as-is. This is now the only supported mode.
- **Output-Normalized Mode**: (Deprecated) Previously supported mode that applied custom markdown formatting rules. Has been removed in favor of using Prettier for optional formatting.
- **Pretty Formatting**: Optional formatting using Prettier that can be applied to preserve consistent markdown styling without affecting the underlying transformation architecture.

### Implementation Components

1. **OutputService**: The central service responsible for converting Meld AST nodes into different output formats. It now always uses transformation mode for consistent handling.

2. **FormattingContext**: A context tracking object that preserves formatting information during content transformation:
   - `transformationMode`: Always true now (kept for backward compatibility)
   - `isOutputLiteral`: Always true now (kept for backward compatibility)
   - `contextType`: Tracks whether in 'inline' or 'block' context
   - `atLineStart`/`atLineEnd`: Tracks position within line for proper newline handling
   - `indentation`: Tracks current indentation level
   - `parentContext`: Reference to parent context for inheritance

3. **AlwaysTransformedStateService**: A wrapper around IStateService that ensures transformation is always enabled, enforcing consistent behavior throughout the codebase.

4. **Prettier Integration**: Optional formatting using Prettier that can be applied to the output using the `pretty` option.

## Newlines Handling Logic

1. **Basic Principle**: Original document formatting is always preserved exactly as-is in the output.

2. **Directive Boundaries**: Special handling occurs at directive boundaries:
   - When a directive is transformed, its content replaces the directive while maintaining proper context
   - Newlines at the beginning/end of directives are preserved according to the original document

3. **Variable Substitution**: When variables are embedded in text, their format is preserved:
   - For inline variables, no additional newlines are added
   - Block-level variables maintain their original newline structure

4. **Directive Content**: The content of directives is preserved exactly as-is:
   - No additional formatting is applied unless the `pretty` option is used
   - Original indentation and newlines are maintained

## Usage

### Standard Output (Preserves Exact Formatting)

```typescript
// API usage
const result = await runMeld(content);

// CLI usage
meld input.meld
```

### Pretty Formatting with Prettier

```typescript
// API usage
const prettyResult = await runMeld(content, { pretty: true });

// CLI usage
meld --pretty input.meld
```

## Key Design Decisions

1. **Standardization on Transformation Mode**: We standardized on a single output mode (transformation mode) to simplify the codebase and ensure consistent behavior.

2. **External Formatting Tool**: Rather than maintaining custom markdown formatting logic, we introduced Prettier integration for optional formatting.

3. **Backward Compatibility**: While we removed output-normalized mode, we maintained backward compatibility by:
   - Keeping method signatures and property names
   - Adding new methods that wrap the old ones
   - Using `@deprecated` annotations to indicate future changes

4. **Consistent Terminology**: We standardized on "transformation mode" terminology throughout the codebase for clarity.

## Implementation Notes

### Phase 1: Prettier Integration

- Added Prettier as a dependency
- Created `formatWithPrettier` utility function
- Added `pretty` option to relevant interfaces
- Updated CLI and API to support the `pretty` flag

### Phase 2: Output-Normalized Mode Removal

- Removed conditional branches that checked for transformation mode
- Updated `handleNewlines` to always preserve content exactly as-is
- Created `AlwaysTransformedStateService` to ensure transformation is always enabled
- Removed regex-based workarounds in the API layer

### Phase 3: Terminology Standardization

- Updated documentation to consistently use "transformation mode"
- Added `@deprecated` annotations to transformation-related methods and properties
- Updated test cases to expect transformation behavior
- Ensured consistent behavior throughout the codebase

## Testing

The transformation and newlines handling is extensively tested through various test suites:

1. **Unit Tests**: Test individual components like OutputService and directive handlers
2. **Integration Tests**: Test the complete pipeline across multiple services
3. **Edge Cases**: Test various combinations of newlines and formatting
4. **Transformation Tests**: Test directive transformations in different contexts
5. **Prettier Integration Tests**: Test the pretty formatting option

## Future Considerations

1. **Complete Removal of Deprecated Properties**: In a future major version, deprecated properties and methods related to transformation mode could be completely removed.

2. **Performance Optimizations**: With the simplified architecture, there may be opportunities for further performance optimizations.

3. **Enhanced Formatting Options**: Additional formatting options could be supported through Prettier configuration.