# Improving ParserCore's File Handling Type System

After analyzing the `ParserService` implementation, I've identified several areas where we can strengthen the TypeScript type system for file handling, path resolution, and import mechanisms. These improvements will make the code more maintainable, reduce runtime errors, and provide better developer experience.

## 1. Strongly Typed File Paths

### Current Issues
- The `parseFile` and `parseWithLocations` methods accept any string as a file path
- The `filePath` parameter is optional in many places, causing inconsistent handling
- Path validation happens at runtime rather than compile time
- No distinction between absolute and relative paths

### Proposed Solution: Path Type Hierarchy

```typescript
/**
 * Represents a validated file path in the system
 */
export type ValidatedPath = string & { readonly __type: unique symbol };

/**
 * Represents an absolute file path
 */
export type AbsolutePath = ValidatedPath & { readonly __absolute: true };

/**
 * Represents a relative file path
 */
export type RelativePath = ValidatedPath & { readonly __relative: true };

/**
 * Creates a validated absolute path
 */
export function createAbsolutePath(path: string): AbsolutePath {
  // Validation logic here
  return path as AbsolutePath;
}

/**
 * Creates a validated relative path
 */
export function createRelativePath(path: string): RelativePath {
  // Validation logic here
  return path as RelativePath;
}
```

### Benefits
1. **Type Safety**: The compiler will prevent passing invalid paths or mixing absolute/relative paths inappropriately
2. **Self-Documentation**: Function signatures clearly indicate path requirements
3. **Error Prevention**: Path-related errors are caught at compile time rather than runtime
4. **Consistency**: Enforces consistent path handling across the codebase

### Implementation in ParserService
```typescript
public async parseFile(filePath: AbsolutePath): Promise<MeldNode[]> {
  try {
    this.ensureFactoryInitialized();
    
    if (this.resolutionClient) {
      const content = await this.resolutionClient.resolveFile(filePath);
      return this.parse(content, filePath);
    }
    
    throw new MeldParseError(`Cannot parse file: ${filePath} - No file resolution service available`);
  } catch (error) {
    // Error handling
  }
}
```

## 2. File Content Type

### Current Issues
- File content is always treated as a generic string
- No distinction between different types of content (Meld, Markdown, etc.)
- No metadata about the content (encoding, source, etc.)

### Proposed Solution: FileContent Type

```typescript
/**
 * Represents file content with metadata
 */
export interface FileContent {
  /**
   * The raw content of the file
   */
  content: string;
  
  /**
   * The path to the file
   */
  path: ValidatedPath;
  
  /**
   * The content type
   */
  contentType: 'meld' | 'markdown' | 'text' | 'unknown';
  
  /**
   * When the file was read
   */
  timestamp: Date;
  
  /**
   * Optional source mapping information
   */
  sourceMap?: {
    registered: boolean;
    mappingAvailable: boolean;
  };
}

/**
 * Creates a FileContent object
 */
export function createFileContent(
  content: string, 
  path: ValidatedPath, 
  contentType: FileContent['contentType'] = 'unknown'
): FileContent {
  return {
    content,
    path,
    contentType,
    timestamp: new Date(),
    sourceMap: undefined
  };
}
```

### Benefits
1. **Richer Context**: Provides important metadata about file content
2. **Content Type Awareness**: Enables content-specific processing
3. **Source Tracking**: Improves error reporting and debugging
4. **Self-Documentation**: Makes the code more readable by clearly indicating what kind of content is being processed

### Implementation in ParserService
```typescript
public async parseFileContent(fileContent: FileContent): Promise<MeldNode[]> {
  try {
    // Register source mapping if available
    if (fileContent.path) {
      try {
        const { registerSource } = require('@core/utils/sourceMapUtils.js');
        registerSource(fileContent.path, fileContent.content);
        // Update source map metadata
        fileContent.sourceMap = { registered: true, mappingAvailable: true };
      } catch (err) {
        fileContent.sourceMap = { registered: false, mappingAvailable: false };
        logger.debug('Source mapping not available', { error: err });
      }
    }
    
    return this.parse(fileContent.content, fileContent.path);
  } catch (error) {
    // Error handling with improved context
  }
}
```

## 3. Import Directive Result Interface

### Current Issues
- The result of importing files lacks clear typing
- No structured way to track what was imported
- Error handling for imports is inconsistent
- Difficult to understand the relationship between imports and the resulting state

### Proposed Solution: Import Result Interface

```typescript
/**
 * Represents the result of an import operation
 */
export interface ImportResult {
  /**
   * The path that was imported
   */
  importedPath: ValidatedPath;
  
  /**
   * Whether the import was successful
   */
  success: boolean;
  
  /**
   * Variables imported from the file
   */
  importedVariables: {
    text: string[];
    data: string[];
    path: string[];
    commands: string[];
  };
  
  /**
   * Aliases used during import
   */
  aliases?: Record<string, string>;
  
  /**
   * Errors that occurred during import
   */
  errors?: Error[];
  
  /**
   * Nested imports that were processed
   */
  nestedImports?: ImportResult[];
}
```

### Benefits
1. **Traceable Imports**: Clear tracking of what was imported and from where
2. **Structured Error Handling**: Consistent approach to handling import errors
3. **Dependency Graph**: Enables building a complete picture of import relationships
4. **Debugging Aid**: Makes it easier to diagnose import-related issues

### Implementation in ResolutionClient
```typescript
public async importFile(
  path: ValidatedPath, 
  importSelector?: string[], 
  aliases?: Record<string, string>
): Promise<ImportResult> {
  const result: ImportResult = {
    importedPath: path,
    success: false,
    importedVariables: {
      text: [],
      data: [],
      path: [],
      commands: []
    },
    aliases: aliases
  };
  
  try {
    // Import logic
    
    // Track what was imported
    result.importedVariables.text = importedTextVars;
    result.importedVariables.data = importedDataVars;
    result.importedVariables.path = importedPathVars;
    result.importedVariables.commands = importedCommands;
    
    result.success = true;
    return result;
  } catch (error) {
    result.errors = [error instanceof Error ? error : new Error(String(error))];
    return result;
  }
}
```

## 4. Source Location Type Enhancement

### Current Issues
- Source locations have inconsistent handling of file paths
- Location objects sometimes have file paths, sometimes don't
- No distinction between locations in different files
- Error reporting with locations is verbose and error-prone

### Proposed Solution: Enhanced Location Types

```typescript
/**
 * Represents a position in a source file
 */
export interface SourcePosition {
  line: number;
  column: number;
}

/**
 * Represents a location range in a source file
 */
export interface SourceRange {
  start: SourcePosition;
  end: SourcePosition;
}

/**
 * Represents a location in a specific file
 */
export interface FileLocation extends SourceRange {
  filePath: ValidatedPath;
}

/**
 * Creates a file location object
 */
export function createFileLocation(
  range: Source