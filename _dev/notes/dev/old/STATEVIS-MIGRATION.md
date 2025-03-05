# State Visualization System Migration Guide

Refer to [docs/STATEVIS.md] for full API guide

## Overview

This guide helps you migrate from legacy state tracking and visualization to the new State Visualization System. The new system provides enhanced capabilities for state visualization, relationship tracking, and metrics calculation.

## Migration Steps

### 1. Update Dependencies

Ensure your `package.json` includes the latest versions:

```json
{
  "dependencies": {
    "@meld/state-visualization": "^1.0.0",
    "@meld/state-history": "^1.0.0",
    "@meld/state-tracking": "^1.0.0"
  }
}
```

### 2. Replace Legacy State Tracking

#### Before:
```typescript
// Old way of tracking state
const state = new StateService();
state.addNode(node);
state.transformNode(originalNode, transformedNode);
```

#### After:
```typescript
// New way with StateVisualizationService
const vis = new StateVisualizationService(historyService, trackingService);
const state = new StateService();

// State operations are automatically tracked
state.addNode(node);
state.transformNode(originalNode, transformedNode);

// Generate visualizations when needed
const graph = vis.generateRelationshipGraph([state.getId()], {
  format: 'mermaid',
  includeMetadata: true
});
```

### 3. Update Visualization Code

#### Before:
```typescript
// Old way of generating state diagrams
function generateStateDiagram(state) {
  let diagram = 'graph TD\n';
  for (const node of state.getNodes()) {
    diagram += `  ${node.id}[${node.type}]\n`;
  }
  return diagram;
}
```

#### After:
```typescript
// New way using StateVisualizationService
function generateStateDiagram(stateId) {
  return vis.generateHierarchyView(stateId, {
    format: 'mermaid',
    includeMetadata: true
  });
}
```

### 4. Migrate Metrics Collection

#### Before:
```typescript
// Old way of collecting metrics
function getStateMetrics(state) {
  return {
    totalNodes: state.getNodes().length,
    transformations: state.getTransformations().length
  };
}
```

#### After:
```typescript
// New way using StateVisualizationService
async function getStateMetrics() {
  const metrics = await vis.getMetrics({
    start: Date.now() - 3600000, // Last hour
    end: Date.now()
  });
  
  return {
    totalStates: metrics.totalStates,
    statesByType: metrics.statesByType,
    averageTransformations: metrics.averageTransformationsPerState,
    maxChainLength: metrics.maxTransformationChainLength
  };
}
```

### 5. Update Error Handling

#### Before:
```typescript
// Old error handling
try {
  const diagram = generateStateDiagram(state);
} catch (error) {
  console.error('Failed to generate diagram:', error);
}
```

#### After:
```typescript
// New error handling with specific error types
try {
  const diagram = vis.generateHierarchyView(stateId, {
    format: 'mermaid'
  });
} catch (error) {
  if (error instanceof UnsupportedFormatError) {
    console.error('Unsupported diagram format');
  } else if (error instanceof StateNotFoundError) {
    console.error('State not found:', stateId);
  } else if (error instanceof VisualizationError) {
    console.error('Visualization error:', error.message);
  }
}
```

## Breaking Changes

1. **Constructor Changes**
   - StateVisualizationService now requires both historyService and trackingService
   - Legacy constructor parameters are no longer supported

2. **Method Renames**
   - `generateDiagram()` → `generateHierarchyView()`
   - `getMetrics()` now requires timeRange parameters
   - `transformNode()` automatically tracks transformations

3. **Return Types**
   - All visualization methods now return strings
   - Metrics are returned as StateMetrics interface
   - Errors are now specific error types

## Deprecation Schedule

1. **Phase 1 (Current)**
   - Legacy methods marked as deprecated
   - Warning messages in development
   - Both old and new APIs functional

2. **Phase 2 (Next Release)**
   - Legacy methods emit console warnings
   - New features only in new API
   - Documentation updated

3. **Phase 3 (Future Release)**
   - Legacy methods removed
   - Only new API supported
   - Migration required

## Best Practices

1. **Gradual Migration**
   - Migrate one component at a time
   - Test thoroughly after each migration
   - Keep legacy code until fully migrated

2. **Testing**
   - Update test cases for new API
   - Add tests for new features
   - Verify error handling

3. **Performance**
   - Use time ranges for metrics
   - Generate visualizations on-demand
   - Implement caching if needed

## Common Issues

1. **Missing Dependencies**
   ```typescript
   // Error: Cannot find module '@meld/state-visualization'
   // Solution: Update package.json and install dependencies
   npm install @meld/state-visualization @meld/state-history @meld/state-tracking
   ```

2. **Constructor Errors**
   ```typescript
   // Error: historyService is required
   // Solution: Provide both required services
   const vis = new StateVisualizationService(historyService, trackingService);
   ```

3. **Format Errors**
   ```typescript
   // Error: Unsupported format 'svg'
   // Solution: Use supported formats
   const graph = vis.generateHierarchyView(stateId, {
     format: 'mermaid' // or 'dot' or 'json'
   });
   ```

## Support

For migration support:
1. Check the API documentation
2. Review example code in tests
3. Submit issues for bugs
4. Request help in discussions 