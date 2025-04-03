# Consolidated Requirements for @embed Directive Implementation

## Core Type Structure

- **Discriminated Union Pattern**: Implement a discriminated union with an `embedType` field to distinguish between the three subtypes: 'path', 'variable', and 'template'.

- **Base Interface**: Create a common base interface with shared properties across subtypes:
  ```typescript
  interface BaseEmbed {
    embedType: 'path' | 'variable' | 'template';
    section?: string;        // For section targeting
    headingLevel?: number;   // Control heading depth (1-6)
    underHeader?: string;    // Content under specific headers
    fuzzy?: boolean | string; // Fuzzy section matching
    preserveFormatting?: boolean; // Maintain whitespace
    sourceLocation?: SourceLocation; // For error reporting
  }
  ```

- **Subtype-Specific Interfaces**:
  ```typescript
  interface PathEmbed extends BaseEmbed {
    embedType: 'path';
    path: string | PathObject;
    // No newlines allowed
  }

  interface VariableEmbed extends BaseEmbed {
    embedType: 'variable';
    variableReference: VariableReference;
    disablePathPrefixing: true;
    // No newlines allowed
  }

  interface TemplateEmbed extends BaseEmbed {
    embedType: 'template';
    templateContent: string;
    ignoreFirstNewline?: boolean;
    // Newlines allowed
  }
  ```

## Execution Context Requirements

- **Runtime Type Detection**: Implement a robust detection mechanism for the three embed subtypes:
  ```typescript
  function determineEmbedType(node: DirectiveNode): 'path' | 'variable' | 'template' {
    // Implementation logic for detecting the embed type
  }
  ```

- **Resolution Context Configuration**: Each embed type requires a specialized resolution context:
  ```typescript
  // For variable embeds
  const variableContext = ResolutionContextFactory.create({
    isVariableEmbed: true,
    disablePathPrefixing: true,
    preventPathPrefixing: true,
    allowedVariableTypes: {
      text: true,
      data: true,
      path: false
    }
  });

  // Similar context for template embeds
  // Different context for path embeds (with path resolution enabled)
  ```

## Path Resolution

- **Path Resolution Logic**: Resolve paths relative to the current file location, supporting both absolute and relative paths.

- **Path Variable Support**: Support path variables (e.g., `$HOME/path`) within path embeds.

- **Security Constraints**: Validate paths are within permitted boundaries and check for allowed roots/directories.

- **Platform Compatibility**: Handle platform-specific path separators appropriately.

## Variable Resolution

- **Variable Reference Structure**:
  ```typescript
  interface VariableReference {
    identifier: string;
    valueType: 'text' | 'data';
    fieldPath?: string[] | number[];  // For property/array access
  }
  ```

- **Field Access Support**: Support dot notation, bracket notation, and mixed notation for accessing fields.

- **Path Prefixing Prevention**: Variable embeds must never have path prefixing applied.

## Template Processing

- **Variable Resolution in Templates**: Process all `{{variable}}` references within template content.

- **First Newline Handling**: Option to ignore the first newline in template content for better formatting.

- **Whitespace Preservation**: Respect whitespace when `preserveFormatting` is true.

## File Handling

- **File Reading**: Handle different encodings with UTF-8 as default, and gracefully handle file reading errors.

- **Section Targeting**: Support extracting specific sections from embedded files.

## Error Handling

- **Contextual Error Messages**: Provide clear error messages that identify the embed type and include source location.

- **Fallback Behavior**: Define specific fallback behavior for each error case (missing variables, invalid paths, etc.).

## Validation Requirements

- **Syntax Validation**: Enforce proper syntax for each embed type, including newline restrictions.

- **Runtime Validation**: Verify files exist, variables exist, and templates have valid syntax before attempting to embed.

- **Parameter Validation**: Validate all parameters according to their expected types and constraints.

## Implementation Decision Notes

1. **Combined Discriminated Union**: The discriminated union pattern provides the best balance of type safety and runtime flexibility, allowing for exhaustive switch/case handling with TypeScript's type narrowing.

2. **Standardized Context Factory**: Using a factory pattern for resolution contexts ensures consistent configuration across the codebase.

3. **Strict Newline Handling**: The strict rules about newlines (forbidden in path and variable embeds, allowed in templates) are important for maintaining consistent parsing behavior.

4. **Field Access Standardization**: Standardizing field access patterns across variable references improves consistency and simplifies implementation.

5. **Error Context Priority**: Providing rich error context (embed type, source location, specific validation failure) is prioritized for developer experience.