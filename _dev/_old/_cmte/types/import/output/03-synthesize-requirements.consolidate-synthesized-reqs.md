# Consolidated Requirements for File/Import Handling in Meld

After reviewing all the documentation and synthesized requirements, I've consolidated the key features needed for the draft specification of internal file/import types.

## Core Path Type System

1. **Branded Path Types**: Implement branded/nominal types for paths to provide compile-time type safety beyond string validation.
   - Use discriminated unions to distinguish between absolute vs relative and file vs directory paths
   - Support normalization status in the type system (normalized vs raw paths)
   - Example: `type NormalizedAbsoluteFilePath = string & { __brand: 'NormalizedAbsoluteFilePath' }`

2. **Path Construction & Validation**: Create factory functions that validate and return appropriate path types.
   - Functions like `createAbsolutePath()`, `createRelativePath()` with proper validation
   - Include runtime validation for security constraints (null bytes, directory traversal, path length)
   - Support special path variables ($PROJECTPATH, $HOMEPATH) with consistent normalization

3. **Structured Path Representation**: Support both string paths and structured path objects.
   ```typescript
   type MeldPath = 
     | string 
     | {
         segments: string[];
         variables?: Record<string, string>;
         isAbsolute: boolean;
         isNormalized: boolean;
       };
   ```

## File Content Representation

4. **Comprehensive File Content Interface**: Define an immutable interface for file content that includes both content and metadata.
   ```typescript
   interface MeldFileContent<T = string> {
     readonly content: T;
     readonly sourceInfo: {
       readonly path: NormalizedAbsoluteFilePath;
       readonly size: number;
       readonly lastModified: Date;
       readonly encoding?: string;
     };
     readonly contentType: 'meld' | 'json' | 'text' | 'binary';
   }
   ```

5. **Content Type Specialization**: Support different content types with appropriate interfaces.
   - `MeldContent` for parsed Meld files
   - `JsonContent` for structured data
   - Include factory functions for creating properly typed content objects

## Import Definition & Results

6. **Import Result Structure**: Create a comprehensive representation of import results.
   ```typescript
   interface ImportResult {
     success: boolean;
     sourcePath: NormalizedAbsoluteFilePath;
     targetPath: NormalizedAbsoluteFilePath;
     importChain: NormalizedAbsoluteFilePath[]; // For circularity detection
     importedDefinitions?: {
       name: string;
       type: 'text' | 'data' | 'path' | 'command';
       alias?: string;
       sourceLocation: SourceLocation;
     }[];
     error?: ImportError;
   }
   ```

7. **Selective Import Support**: Represent selective imports with name, type, and alias information.
   ```typescript
   interface SelectiveImport {
     name: string;
     type?: 'text' | 'data' | 'path' | 'command';
     alias?: string;
   }
   ```

8. **Import Error Handling**: Define structured error types for import operations.
   ```typescript
   interface ImportError {
     type: 'file_not_found' | 'permission_denied' | 'circular_dependency' | 'parse_error' | 'validation_error';
     message: string;
     location?: SourceLocation;
     importChain?: NormalizedAbsoluteFilePath[];
   }
   ```

## Source Location & Context

9. **Consistent Location Types**: Define location types that include file path information.
   ```typescript
   interface SourceLocation {
     filePath: NormalizedAbsoluteFilePath;
     position: {
       line: number;
       column: number;
     };
     range?: {
       start: { line: number; column: number };
       end: { line: number; column: number };
     };
   }
   ```

10. **Operation Context**: Define type-safe operation contexts for different file operations.
    ```typescript
    interface FileOperationContext {
      operationType: 'read' | 'write' | 'import';
      basePath: NormalizedAbsoluteFilePath;
      workingDirectory: NormalizedAbsoluteFilePath;
      currentFilePath?: NormalizedAbsoluteFilePath;
      timestamp: Date;
      operationId: string; // For tracing and debugging
    }
    ```

## State Merging & Validation

11. **State Merging Interface**: Define a clear interface for merging state during imports.
    ```typescript
    interface StateMergeOptions {
      targetState: IStateService;
      sourceState: IStateService;
      selectiveImports?: SelectiveImport[];
      conflictStrategy: 'skip' | 'overwrite' | 'error';
      trackOrigin: boolean;
    }
    ```

12. **Path Validation Rules**: Define structured validation rules for paths.
    ```typescript
    interface PathValidationRules {
      allowedRoots?: NormalizedAbsoluteFilePath[];
      allowedExtensions?: string[];
      maxPathLength?: number;
      allowAbsolutePaths: boolean;
      allowParentTraversal: boolean;
      allowSymlinks: boolean;
    }
    ```

## Execution Flow

13. **Import Lifecycle**: Define a consistent lifecycle for import operations.
    - Resolution → Validation → Reading → Parsing → State Merging
    - Support proper error handling at each stage
    - Include tracing and debugging capabilities

14. **Circular Dependency Handling**: Implement robust circular dependency detection.
    - Track the full import chain
    - Provide clear error messages with the complete cycle
    - Support depth limits to prevent infinite recursion

## Implementation Priorities

15. **Security First**: Prioritize path validation and security constraints.
    - Prevent path traversal attacks
    - Validate file content to prevent injection attacks
    - Implement proper permission checks

16. **Developer Experience**: Ensure type safety and clear error messages.
    - Use branded types for compile-time safety
    - Provide detailed error messages with source locations
    - Include factory functions for creating properly typed objects

## Key Decisions & Rationale

1. **Branded Types Over String Enums**: Branded types provide better type safety and can be used with existing string-based APIs without runtime overhead.

2. **Immutable Content Objects**: Making content objects immutable prevents accidental modification and simplifies reasoning about code.

3. **Comprehensive Metadata**: Including detailed metadata with file content and import results helps with debugging and error handling.

4. **Structured Error Types**: Using discriminated unions for errors makes error handling more predictable and comprehensive.

5. **Client Factory Pattern Integration**: The implementation should follow the established Client Factory pattern for handling circular dependencies in the DI system.

6. **Deferred Features**:
   - Advanced content type validation will be implemented in a future phase
   - Complex fuzzy section matching is deferred to a later implementation
   - Caching of validated paths will be added after the core system is stable

These consolidated requirements provide a pragmatic foundation for implementing a robust file import system that aligns with Meld's architecture while addressing the key needs for type safety, validation, and execution.