# StateEventService Team Feedback on Embed Types Draft 2

## Overall Assessment

The StateEventService team has reviewed the second draft of the embed types specification. We appreciate the significant improvements in the overall structure and the inclusion of event tracking in the debugging layer. However, we have concerns about relegating event management exclusively to the debug layer, as event propagation is a core runtime requirement, not just for debugging.

## Strengths

1. The layered approach with core types and service-specific metadata provides clear separation of concerns
2. The inclusion of event tracking in the debug metadata layer is a good start
3. The event propagation controls in the debug metadata are well-structured

## Key Concerns

### 1. Events Should Not Be Debug-Only

Our primary concern is that event management is treated as a debug-only feature:

```typescript
// Currently in DebugMetadata (optional, dev-only)
eventTracking?: {
  eventTypes: string[];
  eventBubbling: boolean;
  eventSubscribers: string[];
  eventPropagation: {
    bubbleEvents: boolean;
    captureEvents: boolean;
    crossBoundary: boolean;
  };
};
```

Events are a core part of our state management architecture, used in production for:
- Notifying components about state changes
- Coordinating actions between services
- Providing extension points for plugins
- Managing state synchronization

We strongly recommend moving the event system to a core metadata layer:

```typescript
/**
 * Metadata for EventService
 */
interface EventMetadata {
  eventTypes: string[];                              // Event types this directive can trigger
  eventSubscribers: string[];                        // Components subscribed to these events
  shouldTriggerEvents: boolean;                      // Whether events should be triggered
  suppressEvents?: boolean;                          // For temporarily disabling events
  
  propagation: {
    bubbleEvents: boolean;                           // Whether events bubble up to parent
    captureEvents: boolean;                          // Whether events propagate down to children
    crossBoundary: boolean;                          // Whether events cross state boundaries
    excludedEventTypes?: string[];                   // Events that should not propagate
  };
  
  lifecycle: {
    beforeProcessing?: string[];                     // Events to trigger before processing
    afterProcessing?: string[];                      // Events to trigger after processing
    onError?: string[];                              // Events to trigger on error
  };
}
```

### 2. Event Type Specificity

The current event tracking lacks specific event types for embed directives. We recommend defining explicit event types for each embed subtype:

```typescript
// For BaseEmbedDirective
baseEventTypes: Array<
  | 'embed:beforeProcess' 
  | 'embed:afterProcess'
  | 'embed:beforeTransform'
  | 'embed:afterTransform'
  | 'embed:error'
>;

// For EmbedPathDirective
pathEventTypes: Array<
  | 'embedPath:beforePathResolution'
  | 'embedPath:afterPathResolution'
  | 'embedPath:beforeContentLoad'
  | 'embedPath:afterContentLoad'
  | 'embedPath:fileNotFound'
>;

// For EmbedVariableDirective
variableEventTypes: Array<
  | 'embedVariable:beforeResolution'
  | 'embedVariable:afterResolution'
  | 'embedVariable:beforeFieldAccess'
  | 'embedVariable:afterFieldAccess'
  | 'embedVariable:resolutionError'
>;

// For EmbedTemplateDirective
templateEventTypes: Array<
  | 'embedTemplate:beforeProcessing'
  | 'embedTemplate:afterProcessing'
  | 'embedTemplate:beforeVariableSubstitution'
  | 'embedTemplate:afterVariableSubstitution'
  | 'embedTemplate:substitutionError'
>;
```

### 3. Event Payload Definition

Events need to carry payload data. The current specification doesn't define how event payloads are structured:

```typescript
eventPayloads: {
  [eventType: string]: {
    payloadSchema: string;              // JSON Schema or type reference
    includeState: boolean;              // Whether to include state in payload
    includeDirective: boolean;          // Whether to include directive in payload
    includeMetadata: boolean;           // Whether to include metadata in payload
  };
};
```

### 4. Event Subscription Management

The current draft lacks mechanisms for managing event subscriptions:

```typescript
subscriptionManagement: {
  autoUnsubscribe: boolean;             // Whether to auto-unsubscribe when done
  subscriptionLifecycle: 'transient' | 'persistent' | 'sticky';
  priorityLevel?: number;               // Event priority (for ordering)
};
```

## Implementation Considerations

1. **Performance Impact**: Event systems need to be optimized for performance. We recommend:
   - Adding a global event enable/disable flag
   - Supporting event batching for high-frequency operations
   - Having selective event filtering to reduce unnecessary processing

2. **Client Interface Updates**: The StateEventServiceClient would need new methods:
   ```typescript
   interface StateEventServiceClient {
     subscribeToEvents(stateId: string, eventTypes: string[], callback: EventCallback): SubscriptionId;
     unsubscribeFromEvents(subscriptionId: SubscriptionId): void;
     triggerEvent(stateId: string, eventType: string, payload?: any): void;
     batchEvents(stateId: string, events: Array<{type: string, payload?: any}>): void;
   }
   ```

3. **Backward Compatibility**: Existing code could still work with a minimal default event model, but the full power of the event system would require adoption of the new types.

## Conclusion

While the second draft shows significant improvement, we strongly believe that event management should be elevated from the debug layer to a core metadata layer. Events are an essential part of our runtime architecture, not just a debugging tool.

The suggested EventMetadata interface would provide comprehensive support for our event system requirements while maintaining clean separation of concerns. With these changes, the types would fully support both our current implementation and future enhancements to the event system. 