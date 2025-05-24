# OutputService Testing Strategy

## Background

The OutputService is responsible for converting processed AST nodes into various output formats (markdown, XML). It operates as the final stage in the Meld pipeline.

## Key Learnings

### Why Fixture-Based Unit Tests Don't Work for OutputService

1. **OutputService expects transformed nodes, not raw AST**: The service operates on nodes that have already been processed by the InterpreterService and directive handlers. Raw AST fixtures contain Directive nodes that OutputService simply ignores.

2. **Transformation requires full pipeline execution**: To generate proper transformed nodes from fixtures, we would need to:
   - Execute directive handlers
   - Manage state transformations
   - Handle variable resolution
   - Process all dependencies

3. **Unit vs Integration testing boundaries**: Creating transformed nodes from fixtures effectively requires running the entire pipeline, which makes it an integration test rather than a unit test.

## Testing Strategy

### Unit Tests (OutputService.test.ts)
- Use manually crafted transformed nodes
- Mock StateService to return pre-transformed content
- Focus on testing formatting logic in isolation
- Test each output format independently

### Integration Tests (OutputService.integration.test.ts)
- Use complete fixtures with the full pipeline
- Test end-to-end transformation and output
- Verify that directive processing integrates correctly with output formatting

## Fixture Structure Considerations

Current fixtures contain:
- `input`: Raw Meld source
- `expected`: Expected final output
- `ast`: Parsed AST nodes

For OutputService integration tests, we would need:
- `transformedNodes`: The nodes after directive processing
- This would require running the full pipeline

## Recommendations

1. Keep OutputService unit tests focused on formatting logic with manual test data
2. Create separate integration tests for end-to-end fixture validation
3. Consider adding a `transformedNodes` field to fixtures if many services need this data
4. Document the distinction between raw AST and transformed nodes clearly