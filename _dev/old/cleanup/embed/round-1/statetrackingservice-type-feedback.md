# StateTrackingService Team Feedback on Embed Types

## Overview

Our StateTrackingService team has reviewed the embed.types.ts draft with a focus on our specific service needs. The StateTrackingService is responsible for:

- Monitoring state relationships and dependencies
- Tracking state lineage and inheritance
- Recording metadata about state changes
- Helping debug scope and inheritance issues
- Providing visualization and debugging capabilities

The current draft lacks several critical components needed for proper state tracking and debugging support.

## Required Enhancements

### 1. State Tracking Metadata

We need to add explicit tracking metadata to the `BaseEmbedDirective`:

```typescript
trackingInfo: {
  // Unique identifier for this state operation
  operationId: string;
  
  // Timestamps for performance monitoring
  timestamps: {
    created: number;
    processed?: number;
    transformed?: number;
    completed?: number;
  };
  
  // State relationships
  stateRelationships: {
    parentStateIds: string[];  // Can have multiple "parents" in complex scenarios
    childStateIds: string[];   // Can create multiple child states
    siblingStateIds?: string[]; // Related states in the same context
  };
  
  // Track call stack and sequence
  processingTrace: {
    sequence: number;
    depth: number;
    callStack?: string;
    initiatorId?: string;  // Which component initiated this operation
  };
}
```

### 2. State Dependency Tracking

To properly handle circular dependencies and state relationships:

```typescript
dependencyInfo: {
  // Variables this directive depends on
  variableDependencies: {
    text: string[];
    data: string[];
    path: string[];
    commands: string[];
  };
  
  // Files this directive depends on (for path embeds)
  fileDependencies?: string[];
  
  // Other directives this one depends on
  directiveDependencies?: string[];
  
  // For circular dependency detection
  circularReferenceChecks?: {
    checked: boolean;
    referencePath?: string[];
    potentialCircular?: boolean;
  };
}
```

### 3. State Inheritance Visualization Support

For our visualization capabilities:

```typescript
visualizationInfo: {
  // Track variable inheritance visually
  variableFlow: {
    source: { stateId: string; variableName: string; }[];
    target: { stateId: string; variableName: string; }[];
  };
  
  // For tracking transformations visually
  transformationChain: {
    originalNodeId: string;
    intermediateNodeIds: string[];
    finalNodeIds: string[];
  };
  
  // For debugging
  debugMarkers?: {
    id: string;
    type: string;
    message: string;
  }[];
}
```

### 4. Directive History and Lineage

To properly track the history of state changes:

```typescript
historyInfo: {
  // Previous states of this directive (for undo/history)
  previousStates?: {
    stateId: string;
    timestamp: number;
    changes: {
      property: string;
      oldValue: any;
      newValue: any;
    }[];
  }[];
  
  // State version tracking
  version: number;
  lineage?: {
    rootId: string;  // Original root state
    path: string[];  // Path of states from root to this state
  };
}
```

## Integration with Debug Infrastructure

The StateTrackingService operates primarily in the debug infrastructure. To integrate with our debugging tools, the embed types must support:

1. **Snapshots**: Ability to capture the complete state at any point
2. **Diffing**: Support for comparing states before and after operations
3. **History**: Tracking the complete chain of state changes
4. **Visualization**: Data needed for generating state relationship diagrams
5. **Performance Metrics**: Timing data for tracking processing performance

## Use in Testing

Our service is heavily used in testing, and these types would need to support:

1. **Test Fixture Integration**: Ability to set up known state configurations
2. **State Assertion Support**: Fields that can be used for test assertions
3. **Mocking Support**: Clear interfaces for creating test doubles
4. **Reproducibility**: Complete state snapshots for reproducing issues

## Implementation Considerations

Given our role in the DI architecture:

1. The StateTrackingService needs to remain optional (disabled in production)
2. The tracking data should be serializable for diagnostic purposes
3. Client interfaces need to expose debug-specific methods
4. Performance impact must be minimal when not in debug mode

## Conclusion

The current embed.types.ts draft is insufficient for our tracking and debugging needs. We recommend a significant extension of the types to include the tracking metadata, dependency information, and visualization support outlined above. These enhancements would enable proper state tracking, debugging, and visualization capabilities without compromising the core functionality of the embed directive. 