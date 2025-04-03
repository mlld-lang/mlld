# StateService Team Feedback on Embed Types

## Overview

Our team has reviewed the current embed.types.ts draft from the perspective of the StateService responsibilities. While the draft provides a good foundation, we have several suggestions to ensure proper state management for embed directives.

## Current Strengths

- The stateInfo section with `createsChildState` and `inheritVariables` flags is essential
- Location tracking will help with transformation mapping
- The subtype differentiation aligns with the three distinct embed syntaxes

## Areas for Improvement

### 1. State Context Management

The current draft lacks unique state identifiers and complete parent-child relationship tracking:

```typescript
stateInfo: {
  createsChildState: boolean;
  inheritVariables: boolean;
  parentStateId?: string;  // Good to have, but insufficient
}
```

We recommend enhancing this to:

```typescript
stateInfo: {
  stateId: string;         // Required unique identifier
  createsChildState: boolean;
  childStateId?: string;   // ID of child state when created
  inheritVariables: boolean;
  parentStateId?: string;
  variableNamespace?: string;  // For variable scoping/prefixing
  variableInheritanceMap?: {   // Specific variables to inherit
    text: string[];
    data: string[];
    path: string[];
    commands: string[];
  }
}
```

### 2. Transformation Tracking

The transformation info needs more detail to support our dual original/transformed node arrays:

```typescript
transformationInfo: {
  isTransformed: boolean;
  originalNodeId?: string;
  transformedNodeIds?: string[];  // Multiple nodes might replace one
  transformationMap?: {           // Track variable transformations
    before: { [key: string]: any };
    after: { [key: string]: any };
  }
}
```

### 3. Variable Resolution Context

For proper variable resolution, especially with templates and variable embedding:

```typescript
resolutionContext: {
  disablePathPrefixing: boolean;
  allowedVariableTypes: {
    text: boolean;
    data: boolean;
    path: boolean;
    commands: boolean;
  };
  variableReferences?: {
    detected: string[];
    resolved: { [key: string]: any };
  }
}
```

### 4. Event Triggers

To support StateEventService needs, add:

```typescript
eventInfo: {
  shouldTriggerEvents: boolean;
  eventNamespace?: string;
  eventSubscriptions?: string[];
}
```

## Implementation Considerations

1. The StateService needs to know exactly which variables to copy between parent and child states. The current design doesn't provide enough granularity.

2. For transformation support, we need better tracking of node replacement chains (one directive can be replaced by multiple nodes).

3. With our current DI architecture, the client interface for StateService needs to expose enough methods to handle all these operations without creating circular dependencies.

## Recommended Type Structure

We recommend a more comprehensive type structure that addresses these concerns while maintaining clean separation of concerns. The revised types should also consider the responsibilities of StateEventService and StateTrackingService.

Please let us know if you would like a complete revised type definition that incorporates these suggestions. 