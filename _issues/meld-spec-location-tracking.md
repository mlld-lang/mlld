# Proposal: Add Transformation Tracking to MeldNode Specification

## Issue Summary

When performing transformations on Meld documents, the current specification lacks a reliable way to track the relationship between original nodes and their transformed versions. This leads to difficulties in correctly mapping content during output generation, especially when document structure changes (like line number shifts).

## Background

The Meld transformation pipeline converts directives into their output content. For example, an `@embed` directive becomes the embedded file's content in the output. Currently, the transformation process relies on positional information (line numbers) to match transformed nodes with their sources, which is fragile and error-prone when document structure changes.

## Proposed Solution

Enhance the `MeldNode` interface in the spec to include transformation metadata that explicitly tracks relationships between source nodes and their transformed counterparts:

```typescript
interface MeldNode {
  // Existing properties
  type: string;
  location?: Location;
  
  // New properties for transformation tracking
  nodeId?: string;            // Unique identifier for this node
  sourceNodeId?: string;      // Reference to original node (for transformed nodes)
  transformedNodeIds?: string[]; // References to derived nodes (for source nodes)
}
```

## Benefits

1. **Explicit Relationships**: No guessing or matching algorithms needed to find which node became what
2. **Resilience**: Position-independence makes transformations robust to document structure changes
3. **Composability**: Enables more complex transformations like one-to-many (splitting) or many-to-one (merging)
4. **Traceability**: Creates a clear lineage of how content evolved during processing

## Implementation Notes

- The `nodeId` would be generated when nodes are first created (parsing phase)
- `sourceNodeId` would be set when a node is created as a transformation of another
- `transformedNodeIds` would track all nodes that resulted from transforming this node
- All fields are optional for backward compatibility

## Impact on Existing Implementations

This change is backward compatible as all new fields are optional. Existing implementations can ignore these fields without any issues. Implementations that want to leverage this feature would need to:

1. Generate and assign `nodeId` values during parsing
2. Track relationships during transformation
3. Use these relationships when converting nodes to output

## Example Usage

```typescript
// During transformation
const replacementNode = {
  type: 'Text',
  content: embedContent,
  location: originalNode.location,
  nodeId: generateUniqueId(),
  sourceNodeId: originalNode.nodeId
};

// Update the original node
originalNode.transformedNodeIds = [
  ...(originalNode.transformedNodeIds || []),
  replacementNode.nodeId
];

// During output generation
function findTransformedNode(originalNode, allTransformedNodes) {
  // Find directly by ID instead of matching by location
  return allTransformedNodes.find(node => 
    node.sourceNodeId === originalNode.nodeId
  );
}
```

## Alternatives Considered

1. **Location-based matching**: Current approach, but fragile when content shifts occur
2. **Parallel transformation arrays**: Keeping parallel arrays of original and transformed nodes, but complex to maintain
3. **External mapping table**: Storing mappings outside the nodes, but adds complexity and separation of concerns

The proposed solution offers the best balance of simplicity, robustness, and backward compatibility.

## Questions for Discussion

1. Should we make the IDs required or keep them optional?
2. What's the best ID generation strategy to ensure uniqueness across environments?
3. Would a single bidirectional link be sufficient instead of separate source/target fields?
4. Are there additional transformation metadata we should consider including?