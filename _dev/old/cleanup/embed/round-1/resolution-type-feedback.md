# Resolution Service Team Feedback on Embed Directive Types

## Overview

After carefully reviewing the proposed `embed.types.ts` definitions against our Resolution Service implementation and its interactions with other services in the Meld pipeline, we have identified several critical enhancements needed to support our service's responsibilities.

## Current Resolution Service Implementation Requirements

Based on our implementation and service interactions, we specifically need:

1. **Context-aware variable resolution** - We resolve variables differently based on context (e.g., within embeds vs. normal text)
2. **Path variable expansion** - We handle `$VARIABLE` syntax in paths but need to control when this happens
3. **Field access resolution** - We support dot notation and bracket notation for accessing nested data
4. **Resolution depth tracking** - We prevent infinite recursion in variable references
5. **Specialized resolution contexts** - For embed directives, we need different resolution rules

## Type Enhancement Requirements

### 1. Resolution Context Properties

Our service requires specific context flags based on our implementation:

```typescript
// Add resolution context properties to BaseEmbedDirective
interface BaseEmbedDirective {
  // ... existing properties
  
  // Resolution context flags - these match our actual implementation
  resolutionContext: {
    currentFilePath: string;
    disablePathPrefixing: boolean; // Critical for variable embeds
    resolutionDepth: number; // For tracking recursive resolution depth
    resolutionScope: 'global' | 'local' | 'import'; // How variables should be resolved
    parentStateId?: string; // For tracking resolution hierarchies
  };
}
```

### 2. Path Resolution Configuration

For `EmbedPathDirective`, our implementation specifically needs:

```typescript
interface EmbedPathDirective extends BaseEmbedDirective {
  subtype: 'embedPath';
  path: string;
  resolvedPath?: string;
  
  // Path resolution configuration that matches our implementation
  pathResolution: {
    pathVariables: string[]; // List of path variables found in the path
    baseDirectory: string; // The directory to resolve relative paths from
    normalizedPath?: string; // Path after normalization
  };
}
```

### 3. Variable Resolution Requirements

Based on our variable resolution implementation:

```typescript
interface EmbedVariableDirective extends BaseEmbedDirective {
  subtype: 'embedVariable';
  variable: {
    reference: string; // The raw variable reference (e.g., "{{data.field}}")
    name: string; // The variable name without braces (e.g., "data.field")
    valueType?: 'text' | 'data' | 'path'; // Determined during resolution
    
    // Field access tracking that matches our parser implementation
    fieldAccess?: {
      root: string; // Base variable name
      accessPath: Array<string | number>; // Parsed access path components
    };
  };
}
```

### 4. Template Resolution Support

Our template handling implementation requires:

```typescript
interface EmbedTemplateDirective extends BaseEmbedDirective {
  subtype: 'embedTemplate';
  template: string;
  
  // Template processing specific to our implementation
  templateProcessing: {
    firstNewlineRemoved: boolean;
    extractedContent: string; // Content between [[ and ]]
    
    // For tracking variable replacements
    resolvedVariables: Map<string, {
      original: string;
      resolved: string;
      position: { start: number; end: number; };
    }>;
  };
}
```

### 5. Service Integration Properties

To integrate with our DirectiveService and CircularityService:

```typescript
// Add to BaseEmbedDirective
interface BaseEmbedDirective {
  // ... existing properties
  
  // Integration properties needed by our implementation
  serviceIntegration: {
    // For CircularityService integration
    dependencyTracking: {
      variableDependencies: string[]; // Variables this embed depends on
      fileDependencies: string[]; // Files this embed depends on
    };
    
    // For caching and performance
    resolutionCache: {
      hasBeenResolved: boolean;
      cachedResolvedContent?: string;
      lastResolutionTimestamp?: number;
    };
  };
}
```

## Implementation Compatibility

These type enhancements directly reflect our current implementation needs based on:

1. How our `ResolutionService.resolveInContext()` method requires specific context flags
2. The way we integrate with `DirectiveService` for directive processing
3. Our interaction with `CircularityService` for dependency tracking
4. The specific variable resolution patterns we implement for field access
5. Our caching mechanisms for optimized performance

## Conclusion

The proposed enhancements would ensure the types accurately reflect our current implementation while supporting all three embed directive types. The changes maintain clean architecture by properly separating concerns and supporting the correct resolution behavior for each embed type.

We believe these changes will significantly improve type safety while maintaining compatibility with our existing resolution pipeline architecture.

Please let us know if you have any questions or need clarification on any of these proposed changes. 