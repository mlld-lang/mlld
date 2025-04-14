# Execution Requirements for Embed Directive

## Core Type Discrimination Requirements

1. Runtime type detection must correctly identify the three embed subtypes:
   - `embedPath`: For embedding file content via path
   - `embedVariable`: For embedding content from variables
   - `embedTemplate`: For embedding template content with variable substitution

2. Each embed subtype requires distinct runtime handling with appropriate context settings:
   ```typescript
   type EmbedType = 'path' | 'variable' | 'template';
   ```

## Path Resolution Requirements

1. Path embeds must resolve paths relative to the current file location
   - Must support both absolute and relative paths
   - Should support path variables (e.g., `{{variable}}` within paths)

2. Path resolution must respect the current working directory when specified
   - Must support the `cwd` flag for paths

3. Path validation should enforce security constraints
   - Check for allowed roots/directories
   - Validate path is within permitted boundaries

4. Path normalization must handle platform-specific path separators
   - Convert backslashes/forward slashes appropriately

## Variable Resolution Requirements

1. Variable embeds must disable path prefixing
   - `disablePathPrefixing: true` and `preventPathPrefixing: true` flags must be set
   - Variable content should never be treated as a path

2. Variable resolution must support field/property access
   - Support dot notation (e.g., `{{variable.property}}`)
   - Support array indexing (e.g., `{{variable[0]}}`)
   - Handle nested properties (e.g., `{{variable.nested.property}}`)

3. Variable embeds must support different variable types
   - Text variables: `{{textVar}}`
   - Data variables: `{{dataVar}}`
   - Should prevent path variables in variable embeds

4. Field access requires specific error handling
   - Handle missing fields gracefully
   - Provide clear error messages for invalid access attempts

## Template Processing Requirements

1. Template embeds must resolve variables within template content
   - Process content between `[[` and `]]` markers
   - Parse and substitute all `{{variable}}` references

2. Template formatting must be preserved
   - Option to ignore first newline in template content
   - Respect whitespace when `preserveFormatting` is true

3. Template resolution requires the same context as variable embeds
   - `disablePathPrefixing: true`
   - `preventPathPrefixing: true`
   - Allow text and data variables, but not path variables

## File Reading Requirements

1. File reading must handle errors gracefully
   - Provide meaningful error messages for missing files
   - Handle permission issues appropriately

2. Content must be returned as string
   - Support different encodings (UTF-8 default)
   - Handle binary vs text content appropriately

3. File reading should include metadata when requested
   - File path information
   - MIME type detection
   - Content size

## Context Requirements

1. Resolution context must be specialized for each embed type
   ```typescript
   interface ResolutionContext {
     contextType: 'pathEmbed' | 'variableEmbed' | 'templateEmbed';
     currentFilePath?: string;
     state: StateServiceLike;
     // Type-specific properties...
   }
   ```

2. Variable embed context requires specific flags
   ```typescript
   {
     isVariableEmbed: true,
     disablePathPrefixing: true,
     preventPathPrefixing: true,
     allowedVariableTypes: {
       text: true,
       data: true,
       path: false,
       command: true
     }
   }
   ```

3. Template embed context requires similar flags to variable context
   ```typescript
   {
     isTemplateEmbed: true,
     disablePathPrefixing: true,
     preventPathPrefixing: true
   }
   ```

4. Path embed context must enable path resolution
   ```typescript
   {
     isPathEmbed: true,
     allowedVariableTypes: {
       path: true
     }
   }
   ```

## Section and Formatting Options

1. All embed types must support section targeting
   - Support `section` parameter to extract specific sections
   - Support `headingLevel` to control heading depth
   - Support `underHeader` for content under specific headers

2. Formatting options must be respected
   - `preserveFormatting` flag to maintain whitespace
   - Support for fuzzy section matching via `fuzzy` parameter

## Error Handling Requirements

1. Runtime errors must provide clear context
   - Identify which embed type caused the error
   - Include source location information
   - Provide actionable error messages

2. Fallback behavior must be defined for each error case
   - Empty string or error message for missing variables
   - Appropriate error for invalid paths
   - Clear message for template parsing errors