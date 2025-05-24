# Proposed TypeScript Type Improvements for `@embed` Directive in VariableResolution Service

## Current Challenges in Variable Resolution for Embed

After analyzing the VariableResolution service code, I've identified several areas where stronger TypeScript typing would significantly improve the handling of `@embed` directives:

## 1. Resolution Context Type Enhancement

### Current Issue
The code uses a generic `ResolutionContext` with properties like `isVariableEmbed` and `disablePathPrefixing` cast as `(context as any)`, leading to:
- Type safety issues when accessing these properties
- No guarantees about required properties for embed contexts
- Inconsistent handling across different code paths

```typescript
// Current code with type casting:
const isVariableEmbed = (context as any).isVariableEmbed === true;
const disablePathPrefixing = (context as any).disablePathPrefixing === true;
```

### Proposed Solution
Create a discriminated union type with an explicit `contextType` property:

```typescript
type BaseResolutionContext = {
  state: IStateService;
  strict: boolean;
  allowedVariableTypes?: Record<string, boolean>;
  currentFilePath?: string;
};

type StandardResolutionContext = BaseResolutionContext & {
  contextType: 'standard';
};

type VariableEmbedContext = BaseResolutionContext & {
  contextType: 'variableEmbed';
  isVariableEmbed: true;
  disablePathPrefixing: true;
  preventPathPrefixing: true;
};

type TemplateEmbedContext = BaseResolutionContext & {
  contextType: 'templateEmbed';
  isTemplateEmbed: true;
  disablePathPrefixing: true;
};

type PathEmbedContext = BaseResolutionContext & {
  contextType: 'pathEmbed';
  isPathEmbed: true;
  // Path embeds allow path prefixing
};

type ResolutionContext = 
  | StandardResolutionContext 
  | VariableEmbedContext 
  | TemplateEmbedContext 
  | PathEmbedContext;
```

### Benefits
1. **Type Safety**: Eliminates unsafe type casting and provides compile-time validation
2. **Self-Documentation**: Makes the different context types explicit
3. **Exhaustive Checking**: Allows for exhaustive switch statements on context types
4. **Consistent Properties**: Ensures required properties are present for each context type

## 2. Embed Type Enumeration

### Current Issue
The code doesn't have a consistent way to represent the different types of embeds, leading to:
- String literals used inconsistently ('embedPath', 'embedVariable', 'embedTemplate')
- No validation that these string literals are used correctly
- Difficulty tracking which embed type is being processed

### Proposed Solution
Create a strongly-typed enum for embed types:

```typescript
enum EmbedType {
  Path = 'embedPath',
  Variable = 'embedVariable',
  Template = 'embedTemplate'
}

// With type guards:
function isPathEmbed(embedType: EmbedType): boolean {
  return embedType === EmbedType.Path;
}

function isVariableEmbed(embedType: EmbedType): boolean {
  return embedType === EmbedType.Variable;
}

function isTemplateEmbed(embedType: EmbedType): boolean {
  return embedType === EmbedType.Template;
}
```

### Benefits
1. **Consistency**: Ensures the same constants are used throughout the codebase
2. **Autocompletion**: IDE provides autocomplete for enum values
3. **Type Safety**: Prevents typos and ensures only valid embed types are used
4. **Refactoring Support**: Makes it easier to rename or change embed types in the future

## 3. Embed Directive Parameters Interface

### Current Issue
The code handles embed directive parameters through generic objects and type checking, leading to:
- Manual validation of directive properties
- No clear indication of which properties are required for each embed type
- Complex type checking logic to determine the embed type

```typescript
// Current approach with manual checking:
if (directiveData.isTemplateContent === true || 
    (directiveData.content && 
     typeof directiveData.content === 'string' && 
     directiveData.content.startsWith('[[') && 
     directiveData.content.endsWith(']]'))) {
  return 'embedTemplate';
} 
```

### Proposed Solution
Create a discriminated union type for embed directive parameters:

```typescript
interface BaseEmbedDirectiveParams {
  kind: 'embed';
}

interface PathEmbedDirectiveParams extends BaseEmbedDirectiveParams {
  embedType: EmbedType.Path;
  path: string;
  // No content property
}

interface VariableEmbedDirectiveParams extends BaseEmbedDirectiveParams {
  embedType: EmbedType.Variable;
  variableReference: {
    identifier: string;
    isVariableReference: true;
    fields?: Field[];
  };
  // No path property
}

interface TemplateEmbedDirectiveParams extends BaseEmbedDirectiveParams {
  embedType: EmbedType.Template;
  isTemplateContent: true;
  content: string; // Content between [[ and ]]
  // No path property
}

type EmbedDirectiveParams = 
  | PathEmbedDirectiveParams 
  | VariableEmbedDirectiveParams 
  | TemplateEmbedDirectiveParams;
```

### Benefits
1. **Clear Structure**: Makes it explicit which properties are required for each embed type
2. **Simplified Type Detection**: Allows for direct checking of the `embedType` property
3. **Validation**: Ensures all required properties are present at compile time
4. **Error Prevention**: Prevents mixing incompatible properties (e.g., having both `path` and `content`)

## 4. Formatting Context Type

### Current Issue
The `convertToString` method uses an optional formatting context object with multiple properties, leading to:
- Inconsistent formatting depending on which properties are set
- Difficulty understanding which formatting options apply to which types of content
- Complex conditional logic to determine the formatting style

```typescript
// Current implementation:
convertToString(
  value: any, 
  formattingContext?: { 
    isBlock?: boolean; 
    nodeType?: string; 
    linePosition?: 'start' | 'middle' | 'end';
    isTransformation?: boolean;
  }
): string
```

### Proposed Solution
Create a dedicated formatting context type with preset configurations for different embed types:

```typescript
interface FormattingOptions {
  format: 'inline' | 'block';
  indentLevel?: number;
  preserveWhitespace?: boolean;
  prettyPrint?: boolean;
}

// Factory functions for common formatting contexts
function createPathEmbedFormatting(): FormattingOptions {
  return {
    format: 'block',
    preserveWhitespace: true
  };
}

function createVariableEmbedFormatting(): FormattingOptions {
  return {
    format: 'inline',
    prettyPrint: false
  };
}

function createTemplateEmbedFormatting(): FormattingOptions {
  return {
    format: 'block',
    preserveWhitespace: true,
    prettyPrint: true
  };
}
```

### Benefits
1. **Consistent Formatting**: Ensures consistent formatting for each embed type
2. **Simplified API**: Makes it clear which formatting options are available
3. **Default Values**: Provides sensible defaults for each embed type
4. **Extensibility**: Allows for additional formatting options in the future

## 5. Embed-Specific Resolution Result Type

### Current Issue
Resolution results are returned as generic strings or `any` types, leading to:
- Lack of metadata about the resolution process
- No indication of which embed type was processed
- No structured way to handle errors or warnings

### Proposed Solution
Create a structured result type for embed resolution:

```typescript
interface EmbedResolutionResult<T = string> {
  content: T;
  embedType: EmbedType;
  sourceType: 'text' | 'data' | 'path' | 'template';
  warnings?: string[];
  metadata?: {
    originalSize?: number;
    resolvedSize?: number;
    mimeType?: string;
    variablesResolved?: string[];
  };
}

// Example usage:
async function resolveEmbed(node: DirectiveNode): Promise<EmbedResolutionResult> {
  const embedType = determineEmbedType(node);
  
  switch (embedType) {
    case EmbedType.Path:
      return resolvePathEmbed(node);
    case EmbedType.Variable:
      return resolveVariableEmbed(node);
    case EmbedType.Template:
      return resolveTemplateEmbed(node);
  }
}
```

### Benefits
1. **Rich Metadata**: Provides context about the resolution process
2. **Type Safety**: Ensures the result has the expected structure
3. **Error Handling**: Allows for warnings without failing the resolution
4. **Debugging**: Makes it easier to debug resolution issues

## 6. Enhanced Field Access Types

### Current Issue
The field access logic for variable embeds has complex error handling and type checking:
- Manual validation of field types
- Complex error messages for different field access failures
- Difficulty tracking which fields are being accessed

### Proposed Solution
Create a structured field access type:

```typescript
// Enhanced field types
interface BaseField {
  path: string; // Full dot notation path
}

interface PropertyField extends BaseField {
  type: 'property';
  name: string;
}

interface IndexField extends BaseField {
  type: 'index';
  index: number;
}

type Field = PropertyField | IndexField;

// Field access result type
interface FieldAccessResult<T = any> {
  success: boolean;
  value?: T;
  error?: string;
  path: string;
  fieldChain: Field[];
}

// Field access function with improved typing
async function accessFields<T = any>(
  obj: any, 
  fields: Field[], 
  context: ResolutionContext
): Promise<FieldAccessResult<T>>
```

### Benefits
1. **Structured Error Handling**: Provides detailed information about field access failures
2. **Path Tracking**: Makes it clear which path is being accessed
3. **Type Preservation**: Allows for preserving the type of the accessed value
4. **Simplified Debugging**: Makes it easier to debug field access issues

## Implementation Impact

These type enhancements would have a significant impact on the VariableResolution service:

1. **Reduced Complexity**: Complex type checking logic would be replaced with simple property access
2. **Improved Safety**: Type errors would be caught at compile time rather than runtime
3. **Better Documentation**: The types would serve as self-documenting code
4. **Simplified Testing**: Each embed type would have a clear interface for testing
5. **Consistent Handling**: All code paths would handle each embed type consistently

## Summary

By implementing these TypeScript type improvements, we can make the VariableResolution service more robust, easier to maintain, and less prone to errors. The discriminated union types provide a clear structure for different embed types, while the enhanced context and result types ensure consistent handling across the codebase.

These improvements directly address the core requirement of ensuring that `@embed` directives in Meld exclusively handle text content from files or string values from variables, by making the type system enforce these constraints at compile time.