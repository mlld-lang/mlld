# Path Directive Handler Documentation

## Overview
The Path directive (`@path`) manages file system paths and directory locations within Meld documents. It provides a way to define and manipulate paths that can be used by other directives like `@embed` and `@import`.

## Syntax

### Basic Path Definition
```
@path basePath = /path/to/directory
```

### With Variable Reference
```
@path outputPath = {basePath}/output
```

## Architecture

```
   +----------------------+
   |   PathDirective      |
   |   kind: 'path'       |
   |   name: string       |
   |   value: string      |
   +--------+-------------+
            |
            v
   [ PathDirectiveHandler.handle(...) ]
            |
            v
  state.setPathVar(name, value)
```

## Implementation Details

### Handler Interface
```typescript
class PathDirectiveHandler implements DirectiveHandler {
  canHandle(kind: string, mode: string): boolean
  handle(node: DirectiveNode, state: InterpreterState, context: Context): void
}
```

### Key Methods

#### `canHandle(kind: string, mode: string)`
- Returns `true` if `kind === 'path'`
- Mode-agnostic (works in any interpreter mode)

#### `handle(node: DirectiveNode, state: InterpreterState, context: Context)`
1. Validates path syntax and name
2. Resolves any variables in path
3. Normalizes path format
4. Stores in state via `setPathVar`
5. Logs progress via `directiveLogger`

## Path Processing
- Resolves relative paths
- Normalizes path separators
- Expands environment variables
- Handles variable substitution
- Validates path format

## Error Handling
- Invalid path syntax
- Missing required fields
- Name collision errors
- Path resolution errors
- Variable substitution errors

## Logging
- Logs path definitions
- Records path resolutions
- Logs validation errors
- Debug-level path details

## Examples

### Basic Usage
```
@path srcDir = ./src
@path buildDir = ../build
```

### Variable References
```
@path baseDir = /project
@path configDir = {baseDir}/config
@path outputDir = {baseDir}/output
```

### Environment Variables
```
@path homeConfig = $HOME/.config/meld
```

### Complex Paths
```
@path templateDir = {baseDir}/templates
@path userTemplate = {templateDir}/{userName}
```

## Troubleshooting

### Common Issues
- **"Invalid path format"**
  - Solution: Check path syntax and separators
- **"Path variable already defined"**
  - Solution: Choose a unique variable name
- **"Unable to resolve path"**
  - Solution: Verify referenced variables exist
- **"Invalid characters in path"**
  - Solution: Remove special characters from path

### Debugging Tips
1. Check path syntax
2. Verify variable references
3. Enable debug logging
4. Review resolved paths

## References
- [Interpreter Documentation](../../__docs__/README.md)
- [File System Utils](../../utils/__docs__/fs.md)
- [Path Resolution](../../utils/__docs__/paths.md) 