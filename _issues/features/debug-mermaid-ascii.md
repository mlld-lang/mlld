# Mermaid-ASCII Integration for Debugging Tools

## Current State

We have created the foundation for ASCII visualization capabilities in our debugging tools but haven't fully implemented the integration. The current implementation consists of:

1. **Proof of Concept Components**:
   - A stub script at `tests/utils/mermaid-ascii/bin/mermaid-ascii` that demonstrates how the CLI tool would work
   - An example integration file at `tests/utils/mermaid-ascii/cli-integration-example.ts` showing how ASCII visualization could be integrated with CLI commands
   - Updated interfaces in `IStateVisualizationService.ts` to include 'ascii' as a supported visualization format

2. **Interface Updates**:
   - Added 'ascii' to the `VisualizationFormat` type in `IStateVisualizationService.ts`
   - Added ASCII-specific options to the `VisualizationConfig` interface

3. **Tests**:
   - Created test cases for ASCII visualization in `StateVisualizationService.test.ts`, but these currently fail because the actual implementation is incomplete

## Missing Components

The following components need to be implemented for a complete integration:

1. **Core Implementation**:
   - Update `StateVisualizationService.ts` to handle the 'ascii' format in all visualization methods:
     - `generateHierarchyView`
     - `generateRelationshipGraph`
     - `generateTimeline`
     - `generateTransitionDiagram`

2. **Mermaid to ASCII Conversion**:
   - Implement a robust conversion function from Mermaid syntax to ASCII art
   - Handle different diagram types (flowcharts, sequence diagrams, etc.)
   - Support customization options like width, character set, etc.

3. **Integration with State Debugging Tools**:
   - Complete integration with `StateDebuggerService` to enable ASCII output
   - Ensure all visualization methods support the ASCII format

4. **CLI Integration**:
   - Integrate with existing CLI debug commands
   - Add ASCII output options to relevant commands

## Implementation Plan

### Phase 1: Complete Core Functionality

1. **Implement Mermaid to ASCII Conversion**:
   - Develop a full implementation of the `mermaidToAscii` utility function
   - Support basic diagram types (flowcharts, sequence diagrams)
   - Add configuration options for output customization

2. **Update StateVisualizationService**:
   - Modify `generateHierarchyView` to handle ASCII format
   - Implement ASCII output for `generateRelationshipGraph`
   - Add ASCII support to `generateTimeline` and `generateTransitionDiagram`
   - Create helper methods for consistent ASCII styling

### Phase 2: Debug Tool Integration

1. **Integration with StateDebuggerService**:
   - Update `StateDebuggerService` to use ASCII visualization when requested
   - Add configuration options for ASCII output in debug sessions

2. **Testing**:
   - Complete test coverage for ASCII visualization functionality
   - Add integration tests with real implementations

### Phase 3: CLI Integration

1. **Update CLI Commands**:
   - Add ASCII output option to `debug-context` command
   - Add ASCII output option to `debug-resolution` command
   - Add ASCII output option to any other relevant debug commands

2. **Documentation**:
   - Update help text and documentation for CLI commands
   - Add examples of ASCII visualization usage

3. **User Experience**:
   - Improve terminal detection and adjust output based on terminal capabilities
   - Add color support for terminals that support it

## Technical Details

### ASCII Conversion Implementation

The core of the implementation will be the `mermaidToAscii` function, which should:

1. Parse Mermaid syntax or use existing Mermaid generation functions
2. Convert the diagram structure to an equivalent ASCII representation
3. Support different diagram types:
   - Flowcharts (`graph TD`, `graph LR`)
   - Sequence diagrams
   - State diagrams
   - Class diagrams (if used)

A simplified implementation might look like:

```typescript
function mermaidToAscii(mermaidCode: string, options: AsciiOptions): string {
  // Determine diagram type
  if (mermaidCode.includes('graph TD') || mermaidCode.includes('graph LR')) {
    return convertFlowchartToAscii(mermaidCode, options);
  } else if (mermaidCode.includes('sequenceDiagram')) {
    return convertSequenceDiagramToAscii(mermaidCode, options);
  } else if (mermaidCode.includes('classDiagram')) {
    return convertClassDiagramToAscii(mermaidCode, options);
  } else {
    // Handle other diagram types or unknown formats
    return createGenericAsciiRepresentation(mermaidCode, options);
  }
}
```

### CLI Integration Details

The CLI integration should allow users to choose ASCII output through command-line options:

```bash
# Example commands with ASCII output
debug-context pipeline.ts --output ascii
debug-resolution $stateId pipeline.ts --output ascii
```

The CLI command handlers would need to pass the appropriate format option to the visualization service:

```typescript
function handleDebugContextCommand(args: any) {
  // ...existing code...
  
  const format = args.output || 'mermaid';
  const visualization = visualizationService.visualizeContextHierarchy(rootStateId, {
    format: format,
    includeMetadata: true,
    // ASCII-specific options when format is 'ascii'
    asciiWidth: args.width || 80,
    asciiCharset: args.charset || 'default'
  });
  
  console.log(visualization);
}
```

## Benefits and Use Cases

1. **Terminal-Friendly Debugging**:
   - View diagram visualizations directly in terminals without requiring external tools
   - Especially useful in SSH sessions or environments where graphical output isn't available

2. **Documentation and Logging**:
   - Include ASCII diagrams in logs and plain text documentation
   - Preserves visualization information in text-only contexts

3. **Accessibility**:
   - Provides an alternative visualization format that can be read by screen readers
   - Improves accessibility for users who rely on text-based interfaces

## Next Steps

1. Implement the core `mermaidToAscii` conversion function
2. Update the `StateVisualizationService` implementation to handle ASCII format
3. Add tests for the new functionality
4. Integrate with CLI commands
5. Document the new capabilities

The implementation should aim to be both robust and flexible, allowing for future expansion to support additional diagram types and visualization options. 