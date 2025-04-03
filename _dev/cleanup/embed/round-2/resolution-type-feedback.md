# Resolution Service Team Feedback - Round 2

## Overall Assessment

The new `embed-types-spec.md` proposal is a significant improvement and addresses many of our core requirements for the Resolution Service. We appreciate the modular approach with core types and service-specific metadata extensions, which aligns well with our dependency injection architecture.

## Strengths of the New Specification

1. **Layered Architecture**: The separation of core types from service-specific metadata is clean and maintainable.
2. **Resolution-Specific Metadata**: The dedicated `ResolutionMetadata` interface captures most of our key requirements.
3. **Detailed Type Variations**: The three embed types (path, variable, template) have appropriate specializations.
4. **Dependency Tracking**: The inclusion of variable and file dependency tracking is essential for our CircularityService integration.

## Suggested Refinements

While the proposed types address most of our needs, we have a few suggestions to enhance the specification:

### 1. Resolution Context Enhancements

```typescript
interface ResolutionMetadata {
  context: {
    // Existing properties
    disablePathPrefixing: boolean;
    allowedVariableTypes: { /* ... */ };
    allowNested: boolean;
    
    // Suggested additions
    currentFilePath: string;           // Critical for resolving relative paths
    resolutionDepth: number;           // For tracking recursive resolution depth
    resolutionMode: 'strict' | 'relaxed'; // Controls resolution failure behavior
    baseDirectory?: string;            // Base for path resolution
  };
  // ...
}
```

### 2. Resolution Status Tracking Improvements

```typescript
interface ResolutionMetadata {
  // ...
  status: 'pending' | 'resolving' | 'resolved' | 'error' | 'cached';  // Added 'cached'
  resolutionChain?: string[];         // Track resolution path for debugging
  circularityStatus?: {
    isCircular: boolean;
    circularPath?: string[];
  };
  // ...
}
```

### 3. Caching Support

```typescript
interface ResolutionMetadata {
  // ...
  cache?: {
    enabled: boolean;
    key?: string;                      // Cache key for resolution results
    timestamp?: number;                // When the result was cached
    invalidationTriggers?: string[];   // What variable changes invalidate this cache
  };
  // ...
}
```

### 4. Path Variable Tracking for EmbedPathDirective

For `EmbedPathDirective`, we recommend adding explicit tracking of path variables:

```typescript
interface EmbedPathDirective extends BaseEmbedDirective {
  // ...
  pathHasVariables: boolean;
  pathVariables?: string[];           // List of path variables (e.g., ["HOME", "PROJECT"])
  // ...
}
```

### 5. Variable Resolution Lifecycle Hooks

To support our integration with the event system:

```typescript
interface ResolutionMetadata {
  // ...
  hooks?: {
    beforeResolution?: string[];      // Event IDs to trigger before resolution
    afterResolution?: string[];       // Event IDs to trigger after resolution
    onResolutionError?: string[];     // Event IDs to trigger on error
  };
  // ...
}
```

## Integration Considerations

The specification effectively supports our key integration points:

1. **InterpreterService**: The clear separation of transformation and resolution metadata aligns with our service boundaries.
2. **CircularityService**: The dependency tracking in ResolutionMetadata supports cycle detection.
3. **ValidationService**: The metadata factory pattern will help with creating validation-compatible resolution contexts.
4. **StateService**: The stateInfo in the base directive provides sufficient context for state access.

## Performance Considerations

From a performance perspective, we appreciate the debugging and performance metadata. We suggest considering:

1. **Lazy Resolution**: An optional flag to indicate when resolution should be deferred until absolutely necessary
2. **Partial Resolution**: Support for resolving only specific variable references in large templates
3. **Incremental Resolution**: For cases where only part of the content needs to be re-resolved

## Conclusion

The new specification is a strong foundation that addresses most of our requirements. With the minor additions suggested above, it will fully support the Resolution Service's responsibilities while maintaining clean architecture boundaries and integration points.

We're prepared to implement these types once finalized and believe they will improve maintainability and type safety across the codebase. 