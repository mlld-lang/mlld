# AST CODE SELECTION FEATURE SPECIFICATION

## OVERVIEW

Extend mlld's file loading syntax to support AST-based code extraction using curly brace notation. This enables selection of specific definitions and usages from source code files, returning complete top-level code units.

## SYNTAX

```mlld
<file.ext { pattern1, pattern2, ... }>
```

### PATTERN TYPES

1. **Definition Pattern**: `identifier`
   - Matches top-level definitions by name
   - Returns complete definition scope
2. **Usage Pattern**: `(identifier)`
   - Matches any top-level definition that contains usage of the identifier
   - Returns the complete containing definition

## EXAMPLES

```mlld
# Get specific method definitions
/var @methods = <service.ts { createUser, updateProfile }>

# Find methods that use specific variables/functions
/var @apiUsers = <controller.js { (fetch), (axios.get) }>

# Mixed patterns
/var @code = <utils.py { validateEmail, (logger.info), DatabaseConnection }>

# With existing mlld features
/var @allHandlers = <src/**/*.ts { handleRequest }> as "File: <>.filename\n<>.code"
```

## RETURN FORMAT

The extractor returns an array of objects with metadata:

```typescript
Array<{
  name: string,      // Identifier name (method/class/function name)
  code: string,      // Complete code of the top-level definition
  type: string,      // "function" | "method" | "class" | "interface" | "variable" | etc.
  line: number,      // Starting line number
  file?: string      // File path (when used with globs)
}>
```

- Missing patterns return `null` entries so the result order stays aligned with requested patterns.

- Missing patterns return `null` to preserve the pattern order.

### EXAMPLE RETURN VALUE

```mlld
/var @result = <auth.ts { login, (database) }>
# Returns:
[
  {
    name: "login", 
    code: "async login(credentials: LoginRequest): Promise<LoginResponse> {\n  const user = await database.findUser(credentials.email);\n  // ... rest of method\n}",
    type: "method",
    line: 15
  },
  {
    name: "validateCredentials",
    code: "function validateCredentials(creds: any) {\n  return database.query('SELECT...');\n  // ... rest of function\n}",
    type: "function", 
    line: 42
  }
]
```

## LANGUAGE SUPPORT

### PRIORITY 1 (V1)

- **JavaScript/TypeScript** (`.js`, `.ts`, `.jsx`, `.tsx`, `.mjs`)
- **Python** (`.py`, `.pyi`)
- **Rust** (`.rs`)
- **Go** (`.go`)
- **Solidity** (`.sol`)
- **C#/.NET** (`.cs`)
- **Java** (`.java`)
- **C/C++** (`.c`, `.cpp`, `.h`, `.hpp`)
- **Ruby** (`.rb`)
- **PHP** (`.php`)

## BEHAVIOR SPECIFICATIONS

### DEFINITION MATCHING RULES

1. **Scope**: Match top-level definitions within their containing scope
   - File-level: functions, classes, constants, interfaces
   - Class-level: methods, properties, constructors
   - Module-level: exports, declarations
2. **Smart Deduplication**: If both a container and its contents are requested, return only the container
   
   ```mlld
   # If UserService class contains createUser method:
   <file.ts { UserService, createUser }>
   # Returns only UserService (which includes createUser)
   ```

### USAGE MATCHING RULES

1. **Scope**: Return complete top-level definitions that contain any usage of the identifier
2. **Usage Types**: All forms of identifier usage:
   - Direct reference: `variableName`
   - Property access: `obj.variableName`
   - Method calls: `variableName()`, `obj.method()`
   - Expressions: `variableName > 5`, `return variableName`
3. **Uniqueness**: Each containing definition appears only once, regardless of usage frequency

### ERROR HANDLING

1. **Missing Identifiers**:
   - Non-existent patterns return `null` in results array
   - No exceptions thrown
   - Optional warning flag: `--warn-missing-ast-patterns`
2. **Multiple Matches**: Return all matches in array
3. **Parse Errors**:
   - Invalid syntax files return empty array
   - Optional warning flag: `--warn-ast-parse-errors`

### WHITESPACE HANDLING

All forms are equivalent (whitespace ignored within braces):

```mlld
<file.ts {method1,method2}>
<file.ts { method1, method2 }>
<file.ts { method1 , method2 }>
```

## INTEGRATION WITH EXISTING MLLD FEATURES

### FILE GLOBS

```mlld
<src/**/*.py { handleRequest }>
# Returns array with file metadata included in each result
```

### TEMPLATES

```mlld
<service.js { createUser }> as "Method: <>.name\n```\n<>.code\n````
```

### METADATA ACCESS

```mlld
/var @method = <file.ts { login }>.0
/show @method.name    # "login"
/show @method.type    # "method"
```

### PIPELINES

```mlld
/var @docs = <utils.py { validateEmail }> | @generateDocs
```

## IMPLEMENTATION REQUIREMENTS

### DEPENDENCIES

- **ast-grep**: Required dependency
- **Error handling**: Graceful failure if ast-grep unavailable

### LANGUAGE DETECTION

- **File extensions**: Primary method using ast-grep’s language mappings
- **Fallback**: Content-based detection for ambiguous cases

### PERFORMANCE

- **Caching**: Cache AST parsing results per file
- **Lazy evaluation**: Only parse when patterns are accessed
- **Concurrency**: Parallel processing for glob patterns

## CONFIGURATION

Optional flags in `mlld.lock.json`:

```json
{
  "astGrep": {
    "warnMissingPatterns": false,
    "warnParseErrors": false,
    "cacheAstResults": true,
    "maxConcurrentFiles": 4
  }
}
```

## TESTING REQUIREMENTS

### TEST CASES

1. **Basic definition extraction**: Functions, classes, methods
2. **Usage pattern matching**: All usage types across languages
3. **Mixed patterns**: Definition + usage in same query
4. **Error conditions**: Missing files, parse errors, invalid patterns
5. **Integration**: Globs, templates, metadata access
6. **Performance**: Large codebases, concurrent access
7. **Language coverage**: Core syntax for each supported language

### TEST DATA

- Sample files in each supported language
- Various code structures: classes, functions, modules
- Edge cases: nested definitions, overloads, generics

## MIGRATION PATH

### PHASE 1: CORE IMPLEMENTATION

- Basic definition matching
- JavaScript/TypeScript support
- Error handling

### PHASE 2: ENHANCED FEATURES

- Usage patterns
- Multi-language support
- Performance optimization

### PHASE 3: ADVANCED INTEGRATION

- Template system integration
- Caching and performance tuning
- Extended language support
