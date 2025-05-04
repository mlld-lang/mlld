# Meld Syntax Standardization

This document outlines the standardization of Meld syntax to make it more intuitive, consistent, and aligned with modern programming language patterns while maintaining its security model.

## Variable Reference Syntax

We maintain two distinct variable reference syntaxes, each with specific security implications:

1. **Path and Command Variables**: Use `$var` syntax
   - Used in contexts that require security constraints (paths, commands)
   - Path variables must be rooted in `$HOMEPATH` or `$PROJECTPATH`
   - Command variables have execution context security constraints
   - AST clearly identifies these as security-sensitive variable references

2. **Text and Data Variables**: Use `{{var}}` syntax
   - Used for general content interpolation
   - No inherent security constraints (though content validation may apply)
   - AST identifies these as general interpolation variables

This dual approach ensures that security-sensitive contexts are visually distinct and properly constrained in the implementation.

## Directive Syntax Standardization

### Import Directive

Update to more familiar JS-like syntax:

```
@import { var, otherVar } from "path/to/file"
@import { * } from "path/to/file"
```

### Embed Directive

Standardize on quoted paths:

```
@embed "path/to/file"
@embed "$pathVar"
@embed "path/with/{{textVar}}"
```

### General Content Rules

1. **Quotes for Literals**:
   - Paths and string literals should use quotes: `"path/to/file"` or `"literal text"`
   - Support for single quotes, double quotes, and triple quotes (multiline)

2. **Brackets for Templates and Commands**:
   - Content templates use brackets: `[Template with {{vars}}]`
   - Commands use brackets: `[command --with parameters]`

3. **Options Passing**:
   - Use familiar flag syntax: `--option1 value --option2`
   - Options follow the main content: `@directive "content" --option1 value`

## Directive-Specific Standardization

### Text Directive

Two primary subtypes:

1. **Text Assignment**: Assigns quoted content to a variable
   ```
   text var = "literal content with {{interpolation}}"
   text var = @embed "path/to/file"
   text var = @run [command]
   ```

2. **Text Template**: Uses brackets for templates (not assigned to a variable)
   ```
   text [This is template content with {{vars}}]
   ```

### Run Directive

Standardized command syntax:

```
@run [command --with parameters]
```

### Path Directive

Standardized path declaration:

```
path var = "path/to/file"
path var = "$basePathVar/extension"
```

### Embed Directive

```
@embed "path/to/file" --section heading
@embed "$pathVar"
```

## Benefits of Standardization

1. **Familiarity**: More intuitive for developers familiar with modern programming languages
2. **Clarity**: Clearer distinction between different types of content and their security implications
3. **Consistency**: Reduces cognitive load by using similar patterns across directives
4. **Security**: Maintains clear visual indicators of security-sensitive variables
5. **Flexibility**: Still allows for specialized syntax where beneficial