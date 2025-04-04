# Variable Resolution Requirements in Meld

Based on the feedback from component leads, I've synthesized the following requirements for the runtime resolution of variable references in Meld:

## Resolution Context Requirements

1. **Strong Type System**: Implement a discriminated union for variable types (text, data, path) to enforce type safety and reduce manual type checking.
   ```typescript
   type MeldVariable = 
     | { type: 'text'; value: string; sourceLocation?: SourceLocation }
     | { type: 'path'; value: string; sourceLocation?: SourceLocation }
     | { type: 'data'; value: any; sourceLocation?: SourceLocation };
   ```

2. **Comprehensive Resolution Context**: Create a strongly-typed context object with clear properties:
   ```typescript
   interface ResolutionContext {
     // Core properties
     strict: boolean;          // Whether to throw errors on missing variables
     depth: number;            // Current resolution depth
     maxDepth: number;         // Maximum allowed depth for nested resolution
     
     // Variable constraints
     allowedVariableTypes: Set<'text' | 'data' | 'path'>;
     
     // Formatting context
     isBlockContext: boolean;  // Whether in block or inline context
     preserveStructure?: boolean;
     
     // State tracking
     sourceState: IStateService;
     visitedVariables: Set<string>;  // For circular reference detection
     
     // Source tracking
     originatingFile?: string;
   }
   ```

3. **Context Factory Function**: Provide a standardized way to create resolution contexts:
   ```typescript
   function createResolutionContext(
     sourceState: IStateService,
     options: Partial<ResolutionContext> = {}
   ): ResolutionContext;
   ```

## Field Access Requirements

4. **Type-Safe Field Access**: Implement structured field access with proper typing:
   ```typescript
   type ObjectField = { type: 'object'; name: string };
   type ArrayIndex = { type: 'array'; index: number };
   type FieldAccessSegment = ObjectField | ArrayIndex;
   
   function accessField(
     data: any, 
     path: FieldAccessSegment[],
     context: ResolutionContext
   ): FieldAccessResult;
   ```

5. **Field Access Result Type**: Return structured results from field access operations:
   ```typescript
   interface FieldAccessResult<T = unknown> {
     success: boolean;
     value: T;
     error?: string;
     path?: string[];
     accessType?: 'direct' | 'parsed' | 'fallback';
   }
   ```

6. **Path Parsing**: Support parsing field paths from dot notation strings:
   ```typescript
   function parseFieldPath(path: string): FieldAccessSegment[];
   ```

## Type Conversion and Formatting

7. **Explicit Formatting Modes**: Use an enum for formatting modes instead of boolean flags:
   ```typescript
   enum FormattingMode {
     INLINE_COMPACT = 'inline_compact',
     INLINE_EXPANDED = 'inline_expanded',
     BLOCK_PRETTY = 'block_pretty',
     BLOCK_LITERAL = 'block_literal'
   }
   ```

8. **String Conversion Options**: Provide clear options for converting values to strings:
   ```typescript
   interface StringConversionOptions {
     format: FormattingMode;
     indentLevel?: number;
     maxLength?: number;
     arrayFormat?: 'json' | 'csv' | 'list';
     preserveType?: boolean;
   }
   ```

9. **Type-Specific Formatters**: Implement formatters for different data types:
   ```typescript
   function formatPrimitive(value: string | number | boolean | null): string;
   function formatArray(value: any[], options: StringConversionOptions): string;
   function formatObject(value: object, options: StringConversionOptions): string;
   ```

## Nested References and Circularity

10. **Variable Reference Parser**: Parse variable references with proper typing:
    ```typescript
    interface VariableReference {
      type: 'text' | 'data' | 'path';
      name: string;
      fields?: string[];
      originalReference: string;
    }
    
    function parseVariableReference(reference: string): VariableReference | null;
    ```

11. **Nested Resolution Result**: Track resolution status and source:
    ```typescript
    interface NestedResolutionResult<T = unknown> {
      resolved: boolean;
      value: T;
      source?: 'service' | 'client' | 'direct';
      referencesResolved: boolean;
      context?: ResolutionContext;
    }
    ```

12. **Circular Reference Detection**: Track visited variables to detect circular references:
    ```typescript
    function detectCircularReference(
      name: string, 
      context: ResolutionContext
    ): boolean;
    ```

13. **Resolution Depth Tracking**: Enforce maximum resolution depth to prevent infinite recursion:
    ```typescript
    function incrementDepth(context: ResolutionContext): ResolutionContext;
    ```

## Variable State Management

14. **Strongly-Typed Variable Store**: Implement type-safe variable containers:
    ```typescript
    interface VariableStore<T> {
      get(name: string): T | undefined;
      set(name: string, value: T): void;
      has(name: string): boolean;
      delete(name: string): boolean;
      forEach(callback: (value: T, key: string) => void): void;
      entries(): IterableIterator<[string, T]>;
      clone(): VariableStore<T>;
    }
    ```

15. **Unified Variable Operations**: Provide a consistent interface for variable operations:
    ```typescript
    interface VariableOperations {
      getText(name: string): string | undefined;
      getData(name: string): DataValue | undefined;
      getPath(name: string): string | undefined;
      // Other operations...
    }
    ```

16. **State Update Context**: Track the source and metadata for variable changes:
    ```typescript
    interface StateUpdateContext {
      source: string;
      operation: 'set' | 'delete' | 'merge' | 'transform';
      timestamp: number;
      variableType?: 'text' | 'data' | 'path';
      variableName?: string;
    }
    ```

By implementing these requirements, Meld's variable resolution system will be more robust, maintainable, and less prone to runtime errors, while providing clear and consistent behavior across different contexts and variable types.