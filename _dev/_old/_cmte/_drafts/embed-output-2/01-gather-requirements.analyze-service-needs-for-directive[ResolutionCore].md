# Improving `@embed` Directive Type Safety in ResolutionCore

## Current Implementation Analysis

After examining the ResolutionService code and related documentation, I've identified several areas where the handling of the `@embed` directive could benefit from stronger TypeScript typing. The current implementation has several pain points:

### Key Issues Identified

1. **Manual Context Flag Management**: The code uses ad-hoc properties like `isVariableEmbed` and `disablePathPrefixing` to handle special embed contexts.

2. **Type-Unsafe Context Extensions**: The resolution context is extended with embed-specific properties using type assertions like `(resolveContext as any).isVariableEmbed`.

3. **Complex Path Resolution Logic**: The `resolveStructuredPath` method contains special-case handling for embed contexts that could be simplified with proper typing.

4. **Unclear Embed Type Distinctions**: There's no explicit type distinction between path embeds, variable embeds, and template embeds in the resolution context.

## Proposed Type Improvements

### 1. Discriminated Union for Embed Context Types

```typescript
/**
 * Base resolution context with common properties
 */
interface BaseResolutionContext {
  currentFilePath?: string;
  allowedVariableTypes: {
    text: boolean;
    data: boolean;
    path: boolean;
    command: boolean;
  };
  pathValidation?: {
    requireAbsolute: boolean;
    allowedRoots: string[];
  };
  allowDataFields?: boolean;
  strict?: boolean;
  allowNested?: boolean;
  state: StateServiceLike;
}

/**
 * Specific context type for standard resolution (non-embed)
 */
interface StandardResolutionContext extends BaseResolutionContext {
  contextType: 'standard';
}

/**
 * Context specifically for path-based embeds
 */
interface PathEmbedResolutionContext extends BaseResolutionContext {
  contextType: 'pathEmbed';
  // Path embeds need directory prefixing
  enablePathPrefixing: true;
}

/**
 * Context specifically for variable-based embeds
 */
interface VariableEmbedResolutionContext extends BaseResolutionContext {
  contextType: 'variableEmbed';
  // Variable embeds must never have path prefixing
  enablePathPrefixing: false;
  // Field access options for variable resolution
  fieldAccessOptions: {
    preserveType?: boolean;
    formattingContext?: any;
    arrayNotation?: boolean;
    numericIndexing?: boolean;
    variableName?: string;
  };
}

/**
 * Context specifically for template-based embeds
 */
interface TemplateEmbedResolutionContext extends BaseResolutionContext {
  contextType: 'templateEmbed';
  // Template embeds also don't use path prefixing for variables
  enablePathPrefixing: false;
  // First newline handling flag
  ignoreFirstNewline: boolean;
}

/**
 * Union type of all possible resolution contexts
 */
type ResolutionContext = 
  | StandardResolutionContext 
  | PathEmbedResolutionContext 
  | VariableEmbedResolutionContext 
  | TemplateEmbedResolutionContext;
```

**Justification**: 
- This discriminated union pattern eliminates the need for ad-hoc property checks and type assertions
- The `contextType` property serves as a type guard, allowing TypeScript to narrow the type in conditional blocks
- Each context type clearly documents its purpose and required properties
- Makes it impossible to create invalid combinations of flags (like enabling path prefixing for variable embeds)

### 2. Structured Type for Embed Directive Parameters

```typescript
/**
 * Base interface for all embed directive parameters
 */
interface BaseEmbedDirectiveParams {
  kind: 'embed';
}

/**
 * Parameters for path-based embeds: @embed [path/to/file]
 */
interface PathEmbedDirectiveParams extends BaseEmbedDirectiveParams {
  embedType: 'path';
  path: string | StructuredPath;
  // No content or variable properties
}

/**
 * Parameters for variable-based embeds: @embed {{variable}}
 */
interface VariableEmbedDirectiveParams extends BaseEmbedDirectiveParams {
  embedType: 'variable';
  variableReference: {
    name: string;
    fieldPath?: string;
  };
  // Explicit flag to prevent path resolution
  disablePathPrefixing: true;
}

/**
 * Parameters for template-based embeds: @embed [[template with {{vars}}]]
 */
interface TemplateEmbedDirectiveParams extends BaseEmbedDirectiveParams {
  embedType: 'template';
  templateContent: string;
  // Flag indicating first newline should be ignored
  ignoreFirstNewline: boolean;
}

/**
 * Union type for all embed directive parameters
 */
type EmbedDirectiveParams = 
  | PathEmbedDirectiveParams 
  | VariableEmbedDirectiveParams 
  | TemplateEmbedDirectiveParams;
```

**Justification**:
- Provides explicit type checking for each embed subtype
- Makes the distinction between embed types clear in the code
- Eliminates the need for complex subtype detection logic
- Enforces required properties for each embed type
- Prevents mixing incompatible properties

### 3. Type-Safe Context Factory Functions

```typescript
/**
 * Factory functions to create properly typed resolution contexts
 */
class ResolutionContextFactory {
  /**
   * Create a standard resolution context
   */
  static forStandard(
    currentFilePath: string | undefined,
    state: StateServiceLike
  ): StandardResolutionContext {
    return {
      contextType: 'standard',
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
   * Create a context specifically for path embeds
   */
  static forPathEmbed(
    currentFilePath: string | undefined,
    state: StateServiceLike
  ): PathEmbedResolutionContext {
    return {
      contextType: 'pathEmbed',
      currentFilePath,
      state,
      enablePathPrefixing: true,
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
   * Create a context specifically for variable embeds
   */
  static forVariableEmbed(
    currentFilePath: string | undefined,
    state: StateServiceLike,
    fieldAccessOptions?: Partial<VariableEmbedResolutionContext['fieldAccessOptions']>
  ): VariableEmbedResolutionContext {
    return {
      contextType: 'variableEmbed',
      currentFilePath,
      state,
      enablePathPrefixing: false,
      allowedVariableTypes: {
        text: true,
        data: true,
        // Path variables are not allowed in variable embeds
        path: false,
        command: true
      },
      fieldAccessOptions: {
        preserveType: true,
        arrayNotation: true,
        numericIndexing: true,
        ...fieldAccessOptions
      }
    };
  }

  /**
   * Create a context specifically for template embeds
   */
  static forTemplateEmbed(
    currentFilePath: string | undefined,
    state: StateServiceLike
  ): TemplateEmbedResolutionContext {
    return {
      contextType: 'templateEmbed',
      currentFilePath,
      state,
      enablePathPrefixing: false,
      ignoreFirstNewline: true,
      allowedVariableTypes: {
        text: true,
        data: true,
        path: false,
        