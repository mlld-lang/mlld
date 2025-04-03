# ValidationService Feedback on Embed Types

## Overview

As the lead for ValidationService, I've reviewed the proposed embed directive types in the context of our DI architecture and validation approach. After careful consideration of how ValidationService interacts with other services, I have the following refined feedback.

## Key Validation Requirements

ValidationService is responsible for:
1. Validating directive syntax and constraints
2. Ensuring each embed type follows its specific rules
3. Throwing appropriate MeldDirectiveError on validation failures
4. Supporting extensible validator registration for different directive kinds

## Revised Feedback on Types

### Strengths of Current Types
- The separation into subtypes properly reflects the three distinct embed variants
- The base interface provides common properties needed across all variants
- Location information helps with generating error messages

### Recommended Changes

After reviewing our codebase and dependency patterns, I recommend a more streamlined approach:

1. **Add Raw Directive Text**
   - We need the original directive text for precise error messages
   - This is the only essential addition needed for validation purposes

2. **Keep Types Focused on Structure**
   - Validation rules should remain in validator implementations, not in the types
   - This allows for more flexible validation logic and easier changes

3. **Support for Validation Extensibility**
   - Types should enable validator registration without constraining implementation
   - Avoid embedding validation-specific state that complicates the interface

## Proposed Type Enhancements

```typescript
interface BaseEmbedDirective {
  // Existing fields...
  
  // Add only essential validation context
  rawDirectiveText: string;  // Original text for error context
}

interface EmbedPathDirective extends BaseEmbedDirective {
  subtype: 'embedPath';
  path: string;
  resolvedPath?: string;
}

interface EmbedVariableDirective extends BaseEmbedDirective {
  subtype: 'embedVariable';
  variable: {
    name: string;
    fieldPath?: string;
    valueType: 'text' | 'data';
  };
}

interface EmbedTemplateDirective extends BaseEmbedDirective {
  subtype: 'embedTemplate';
  template: string;
  variableReferences: string[];
}
```

## Integration with ValidationService

With these streamlined types, our ValidationService will:

1. Register specific validators for each embed subtype
2. Use the `rawDirectiveText` for context in error messages
3. Validate based on subtype-specific rules implemented in the service
4. Throw appropriate MeldDirectiveError instances with helpful messages
5. Support the Client Factory pattern for circular dependencies

## Compatibility with Service Architecture

This approach better aligns with our DI architecture by:

1. **Separating Concerns**: Types define structure, validators define rules
2. **Enabling Extensibility**: New validation rules can be added without type changes
3. **Supporting DI Patterns**: Compatible with our Client Factory pattern for circular dependencies
4. **Minimal Interface**: Provides only what's needed for validation without complicating types

## Implementation Considerations

The ValidationService implementation would:

1. Register validators for each embed subtype during initialization
2. Expose a minimal client interface for other services if needed
3. Identify the appropriate validator based on the directive subtype
4. Use the `rawDirectiveText` for contextual error messages
5. Apply validation rules consistently across all embed types

## Conclusion

After closer examination of our service architecture and dependency patterns, I recommend adding only the `rawDirectiveText` field to the base interface. This minimalist approach keeps types focused on structure while allowing ValidationService to implement validation rules separately.

This approach better supports our DI architecture and dependency resolution patterns, while providing the essential information needed for robust validation. It avoids embedding validation behavior in types, which would create unnecessary coupling between type definitions and validation implementation. 