# Regex Usage Analysis in Services

This document identifies places where regex is used in the `services/` directory that should instead use ParserService's AST or the services' variable interpolation mechanisms.

## Summary of Issues

The analysis reveals several patterns of regex misuse:

1. **Parsing structure that should be handled by the AST parser**: 
   - Heading detection
   - Command syntax parsing
   - Import directive parsing
   - Code fence format extraction

2. **String validation that could be more structured**:
   - Identifier format validation
   - Quote escaping detection

3. **Variable interpolation done manually that should use the variable resolution system**:
   - Command parameter replacement
   - Variable extraction and resolution

## Detailed Analysis by File

### 1. VariableReferenceResolver.ts

**Regex Usage:**
- Uses regex pattern `/\{\{([^}]+)\}\}/g` to match variable references like `{{varName}}`
- Used for testing variable presence, extracting variable names, and resolving references

**Recommendation:**
- Use AST-based variable resolution exclusively
- Remove the regex-based fallback method `resolveSimpleVariables`
- Enhance AST parsing to handle all variable reference cases

### 2. ResolutionService.ts

**Regex Usage:**
- Uses regex `/^(#{1,6})\s+(.+)$/` to match heading patterns
- Used to identify heading text nodes

**Recommendation:**
- Replace regex with proper AST node types for headings
- Extend the AST to properly handle heading levels and content

### 3. PathDirectiveValidator.ts

**Regex Usage:**
- Uses `/^[a-zA-Z0-9_]+$/` to validate identifier format

**Recommendation:**
- Move identifier format validation to the parser level
- Define identifier validation rules in a shared location

### 4. DirectiveService.ts

**Regex Usage:**
- Manually extracts sections using heading patterns
- Implements fuzzy matching for section names

**Recommendation:**
- Use AST-based section extraction
- Leverage the parser's structure for section identification

### 5. TextDirectiveValidator.ts

**Regex Usage:**
- Uses `/^[a-zA-Z_][a-zA-Z0-9_]*$/` to validate identifier format
- Uses `/(?<!\\)['"`]/g` to detect unescaped quotes
- Uses complex regex for @call format validation

**Recommendation:**
- Move identifier validation to parser
- Implement a proper string tokenizer for quote validation
- Create a structured grammar for @call directives

### 6. ImportDirectiveValidator.ts

**Regex Usage:**
- Uses multiple complex regex patterns to parse import directive formats
- Extracts paths, import lists, and aliases

**Recommendation:**
- Enhance the parser to handle structured import directives
- Use AST nodes with specific fields for import paths and aliases

### 7. ImportDirectiveHandler.ts

**Regex Usage:**
- Uses regex to extract paths from directive values
- Parses bracketed import lists

**Recommendation:**
- Use AST nodes with properly parsed fields instead of regex
- Share logic with ImportDirectiveValidator to avoid duplication

### 8. CommandResolver.ts

**Regex Usage:**
- Uses `/^@run\s*\[(.*)\]$/` to extract command content
- Uses `/\${([^}]+)}/g` to find command parameters

**Recommendation:**
- Use parser to structure commands with parameters
- Leverage variable interpolation system for parameter handling

### 9. ParserService.ts

**Regex Usage:**
- Uses regex to extract opening and closing backticks from code fences

**Recommendation:**
- Enhance AST to include backtick count as metadata
- Move validation into the parsing phase

### 10. RunDirectiveValidator.ts

**Regex Usage:**
- Uses `/^\[(.*)\]$/` to extract command content

**Recommendation:**
- Use structured command parsing in the AST

### 11. ContentResolver.ts

**Regex Usage:**
- Uses `/^(`+)/` to extract backtick count from code fence content

**Recommendation:**
- Enhance AST code fence node type to include backtick information

## Minor/Acceptable Regex Uses

These regex uses are simpler and may be acceptable:

### 1. CLIService.ts
- Uses regex for file extension replacement
- Consider using path manipulation utilities instead

### 2. StringLiteralHandler.ts
- Uses regex to unescape quotes in strings
- This is an appropriate use of regex for simple string transformation