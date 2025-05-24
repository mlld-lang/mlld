# Validation Requirements for @embed Directive

## Type System and Discriminated Unions

1. Implement a discriminated union type for the three @embed subtypes:
   ```typescript
   type EmbedDirective = PathEmbed | VariableEmbed | TemplateEmbed;
   
   interface BaseEmbed {
     kind: 'embed';
     embedType: 'path' | 'variable' | 'template';
     section?: string;
     headingLevel?: string;
     underHeader?: string;
     fuzzy?: string;
     preserveFormatting?: boolean;
   }
   
   interface PathEmbed extends BaseEmbed {
     embedType: 'path';
     path: string | StructuredPath;
     allowsNewlines: false;
   }
   
   interface VariableEmbed extends BaseEmbed {
     embedType: 'variable';
     variable: VariableReference;
     allowsNewlines: false;
   }
   
   interface TemplateEmbed extends BaseEmbed {
     embedType: 'template';
     content: string;
     allowsNewlines: true;
     ignoreFirstNewline: boolean;
   }
   ```

## Subtype Detection and Validation

2. Validate correct subtype detection based on syntax:
   - Path embed: `@embed [path/to/file]`
   - Variable embed: `@embed {{variable}}`
   - Template embed: `@embed [[template content]]`

3. Enforce newline restrictions by subtype:
   - Path embeds: No newlines allowed
   - Variable embeds: No newlines allowed
   - Template embeds: Newlines allowed, with optional first newline ignoring

## Variable Reference Validation

4. Standardize variable reference structure:
   ```typescript
   interface VariableReference {
     type: 'VariableReference';
     identifier: string;
     valueType: 'text' | 'data' | 'path' | 'command';
     fieldPath?: string;
     isVariableReference: true;
     disablePathPrefixing?: boolean;
   }
   ```

5. Validate field access patterns in variable references:
   - Dot notation: `{{variable.field.subfield}}`
   - Bracket notation: `{{variable['field']['subfield']}}`
   - Mixed notation: `{{variable.field['subfield']}}`

## Parameter Validation

6. Validate common parameters for all embed types:
   - `section`: String identifier for a specific section
   - `headingLevel`: Valid heading level (1-6)
   - `underHeader`: String identifier for a header
   - `fuzzy`: Boolean or string for fuzzy matching
   - `preserveFormatting`: Boolean for preserving formatting

7. Validate subtype-specific parameters:
   - Path embeds: `path` parameter required and valid
   - Variable embeds: `variable` parameter required and valid
   - Template embeds: `content` parameter required and valid

## Runtime Validation

8. Path embed runtime checks:
   - Verify file exists at resolved path
   - Validate section/header exists if specified
   - Check permissions for file access

9. Variable embed runtime checks:
   - Verify variable exists in current context
   - Validate variable value is appropriate for embedding
   - Check field access is valid for the variable's structure

10. Template embed runtime checks:
    - Validate template syntax
    - Verify all variables in template exist and are accessible
    - Check for recursive embedding that could cause infinite loops

## Resolution Context Validation

11. Enforce properly typed resolution contexts:
    ```typescript
    interface ResolutionContextOptions {
      currentFilePath?: string;
      state: IStateService;
      isVariableEmbed?: boolean;
      disablePathPrefixing?: boolean;
      allowedVariableTypes?: {
        text?: boolean;
        data?: boolean;
        path?: boolean;
        command?: boolean;
      };
      strict?: boolean;
    }
    ```

12. Validate context configuration based on embed type:
    - Path embeds: Appropriate file resolution context
    - Variable embeds: Appropriate variable resolution context
    - Template embeds: Appropriate template resolution context with variable support

## Error Handling

13. Provide specific, actionable error messages for each validation failure:
    - Syntax errors: Clear indication of expected syntax
    - Runtime errors: Specific information about what couldn't be resolved
    - Type errors: Explanation of type mismatches