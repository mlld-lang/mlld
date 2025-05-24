# Path Resolution Type System Improvements

After reviewing the PathResolver service code, I've identified several areas where TypeScript type improvements would significantly enhance code safety, readability, and maintainability. The current implementation has several type-related issues when handling paths, file imports, and variable resolution.

## 1. Structured Path Type Improvements

### Current Issues:
- The `StructuredPath` type is used but not clearly defined in the file
- Type checking relies on property existence (`'raw' in value`, `'structured' in value`)
- There's inconsistent handling between string paths and structured paths
- Special path variables are handled with string startsWith checks

### Proposed Solution:

```typescript
/**
 * Represents path variable types in the system
 */
export enum PathVariableType {
  Regular = 'regular',     // Standard user-defined path
  Project = 'project',     // Project root path (PROJECTPATH, .)
  Home = 'home',           // User home path (HOMEPATH, ~)
  Absolute = 'absolute',   // Absolute path starting with /
  Relative = 'relative'    // Relative path
}

/**
 * Represents the structure of path variables within a structured path
 */
export interface PathVariables {
  special: string[];  // Special variables like HOMEPATH, PROJECTPATH
  path: string[];     // Regular path variables
}

/**
 * Represents the parsed structure of a path
 */
export interface PathStructure {
  variables: PathVariables;
  segments: string[];
  isAbsolute: boolean;
}

/**
 * Complete structured path representation
 */
export interface StructuredPath {
  raw: string;               // Original unparsed path
  normalized?: string;       // Normalized form (platform-independent)
  resolved?: string;         // Fully resolved absolute path
  structured: PathStructure; // Parsed structure
  type: PathVariableType;    // Type of path for quick checks
}

/**
 * Type guard for structured paths
 */
export function isStructuredPath(value: unknown): value is StructuredPath {
  return typeof value === 'object' && 
         value !== null && 
         'raw' in value && 
         'structured' in value &&
         'type' in value;
}
```

### Benefits:
1. **Type Safety**: Clear interfaces eliminate the need for property existence checks
2. **Self-Documenting**: The enum makes path types explicit rather than using string comparisons
3. **Consistency**: Using type guards provides consistent type narrowing
4. **Maintainability**: New path types can be added to the enum without changing validation logic

## 2. Path Validation Context Type

### Current Issues:
- The `context.pathValidation` object has unclear structure
- Multiple null checks before accessing properties
- Validation rules are scattered throughout the code

### Proposed Solution:

```typescript
/**
 * Path validation rules
 */
export interface PathValidationRules {
  requireAbsolute: boolean;
  allowedRoots?: string[];
  allowSpecialVars?: boolean;
  allowRelative?: boolean;
  restrictToProjectPath?: boolean;
}

/**
 * Enhanced resolution context with stronger typing
 */
export interface EnhancedResolutionContext extends ResolutionContext {
  pathValidation?: PathValidationRules;
}

/**
 * Type guard for contexts with path validation
 */
export function hasPathValidation(context: ResolutionContext): context is EnhancedResolutionContext & { pathValidation: PathValidationRules } {
  return !!context.pathValidation;
}
```

### Benefits:
1. **Explicit Contract**: Clear definition of what validation rules are available
2. **Error Prevention**: Type checking prevents accessing undefined properties
3. **Self-Documentation**: Makes it clear what validation options exist
4. **Extensibility**: New validation rules can be added without breaking existing code

## 3. Path Resolution Result Type

### Current Issues:
- The `resolve()` method returns a string, losing information about the path's structure
- Error handling is mixed with path processing logic
- No distinction between different path resolution outcomes

### Proposed Solution:

```typescript
/**
 * Result of path resolution operation
 */
export interface PathResolutionResult {
  value: string;                    // The resolved path string
  structured?: StructuredPath;      // Original structured path if available
  type: PathVariableType;           // Type of the resolved path
  validated: boolean;               // Whether validation was performed
  containsVariables: boolean;       // Whether path still contains variables
}

/**
 * Enhanced PathResolver with improved return types
 */
export class EnhancedPathResolver {
  // ...existing code...

  /**
   * Resolve path variables in a node with detailed result
   */
  async resolve(node: MeldNode, context: ResolutionContext): Promise<PathResolutionResult> {
    // Implementation would follow similar logic but return the enhanced result
  }
}
```

### Benefits:
1. **Information Preservation**: Maintains structured data throughout the resolution process
2. **Error Clarity**: Separates validation errors from resolution logic
3. **Caller Flexibility**: Gives callers more information about the resolved path
4. **Debugging**: Makes it easier to trace path resolution issues

## 4. Path Variable Node Type

### Current Issues:
- The code creates a "synthetic" `VariableReferenceNode` in `getPathVarFromNode()`
- There's no dedicated type for path variable references
- Type checking relies on property existence and type assertions

### Proposed Solution:

```typescript
/**
 * Path variable reference node
 */
export interface PathVarNode extends VariableReferenceNode {
  valueType: 'path';
  isSpecial?: boolean;
  specialType?: PathVariableType;
}

/**
 * Type guard for path variable nodes
 */
export function isPathVarNode(node: MeldNode): node is PathVarNode {
  return isVariableReferenceNode(node) && 
         (node as VariableReferenceNode).valueType === 'path';
}

/**
 * Enhanced helper to extract PathVarNode from a node
 */
private getPathVarFromNode(node: MeldNode): PathVarNode | null {
  if (!isDirectiveNode(node) || node.directive.kind !== 'path') {
    return null;
  }
  
  const identifier = node.directive.identifier;
  if (!identifier) return null;
  
  // Determine if this is a special path variable
  const isSpecial = identifier === '~' || identifier === '.' || 
                   identifier === 'HOMEPATH' || identifier === 'PROJECTPATH';
  
  // Create a proper PathVarNode
  return {
    type: 'VariableReference',
    identifier,
    valueType: 'path',
    isVariableReference: true,
    isSpecial,
    specialType: isSpecial ? 
      (identifier === '~' || identifier === 'HOMEPATH' ? PathVariableType.Home : PathVariableType.Project) : 
      undefined
  };
}
```

### Benefits:
1. **Type Consistency**: Proper type for path variable nodes
2. **Self-Documentation**: Makes the special nature of certain path variables explicit
3. **Error Reduction**: Type guards eliminate manual type checking
4. **Code Clarity**: Makes the intent of the code clearer

## 5. Import File Handling Types

### Current Issues:
- Import handling lacks clear types for imported content
- No distinction between different file types that might be imported
- No tracking of import source for error reporting

### Proposed Solution:

```typescript
/**
 * Represents a file that can be imported
 */
export interface ImportableFile {
  path: StructuredPath;             // Path to the file
  contentType: string;              // MIME type or format indicator
  exists: boolean;                  // Whether the file exists
  canImport: boolean;               // Whether the file can be imported
}

/**
 * Result of an import operation
 */
export interface ImportResult {
  file: ImportableFile;             // The imported file
  success: boolean;                 // Whether import succeeded
  variables: {                      // Variables imported
    text: string[];
    data: string[];
    path: string[];
    commands: string[];
  };
  errors?: M