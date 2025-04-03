# Consolidated State Services Feedback on Embed Types

## Executive Summary

After thorough review by the StateService, StateEventService, and StateTrackingService teams, we have concluded that the current embed.types.ts draft provides a basic foundation but requires significant enhancements to support our state management architecture. This document consolidates our feedback and presents a unified recommendation.

## Core Requirements Across State Services

All three state service teams identified similar core requirements:

1. **Unique Identifiers**: Every directive needs unique IDs for state tracking, event management, and dependency resolution
2. **Parent-Child Relationships**: Clear tracking of state inheritance and boundaries
3. **Transformation Support**: Comprehensive tracking of node transformations
4. **Variable Resolution Context**: More detailed control of variable resolution
5. **Event Management**: Support for state change events and propagation
6. **Debug Infrastructure**: Proper integration with debugging and visualization tools

## Consolidated Type Structure Recommendation

Based on our combined analysis, we propose this enhanced type structure for embed directives:

```typescript
// Base interface shared by all embed types
interface BaseEmbedDirective {
  // Core identification
  id: string;
  type: 'EmbedDirective';
  subtype: 'embedPath' | 'embedVariable' | 'embedTemplate';
  
  // Source location information
  location: {
    start: { line: number; column: number; };
    end: { line: number; column: number; };
    source?: string;
  };
  
  // State management
  stateInfo: {
    stateId: string;  // Unique state identifier
    createsChildState: boolean;
    childStateId?: string;
    inheritVariables: boolean;
    parentStateId?: string;
    variableNamespace?: string;
    variableInheritanceMap?: {
      text: string[];
      data: string[];
      path: string[];
      commands: string[];
    };
  };
  
  // Transformation tracking
  transformationInfo: {
    isTransformed: boolean;
    originalNodeId?: string;
    transformedNodeIds?: string[];
    transformationMap?: {
      before: { [key: string]: any };
      after: { [key: string]: any };
    };
  };
  
  // Variable resolution
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
    };
  };
  
  // Event system integration
  eventInfo: {
    shouldTriggerEvents: boolean;
    eventTypes: Array<string>;
    eventNamespace?: string;
    eventSubscriberIds?: string[];
    eventMetadata?: {
      timestamp: number;
      initiator: string;
      operationId: string;
    };
    eventPropagation?: {
      bubbleEvents: boolean;
      captureEvents: boolean;
      excludedEventTypes?: string[];
      crossBoundaryPropagation?: boolean;
    };
  };
  
  // Tracking and debugging (optional in production)
  trackingInfo?: {
    operationId: string;
    timestamps: {
      created: number;
      processed?: number;
      transformed?: number;
      completed?: number;
    };
    stateRelationships: {
      parentStateIds: string[];
      childStateIds: string[];
      siblingStateIds?: string[];
    };
    processingTrace: {
      sequence: number;
      depth: number;
      callStack?: string;
      initiatorId?: string;
    };
    dependencyInfo: {
      variableDependencies: {
        text: string[];
        data: string[];
        path: string[];
        commands: string[];
      };
      fileDependencies?: string[];
      directiveDependencies?: string[];
      circularReferenceChecks?: {
        checked: boolean;
        referencePath?: string[];
        potentialCircular?: boolean;
      };
    };
    historyInfo?: {
      previousStates?: Array<{
        stateId: string;
        timestamp: number;
        changes: Array<{
          property: string;
          oldValue: any;
          newValue: any;
        }>;
      }>;
      version: number;
      lineage?: {
        rootId: string;
        path: string[];
      };
    };
    visualizationInfo?: {
      variableFlow: {
        source: Array<{ stateId: string; variableName: string; }>;
        target: Array<{ stateId: string; variableName: string; }>;
      };
      transformationChain: {
        originalNodeId: string;
        intermediateNodeIds: string[];
        finalNodeIds: string[];
      };
      debugMarkers?: Array<{
        id: string;
        type: string;
        message: string;
      }>;
    };
  };
}

// Type-specific interfaces
interface EmbedPathDirective extends BaseEmbedDirective {
  subtype: 'embedPath';
  path: string;
  resolvedPath?: string;
  pathEmbedEvents?: {
    beforePathResolution?: boolean;
    afterPathResolution?: boolean;
    beforeContentLoad?: boolean;
    afterContentLoad?: boolean;
  };
}

interface EmbedVariableDirective extends BaseEmbedDirective {
  subtype: 'embedVariable';
  variable: {
    name: string;
    fieldPath?: string;
    valueType: 'text' | 'data';
  };
  variableEmbedEvents?: {
    beforeVariableResolution?: boolean;
    afterVariableResolution?: boolean;
    beforeFieldAccess?: boolean;
    afterFieldAccess?: boolean;
  };
}

interface EmbedTemplateDirective extends BaseEmbedDirective {
  subtype: 'embedTemplate';
  template: string;
  variableReferences: string[];
  templateEmbedEvents?: {
    beforeTemplateProcessing?: boolean;
    afterTemplateProcessing?: boolean;
    beforeVariableSubstitution?: boolean;
    afterVariableSubstitution?: boolean;
  };
}
```

## Progressive Implementation Approach

We recognize that implementing this full type structure immediately may be challenging. We suggest a phased approach:

### Phase 1 (Critical)
1. Add unique IDs
2. Enhance state relationship tracking
3. Improve transformation metadata
4. Add basic event support

### Phase 2 (Important)
1. Add resolution context details
2. Implement event propagation controls
3. Add dependency tracking

### Phase 3 (Complete)
1. Add full history tracking
2. Implement visualization support
3. Add performance metrics

## Dependency Injection Considerations

Our enhanced types would require updates to several client interfaces:

1. **StateServiceClient**
   - Methods for state inheritance control
   - Variable copying with granular control
   - Transformation tracking

2. **StateEventServiceClient**
   - Event subscription and filtering
   - Propagation control
   - Performance optimization toggles

3. **StateTrackingServiceClient** (Debug only)
   - Visualization data collection
   - History tracking
   - Performance impact control

## Conclusion

The current embed.types.ts draft provides a starting point but requires significant enhancement to support our state management architecture. Our consolidated recommendation provides a comprehensive type structure that addresses the needs of all three state services while maintaining clean separation of concerns.

We believe these enhancements will improve maintainability, enable better debugging, and support the robust event system needed for complex embed directive processing. We are available to discuss implementation details and prioritization with the types team. 