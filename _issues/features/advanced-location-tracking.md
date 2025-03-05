# Advanced Location Tracking Implementation Plan

## Overview

This document outlines our implementation plan for enhanced node transformation tracking in Claude Meld. This feature will provide reliable mapping between original directive nodes and their transformed versions, addressing issues with the current location-based matching approach.

## Background

Currently, the transformation pipeline relies on line number matching to connect original nodes with their transformed counterparts. This causes bugs when:

1. Transformed content has a different number of lines than the original directive
2. Other transformations in the document cause line number shifts
3. Complex documents have multiple transformations that interact with each other

We've implemented a short-term fix with a proximity-based matching algorithm in `OutputService`, but a more robust long-term solution is needed.

## Implementation Approach

While we wait for the Meld spec to potentially adopt our node ID proposal, we can implement our own enhanced tracking system with minimal changes to existing architecture.

### Phase 1: Enhanced StateService (Immediate Implementation)

1. **Extended Node Type**:
   ```typescript
   interface ExtendedMeldNode extends MeldNode {
     // Our internal extensions
     _meldNodeId?: string;
     _sourceNodeId?: string;
     _transformedNodeIds?: string[];
   }
   ```

2. **StateService Enhancement**:
   ```typescript
   // Modified transformNode method
   transformNode(originalNode: MeldNode, replacementNode: MeldNode): void {
     // Add IDs if not present
     if (!('_meldNodeId' in originalNode)) {
       (originalNode as ExtendedMeldNode)._meldNodeId = this.generateNodeId();
     }
     
     // Set relationship properties
     (replacementNode as ExtendedMeldNode)._meldNodeId = this.generateNodeId();
     (replacementNode as ExtendedMeldNode)._sourceNodeId = 
       (originalNode as ExtendedMeldNode)._meldNodeId;
     
     // Track backward reference
     (originalNode as ExtendedMeldNode)._transformedNodeIds = [
       ...((originalNode as ExtendedMeldNode)._transformedNodeIds || []),
       (replacementNode as ExtendedMeldNode)._meldNodeId
     ];
     
     // Original transformation logic
     const transformedNodes = this.getTransformedNodes();
     const index = transformedNodes.findIndex(node => 
       node === originalNode || 
       (node.location?.start.line === originalNode.location?.start.line)
     );
     
     if (index !== -1) {
       transformedNodes[index] = replacementNode;
     }
   }
   
   // New helper method
   generateNodeId(): string {
     return 'node_' + Math.random().toString(36).substr(2, 9);
   }
   
   // New finder method
   findTransformedNode(originalNode: MeldNode): MeldNode | undefined {
     const originalExtended = originalNode as ExtendedMeldNode;
     if (!originalExtended._meldNodeId) return undefined;
     
     return this.getTransformedNodes().find(node => 
       (node as ExtendedMeldNode)._sourceNodeId === originalExtended._meldNodeId
     );
   }
   ```

3. **OutputService Enhancement**:
   ```typescript
   private async nodeToMarkdown(node: MeldNode, state: IStateService): Promise<string> {
     // For directive nodes in transformation mode
     if (node.type === 'Directive' && state.isTransformationEnabled()) {
       const transformedNodes = state.getTransformedNodes();
       if (!transformedNodes?.length) return '[directive output placeholder]\n';
       
       // Step 1: Try to find by ID (new approach)
       const transformedByID = state.findTransformedNode?.(node);
       if (transformedByID && transformedByID.type === 'Text') {
         return this.formatTextNodeContent(transformedByID as TextNode);
       }
       
       // Step 2: Fall back to line number matching (current approach)
       const transformedByLine = transformedNodes.find(n => 
         n.location?.start.line === node.location?.start.line
       );
       if (transformedByLine && transformedByLine.type === 'Text') {
         return this.formatTextNodeContent(transformedByLine as TextNode);
       }
       
       // Step 3: Fall back to proximity matching (our current fix)
       const closestNode = this.findClosestNodeByLocation(node, transformedNodes);
       if (closestNode && closestNode.type === 'Text') {
         return this.formatTextNodeContent(closestNode as TextNode);
       }
       
       // No match found
       return '[directive output placeholder]\n';
     }
     
     // Rest of implementation...
   }
   
   private findClosestNodeByLocation(originalNode: MeldNode, transformedNodes: MeldNode[]): MeldNode | null {
     // Existing proximity algorithm...
   }
   
   private formatTextNodeContent(node: TextNode): string {
     const content = node.content;
     return content.endsWith('\n') ? content : content + '\n';
   }
   ```

### Phase 2: Dedicated Transformation Tracking Service (Future)

Once the initial enhancement is working, we can consider a more comprehensive solution:

1. **Create TransformationTrackingService**:
   ```typescript
   @injectable()
   class TransformationTrackingService implements ITransformationTrackingService {
     private nodeMap: Map<string, string[]> = new Map(); // source -> transformed
     private sourceMap: Map<string, string> = new Map();  // transformed -> source
     
     trackTransformation(sourceNode: MeldNode, resultNode: MeldNode): void {
       // Implementation
     }
     
     findTransformedNodes(sourceNode: MeldNode): MeldNode[] {
       // Implementation
     }
     
     findSourceNode(transformedNode: MeldNode): MeldNode | undefined {
       // Implementation
     }
   }
   ```

2. **Refactor StateService** to delegate transformation tracking
3. **Update Directive Handlers** to use the new service

## Benefits

1. **Robustness**: Precise tracking regardless of document structure changes
2. **Maintainability**: Clear relationship between nodes makes code more understandable
3. **Extensibility**: Foundation for more complex transformations in the future
4. **Performance**: Direct lookups instead of searching through arrays

## Testing Strategy

1. **Unit Tests**:
   - Test ID generation and node relationship tracking
   - Test fallback mechanisms when IDs are missing
   - Test mapping in complex transformation scenarios

2. **Integration Tests**:
   - Test complete transformation pipeline with various directives
   - Test nested transformations and multiple transformations

3. **E2E Tests**:
   - Test the complete system with complex documents
   - Ensure output matches expected transformed content

## Implementation Timeline

1. **Phase 1: Enhanced StateService**
   - Week 1: Implement node ID generation and tracking
   - Week 1: Update OutputService to use new tracking
   - Week 2: Add comprehensive tests
   - Week 2: Documentation and review

2. **Phase 2: Dedicated Service** (Future)
   - TBD based on evaluation of Phase 1

## Migration Considerations

The implementation will maintain backward compatibility:
- The enhanced node tracking will work alongside existing line-based matching
- The algorithm will gracefully degrade to current behavior when node IDs aren't available
- We'll maintain the existing proximity-based matcher as a last resort

## Risks and Mitigations

1. **Risk**: Performance impact of UUID generation
   **Mitigation**: Use lightweight ID generation and benchmark

2. **Risk**: Increased memory usage from additional node metadata
   **Mitigation**: Monitor memory usage in large documents

3. **Risk**: Complexity in maintaining bidirectional references
   **Mitigation**: Encapsulate logic in well-tested helper methods

## Future Considerations

1. Implement full support if/when the Meld spec adopts our node ID proposal
2. Explore visual debugging tools showing transformation relationships
3. Consider an event-based system for tracking transformations as they happen