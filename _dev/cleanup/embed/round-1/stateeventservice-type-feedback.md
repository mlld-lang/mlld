# StateEventService Team Feedback on Embed Types

## Overview

After reviewing the embed.types.ts draft from the StateEventService perspective, we have identified several areas where the current types would benefit from additional event-related properties to properly support our event propagation and subscription model.

## Current Limitations

The current draft types don't include any event-related properties. StateEventService is responsible for:
- Handling state change events
- Managing state updates
- Providing event hooks
- Supporting state tracking through events

Without event metadata in the embed types, our service cannot properly track and notify subscribers about state changes during embed directive processing.

## Recommended Additions

### 1. Event Metadata

We recommend adding an `eventInfo` section to the `BaseEmbedDirective`:

```typescript
eventInfo: {
  // Controls whether this directive should trigger state change events
  shouldTriggerEvents: boolean;
  
  // Specific event types to trigger
  eventTypes: Array<
    | 'beforeEmbed' 
    | 'afterEmbed'
    | 'beforeStateChange'
    | 'afterStateChange'
    | 'beforeTransformation'
    | 'afterTransformation'
  >;
  
  // For filtering events by namespace
  eventNamespace?: string;
  
  // IDs of subscribers that should receive these events
  eventSubscriberIds?: string[];
  
  // Event metadata for tracking and debugging
  eventMetadata?: {
    timestamp: number;
    initiator: string;  // Which service initiated the operation
    operationId: string; // For tracking entire operation chains
  };
}
```

### 2. Event Propagation Controls

For controlling how events propagate between parent and child states:

```typescript
eventPropagation: {
  // Whether events from child states bubble up to parent
  bubbleEvents: boolean;
  
  // Whether events from parent propagate down to children
  captureEvents: boolean;
  
  // Event types that should NOT propagate (overrides bubbleEvents)
  excludedEventTypes?: string[];
  
  // Control propagation across state boundaries
  crossBoundaryPropagation?: boolean;
}
```

### 3. Embed-Specific Event Properties

For each embed subtype, we need specific event properties:

```typescript
// For EmbedPathDirective
pathEmbedEvents?: {
  beforePathResolution?: boolean;
  afterPathResolution?: boolean;
  beforeContentLoad?: boolean;
  afterContentLoad?: boolean;
};

// For EmbedVariableDirective
variableEmbedEvents?: {
  beforeVariableResolution?: boolean;
  afterVariableResolution?: boolean;
  beforeFieldAccess?: boolean;
  afterFieldAccess?: boolean;
};

// For EmbedTemplateDirective
templateEmbedEvents?: {
  beforeTemplateProcessing?: boolean;
  afterTemplateProcessing?: boolean;
  beforeVariableSubstitution?: boolean;
  afterVariableSubstitution?: boolean;
};
```

## Integration with State Management

The event system needs to be tightly integrated with state management:

1. **State Change Event Triggers**: 
   - When variables are copied between states
   - When transformed nodes are created
   - When original nodes are replaced

2. **State Boundary Event Controls**:
   - Events should know whether to cross state boundaries
   - Parent states need control over which events from child states they receive

3. **Subscriber Management**:
   - Need to track which components are subscribed to which events
   - Must maintain clean unsubscription when states are disposed

## Dependency Concerns

Given our DI architecture, we need to ensure that:

1. The StateEventService client interface exposes enough methods without creating circular dependencies
2. Event handling doesn't block the main processing pipeline
3. Events can be disabled in performance-critical paths

## Closing Thoughts

The current embed types draft needs significant enhancement to support our event system requirements. We'd be happy to collaborate with other teams to develop a unified type system that addresses both state management and event propagation needs for embed directives. 