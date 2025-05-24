# Proposed TypeScript Type Improvements for Embed Directive in ResolutionCore

After reviewing the ResolutionCore service code and the requirements for the `@embed` directive, I've identified several opportunities to improve type safety and code clarity through enhanced TypeScript types.

## Current Issues in ResolutionService Related to Embed Handling

The current implementation has several challenges when handling embed directives:

1. **Manual Context Flag Checking**: The code relies on runtime checks of flags like `isVariableEmbed` and `disablePathPrefixing` in the `resolveStructuredPath` method.

2. **String vs. Object Type Confusion**: There's ambiguity in handling different types of values (strings vs. structured paths).

3. **Complex Path Resolution Logic**: The path resolution logic contains special cases for variable embeds that must be checked at runtime.

4. **Missing Strong Types for Embed Contexts**: The context parameters use optional properties instead of required properties based on context type.

## Proposed Type Improvements

### 1. Discriminated Union for Embed Types

Create a discriminated union for the three embed directive types:

```typescript
/**
 * Discriminated union for the three types of embed directives
 */
type EmbedType = 
  | { type: 'path'; path: string | StructuredPath }
  | { type: 'variable'; variableName: string; fieldPath?: string }
  | { type: 'template'; templateContent: string };
```

**Justification**: 
- Provides compile-time validation of embed types
- Eliminates runtime type checking and string parsing
- Makes code intention clear through explicit typing
- Reduces potential for errors by enforcing correct property access

### 2. Context Type Specialization for Embed Types

Create specialized context types for each embed scenario:

```typescript
/**
 * Base resolution context with common properties
 */
interface BaseResolutionContext {
  currentFilePath?: string;
  state: StateServiceLike;
  strict?: boolean;
  allowNested?: boolean;
}

/**
 * Path embed resolution context
 */
interface PathEmbedContext extends BaseResolutionContext {
  contextType: 'pathEmbed';
  allowedVariableTypes: {
    text: boolean;
    data: boolean;
    path: true; // Must be true for path embeds
    command: boolean;
  };
  pathValidation: {
    requireAbsolute: boolean;
    allowedRoots: string[];
  };
}

/**
 * Variable embed resolution context
 */
interface VariableEmbedContext extends BaseResolutionContext {
  contextType: 'variableEmbed';
  isVariableEmbed: true;
  disablePathPrefixing: true;
  preventPathPrefixing: true;
  allowedVariableTypes: {
    text: true; // Must be true for variable embeds
    data: true; // Must be true for variable embeds
    path: false; // Must be false for variable embeds
    command: boolean;
  };
  fieldAccessOptions?: {
    preserveType?: boolean;
    formattingContext?: any;
    arrayNotation?: boolean;
    numericIndexing?: boolean;
    variableName?: string;
  };
}

/**
 * Template embed resolution context
 */
interface TemplateEmbedContext extends BaseResolutionContext {
  contextType: 'templateEmbed';
  isVariableEmbed: true;
  disablePathPrefixing: true;
  preventPathPrefixing: true;
  allowedVariableTypes: {
    text: true; // Must be true for template embeds
    data: true; // Must be true for template embeds
    path: false; // Must be false for template embeds
    command: boolean;
  };
}

/**
 * Union of all resolution context types
 */
type ResolutionContext = 
  | BaseResolutionContext 
  | PathEmbedContext 
  | VariableEmbedContext 
  | TemplateEmbedContext;
```

**Justification**:
- Enforces required properties based on context type
- Prevents misuse of context options (e.g., enabling path prefixing for variable embeds)
- Makes the code self-documenting by explicitly defining what each context type requires
- Eliminates manual validation of context properties

### 3. Enhanced StructuredPath Type

Enhance the StructuredPath type to include embed-related information:

```typescript
/**
 * Enhanced structured path with embed-related information
 */
interface StructuredPath {
  raw: string;
  structured: {
    segments: string[];
    variables?: {
      special?: string[];
      path?: string[];
    };
    cwd?: boolean;
  };
  normalized?: string;
  
  // Embed-specific flags
  isEmbedPath?: boolean;
  isEmbedVariable?: boolean;
  isEmbedTemplate?: boolean;
  
  // For variable embeds
  variableName?: string;
  fieldPath?: string;
  
  // For template embeds
  templateContent?: string;
}
```

**Justification**:
- Provides clear type information about the kind of embed being processed
- Eliminates the need for runtime parsing of path content to determine embed type
- Keeps all relevant information in a single, structured object
- Makes code more maintainable by centralizing embed-related data

### 4. Context Factory Functions with Strong Return Types

Create factory functions that produce correctly typed contexts:

```typescript
/**
 * Factory functions for creating strongly-typed resolution contexts
 */
namespace ResolutionContextFactory {
  /**
   * Creates a context for path embed resolution
   */
  export function forPathEmbed(
    currentFilePath: string | undefined,
    state: StateServiceLike
  ): PathEmbedContext {
    return {
      contextType: 'pathEmbed',
      currentFilePath,
      state,
      allowedVariableTypes: {
        text: true,
        data: true,
        path: true,
        command: true
      },
      pathValidation: {
        requireAbsolute: false,
        allowedRoots: []
      }
    };
  }

  /**
   * Creates a context for variable embed resolution
   */
  export function forVariableEmbed(
    currentFilePath: string | undefined,
    state: StateServiceLike
  ): VariableEmbedContext {
    return {
      contextType: 'variableEmbed',
      currentFilePath,
      state,
      isVariableEmbed: true,
      disablePathPrefixing: true,
      preventPathPrefixing: true,
      allowedVariableTypes: {
        text: true,
        data: true,
        path: false,
        command: true
      }
    };
  }

  /**
   * Creates a context for template embed resolution
   */
  export function forTemplateEmbed(
    currentFilePath: string | undefined,
    state: StateServiceLike
  ): TemplateEmbedContext {
    return {
      contextType: 'templateEmbed',
      currentFilePath,
      state,
      isVariableEmbed: true,
      disablePathPrefixing: true,
      preventPathPrefixing: true,
      allowedVariableTypes: {
        text: true,
        data: true,
        path: false,
        command: true
      }
    };
  }
}
```

**Justification**:
- Ensures correct context configuration for each embed type
- Prevents misconfigurations through type safety
- Simplifies code by centralizing context creation logic
- Makes the code more maintainable by enforcing consistent context creation

### 5. Type Guard Functions for Runtime Type Safety

Add type guard functions to safely work with the discriminated unions:

```typescript
/**
 * Type guards for working with resolution contexts
 */
function isPathEmbedContext(context: ResolutionContext): context is PathEmbedContext {
  return 'contextType' in context && context.contextType === 'pathEmbed';
}

function isVariableEmbedContext(context: ResolutionContext): context is VariableEmbedContext {
  return 'contextType' in context && context.contextType === 'variableEmbed';
}

function isTemplateEmbedContext(context: ResolutionContext): context is TemplateEmbedContext {
  return 'contextType' in context && context.contextType === 'templateEmbed';
}

/**
 * Type guards for working with embed types
 */
function isPathEmbed(embed: EmbedType): embed is { type: 'path'; path: string | StructuredPath } {
  return embed.type === 'path';
}

function isVariableEmbed(embed: EmbedType): embed is { type: 'variable'; variableName: string; fieldPath?: string } {
  return embed.type === 'variable';
}

function isTemplateEmbed(embed: EmbedType): embed is { type: 'template'; templateContent: string } {
  return embed.type === 'template';
}
```

**Justification**:
- Provides runtime type safety with TypeScript's type narrowing
- Makes code more readable and maintainable
- Eliminates complex conditional checks
- Reduces potential for runtime errors

## Implementation Benefits

Implementing these type improvements would transform the `resolveStructuredPath` method from:

```typescript
private async resolveStructuredPath(path: StructuredPath, context?: ResolutionContext): Promise<string> {
  // If no context is provided, create a default one
  const resolveContext = context || { /* ... */ };
  
  // IMPORTANT FIX: Check for special flags that indicate we should skip path resolution
  if ((resolveContext as any).isVariableEmbed === true || 
      (resolveContext as any).disablePathPrefixing === true) {
    logger.debug('Path prefixing disabled for this context (variable embed)', {
      raw: path.raw,
      isVariableEmbed: (resolveContext as any).isVariableEmbed,
      disablePathPrefixing: (resolveContext as any).disablePathPrefixing
    });
    
    // For variable embeds, return the raw value without path resolution
    if (typeof path === 'string') {
      return path;
    }
    return path.raw;
  }
  
  // ... rest of method ...
}
```

To a much cleaner and type-safe version:

```typescript
private async resolveStructuredPath(path: StructuredPath, context?: ResolutionContext): Promise<string> {
  // If no context is provided, create a default one
  const resolveContext = context || ResolutionContextFactory.createDefault(this.stateService);
  
  // Type-safe handling based on context type
  if (isVariableEmbedContext(resolveContext) || isTemplateEmbedContext(resolveContext)) {
    logger.debug('Path prefixing disabled for this context', {
      contextType: resolveContext.contextType,
      raw: path.raw
    });
    
    return path.raw;
  }
  
  // ... rest of method with guaranteed path resolution context ...
}
```

## Conclusion

These type improvements would significantly enhance the ResolutionCore service's handling of the `@embed` directive by:

1. **Reducing Runtime Errors**: Strong typing catches potential errors at compile time
2. **Simplifying Logic**: Discriminated unions eliminate complex conditional checks
3. **Improving Maintainability**: Self-documenting types make code easier to understand
4. **Enhancing Performance**: Less runtime type checking and validation
5. **Ensuring Correctness**: Enforcing required properties for each context type

By implementing these TypeScript type enhancements, the ResolutionService would become more robust, easier to maintain, and less prone to bugs related to embed directive handling.