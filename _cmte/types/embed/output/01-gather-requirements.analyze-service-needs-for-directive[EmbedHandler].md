# Improving EmbedDirectiveHandler with Stronger TypeScript Types

After analyzing the `EmbedDirectiveHandler` implementation, I've identified several areas where stronger TypeScript types would significantly improve code clarity, safety, and maintainability. The current implementation contains extensive manual validation, type checking, and complex conditional logic that could be simplified with proper type definitions.

## Current Issues and Proposed Solutions

### 1. Embed Subtype Discrimination

**Current Issue:**
The code uses a string union type (`'embedPath' | 'embedVariable' | 'embedTemplate'`) for subtypes, but detection requires complex conditional logic in the `determineSubtype()` method and repetitive pattern checking throughout the code.

```typescript
// Current approach with manual detection
private determineSubtype(node: DirectiveNode): 'embedPath' | 'embedVariable' | 'embedTemplate' {
  // Complex conditionals to determine type
  if (directiveData.isTemplateContent === true || 
      (typeof directiveData.content === 'string' && 
       directiveData.content.startsWith('[[') && 
       directiveData.content.endsWith(']]'))) {
    return 'embedTemplate';
  } 
  // More complex conditionals...
}
```

**Proposed Solution:**
Implement a discriminated union type for embed directives:

```typescript
// Discriminated union for embed types
type EmbedDirective = 
  | PathEmbed 
  | VariableEmbed 
  | TemplateEmbed;

interface BaseEmbed {
  kind: 'embed';
  section?: string;
  headingLevel?: string;
  underHeader?: string;
  fuzzy?: string;
  preserveFormatting?: boolean;
}

interface PathEmbed extends BaseEmbed {
  embedType: 'path';
  path: string | StructuredPath;
}

interface VariableEmbed extends BaseEmbed {
  embedType: 'variable';
  variable: VariableReference;
}

interface TemplateEmbed extends BaseEmbed {
  embedType: 'template';
  content: string;
}

interface VariableReference {
  type: 'VariableReference';
  identifier: string;
  valueType: 'text' | 'data' | 'path' | 'command';
  fieldPath?: string;
  isVariableReference: true;
}
```

**Benefits:**
1. **Type Safety**: The compiler enforces that each embed type has the correct required properties
2. **Simplified Logic**: Type checking becomes a simple property check (`if (directive.embedType === 'variable')`)
3. **Self-Documenting**: The types clearly show what properties are expected for each embed type
4. **Exhaustiveness Checking**: Switch statements can be checked for completeness
5. **Reduced Complexity**: Eliminates ~30 lines of complex conditional logic in `determineSubtype()`

### 2. Variable Reference Handling

**Current Issue:**
The code has multiple patterns for handling variable references, with extensive conditional checks to determine if something is a variable reference.

```typescript
// Current complex handling with multiple patterns
if (typeof variableReference === 'string' && 
    variableReference.startsWith('{{') && 
    variableReference.endsWith('}}')) {
  // String pattern handling
} 
else if (typeof variableReference === 'object' && 
    'type' in variableReference && 
    variableReference.type === 'VariableReference') {
  // AST-style handling
}
// More conditional branches...
```

**Proposed Solution:**
Create a standardized `VariableReference` type and helper functions:

```typescript
interface VariableReference {
  type: 'VariableReference';
  identifier: string;
  valueType: 'text' | 'data' | 'path' | 'command';
  fieldPath?: string;
  isVariableReference: true;
}

// Helper function to normalize variable references
function normalizeVariableReference(value: string | object): VariableReference {
  if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
    const variableName = value.substring(2, value.length - 2).trim();
    // Parse for field access
    if (variableName.includes('.')) {
      const [identifier, ...fieldParts] = variableName.split('.');
      return {
        type: 'VariableReference',
        identifier,
        fieldPath: fieldParts.join('.'),
        valueType: 'text',
        isVariableReference: true
      };
    }
    return {
      type: 'VariableReference',
      identifier: variableName,
      valueType: 'text',
      isVariableReference: true
    };
  }
  // Handle other cases...
}
```

**Benefits:**
1. **Consistent Interface**: All variable references use the same structure
2. **Simplified Resolution**: The resolution logic can rely on a consistent interface
3. **Better Error Handling**: Type errors become easier to detect and report
4. **Reduced Code**: Eliminates ~50 lines of conditional logic and special-case handling
5. **Easier Maintenance**: Changes to variable reference handling are isolated to one place

### 3. Resolution Context Configuration

**Current Issue:**
The code manually configures resolution contexts with varying properties, leading to potential inconsistencies:

```typescript
// Current approach with manual context configuration
const variableContext = ResolutionContextFactory.forVariableEmbed(
  resolutionContext?.currentFilePath || context.currentFilePath,
  childState
);

// Later, manually creating another context with similar properties
const typedContextForSection: ResolutionContext = {
  currentFilePath: resolutionContext?.currentFilePath || undefined,
  allowedVariableTypes: {
    text: true,
    data: true,
    path: true,
    command: true
  },
  // More properties...
};
```

**Proposed Solution:**
Create a strongly typed context configuration system:

```typescript
// Strong typing for resolution contexts
interface ResolutionContextOptions {
  currentFilePath?: string;
  state: IStateService;
  isVariableEmbed?: boolean;
  disablePathPrefixing?: boolean;
  preventPathPrefixing?: boolean;
  allowedVariableTypes?: {
    text?: boolean;
    data?: boolean;
    path?: boolean;
    command?: boolean;
  };
  strict?: boolean;
  formattingContext?: FormattingContext;
  fieldAccessOptions?: FieldAccessOptions;
}

// Helper to create properly typed contexts
function createResolutionContext(
  type: 'variable' | 'path' | 'template' | 'section',
  options: ResolutionContextOptions
): ResolutionContext {
  // Create appropriate context based on type
}
```

**Benefits:**
1. **Consistency**: All contexts are created with the same structure
2. **Type Safety**: The compiler ensures all required properties are provided
3. **Simplified Creation**: Context creation is centralized and standardized
4. **Reduced Duplication**: Eliminates repeated manual context creation
5. **Better Maintenance**: Changes to context structure only need to be made in one place

### 4. Field Access Patterns

**Current Issue:**
The code has complex logic for handling field access in variable references, with multiple patterns and fallback approaches:

```typescript
// Current approach with manual field access handling
if (variableName.includes('.')) {
  // Handle field access pattern
  const parts = variableName.split('.');
  const baseVarName = parts[0];
  const fieldPath = parts.slice(1).join('.');
  
  // Complex resolution logic...
}
```

**Proposed Solution:**
Create a dedicated field access type and parser:

```typescript
interface FieldAccess {
  baseVariable: string;
  path: string;
  notation: 'dot' | 'bracket';
}

// Helper to parse field access patterns
function parseFieldAccess(reference: string): FieldAccess | null {
  // Handle dot notation
  if (reference.includes('.')) {
    const [baseVariable, ...pathParts] = reference.split('.');
    return {
      baseVariable,
      path: pathParts.join('.'),
      notation: 'dot'
    };
  }
  
  // Handle bracket notation
  if (reference.includes('[') && reference.includes(']')) {
    const bracketIndex = reference.indexOf('[');
    return {
      baseVariable: reference.substring(0, bracketIndex),
      path: reference.substring(bracketIndex),
      notation: 'bracket'
    };
  }
  
  return null;
}
```

**Benefits:**
1. **Standardized Parsing**: Field access is parsed consistently
2. **Type Safety**: The structure of field access is well-defined
3. **Simplified Logic**: Complex parsing logic is centralized
4. **Better Error Handling**: Parsing errors are easier to detect and report
5. **Reduced Code**: Eliminates repeated parsing logic throughout the handler

### 5. Directive Parameters Interface

**Current Issue:**
The current `EmbedDirectiveParams` interface is too loose, allowing properties that may not be valid together:

```typescript
// Current loose interface
interface EmbedDirectiveParams {
  path?: string | StructuredPath;
  section?: string;
  headingLevel?: string;
  underHeader?: string;
  fuzzy?: string;
  subtype?: 'embedPath' | 'embedVariable' | 'embedTemplate';
  content?: string;
  isTemplateContent?: boolean;
  preserveFormatting?: boolean;
}
```

**Proposed Solution:**
Replace with a discriminated union type based on embed type:

```typescript
// Common parameters for all embed types
interface BaseEmbedParams {
  section?: string;
  headingLevel?: string;
  underHeader?: string;
  fuzzy?: string;
  preserveFormatting?: boolean;
}

// Path-specific parameters
interface PathEmbedParams extends BaseEmbedParams {
  embedType: 'path';
  path: string | StructuredPath;
}

// Variable-specific parameters
interface VariableEmbedParams extends BaseEmbedParams {
  embedType: 'variable';
  variable: VariableReference;
}

// Template-specific parameters
interface TemplateEmbedParams extends BaseEmbedParams {
  embedType: 'template';
  content: string;
}

// Union type for all embed parameters
type EmbedDirectiveParams = 
  | PathEmbedParams 
  | VariableEmbedParams 
  | TemplateEmbedParams;
```

**Benefits:**
1. **Type Safety**: Invalid combinations of properties are prevented
2. **Clear Intent**: The type clearly indicates which properties are valid for each embed type
3. **Simplified Validation**: Much of the validation can be handled by the type system
4. **Reduced Manual Checks**: Eliminates many manual property checks
5. **Self-Documenting**: The types serve as documentation for the directive structure

## Implementation Impact

Implementing these type improvements would significantly simplify the `EmbedDirectiveHandler`:

1. **Simplified Type Detection**:
   ```typescript
   // Before: Complex detection logic
   private determineSubtype(node: DirectiveNode): 'embedPath' | 'embedVariable' | 'embedTemplate' {
     // 30+ lines of complex conditionals
   }
   
   // After: Simple property check
   const embedType = (node.directive as EmbedDirectiveParams).embedType;
   ```

2. **Streamlined Execution Logic**:
   ```typescript
   // Before: Complex conditionals and special cases
   if (isTemplateEmbed) {
     // Template logic...
   } else if (isVariableEmbed) {
     // Variable logic...
   } else {
     // Path logic...
   }
   
   // After: Clean switch statement with exhaustiveness checking
   switch (params.embedType) {
     case 'path':
       return this.handlePathEmbed(node, context, params.path);
     case 'variable':
       return this.handleVariableEmbed(node, context, params.variable);
     case 'template':
       return this.handleTemplateEmbed(node, context, params.content);
   }
   ```

3. **Simplified Variable Resolution**:
   ```typescript
   // Before: Multiple patterns and special cases
   if (typeof variableReference === 'string' && variableReference.startsWith('{{')) {
     // String pattern handling...
   } else if (typeof variableReference === 'object' && 'type' in variableReference) {
     // AST pattern handling...
   } else if (/* more conditions */) {
     // More special cases...
   }
   
   // After: Consistent interface
   const varRef = normalizeVariableReference(reference);
   const result = await this.resolutionService.resolveVariableReference(varRef, context);
   ```

## Conclusion

The proposed type improvements would transform the `EmbedDirectiveHandler` from a complex, conditionally-driven implementation to a clear, type-driven one. This would:

1. **Reduce Code Size**: Eliminate ~100-150 lines of conditional logic and manual validation
2. **Improve Reliability**: Catch type errors at compile time rather than runtime
3. **Enhance Maintainability**: Make the code more self-documenting and easier to understand
4. **Simplify Testing**: Create clearer boundaries for unit testing
5. **Support Better Error Messages**: Generate more specific error messages based on type violations

These improvements align perfectly with the Meld language's goal of providing clear, well-typed directives that are easy to use and maintain. The stronger type system would make the `@embed` directive more robust while simplifying the implementation code.