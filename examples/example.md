
## Your role
[directive output placeholder]
## Documentation
### Target UX
[directive output placeholder]
### Architecture
[directive output placeholder]
 
### Meld Processing Pipeline
[directive output placeholder]
## Test Results
> meld@10.0.0 test
> vitest run
 RUN  v2.1.9 /Users/adam/dev/meld
 ✓ tests/utils/debug/StateVisualizationService/StateVisualizationService.test.ts (26 tests) 16ms
stdout | services/state/StateService/StateService.test.ts > StateService > State Tracking > should track state lineage
Initial State: graph TD;
After Creating Child: graph TD;
    e96871a3-2cd6-497e-8a7d-23a35c07c837 -->|parent-child| parent-child style="solid,#000000";
After Creating Grandchild: graph TD;
    e96871a3-2cd6-497e-8a7d-23a35c07c837 -->|parent-child| parent-child style="solid,#000000";
    f7a2f39e-0df2-40db-a78e-98c42d004199 -->|parent-child| parent-child style="solid,#000000";
State Lineage: [
  '49ebef4b-9cbd-4258-8208-e5562e92fba8',
  'e96871a3-2cd6-497e-8a7d-23a35c07c837',
  'f7a2f39e-0df2-40db-a78e-98c42d004199'
]
State Transitions: Complete Debug Report: Debug Session Report (76f6b53c-474d-494b-82fe-2997e665d300)
Duration: 0.003s
Diagnostics: Metrics:
Snapshots:
 ✓ services/state/StateService/StateService.test.ts (39 tests) 19ms
 ✓ services/pipeline/DirectiveService/handlers/definition/DefineDirectiveHandler.test.ts (20 tests) 29ms
 ✓ services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler.test.ts (16 tests | 2 skipped) 53ms
 ✓ services/pipeline/DirectiveService/handlers/definition/DataDirectiveHandler.test.ts (14 tests) 71ms
stdout | services/pipeline/InterpreterService/InterpreterService.integration.test.ts > InterpreterService Integration > State management > handles state rollback on merge errors
 ✓ services/pipeline/DirectiveService/handlers/execution/EmbedDirectiveHandler.test.ts (14 tests) 106ms
stdout | services/pipeline/InterpreterService/InterpreterService.integration.test.ts > InterpreterService Integration > Error handling > provides location information in errors
stdout | services/pipeline/InterpreterService/InterpreterService.integration.test.ts > InterpreterService Integration > Error handling > maintains state consistency after errors
stdout | services/pipeline/InterpreterService/InterpreterService.integration.test.ts > InterpreterService Integration > Error handling > includes state context in interpreter errors
stdout | services/pipeline/InterpreterService/InterpreterService.integration.test.ts > InterpreterService Integration > Error handling > rolls back state on directive errors
stdout | services/pipeline/OutputService/OutputService.test.ts > OutputService > XML Output > should preserve text content
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:04.315Z"}
stdout | services/pipeline/OutputService/OutputService.test.ts > OutputService > XML Output > should preserve code fence content
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:04.328Z"}
stdout | services/pipeline/OutputService/OutputService.test.ts > OutputService > XML Output > should handle directives according to type
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:04.331Z"}
stdout | services/pipeline/OutputService/OutputService.test.ts > OutputService > XML Output > should handle directives according to type
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:04.333Z"}
stdout | services/pipeline/OutputService/OutputService.test.ts > OutputService > XML Output > should preserve state variables when requested
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:04.337Z"}
stdout | api/integration.test.ts > API Integration Tests > Variable Definitions and References > should handle text variable definitions and references
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:04.314Z"}
stdout | services/pipeline/OutputService/OutputService.test.ts > OutputService > Transformation Mode > should handle XML output in both modes
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:04.351Z"}
stdout | services/pipeline/OutputService/OutputService.test.ts > OutputService > Transformation Mode > should handle XML output in both modes
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:04.352Z"}
stdout | services/pipeline/OutputService/OutputService.test.ts > OutputService > Error Handling > should throw MeldOutputError for unknown node types
stdout | services/pipeline/OutputService/OutputService.test.ts > OutputService > Error Handling > should wrap errors from format converters
stdout | services/pipeline/OutputService/OutputService.test.ts > OutputService > Error Handling > should preserve MeldOutputError when thrown from converters
 ✓ services/pipeline/OutputService/OutputService.test.ts (24 tests) 172ms
 ✓ services/pipeline/InterpreterService/InterpreterService.integration.test.ts (24 tests | 3 skipped) 171ms
stdout | api/integration.test.ts > API Integration Tests > Variable Definitions and References > should handle data variable definitions and field access
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:04.382Z"}
stdout | api/integration.test.ts > API Integration Tests > Variable Definitions and References > should handle complex nested data structures
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:04.409Z"}
stdout | api/integration.test.ts > API Integration Tests > Variable Definitions and References > should handle template literals in text directives
stdout | api/integration.test.ts > API Integration Tests > Variable Definitions and References > should handle template literals in text directives
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:04.423Z"}
stdout | api/integration.test.ts > API Integration Tests > Path Handling > should handle path variables with special $PROJECTPATH syntax
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:04.445Z"}
stdout | api/integration.test.ts > API Integration Tests > Path Handling > should handle path variables with special $PROJECTPATH syntax
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:04.456Z"}
stdout | api/integration.test.ts > API Integration Tests > Path Handling > should handle path variables with special $PROJECTPATH syntax
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:04.463Z"}
stdout | api/integration.test.ts > API Integration Tests > Path Handling > should handle path variables with special $PROJECTPATH syntax
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:04.476Z"}
stdout | api/integration.test.ts > API Integration Tests > Path Handling > should handle path variables with special $. alias syntax
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:04.484Z"}
stdout | api/integration.test.ts > API Integration Tests > Path Handling > should handle path variables with special $HOMEPATH syntax
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:04.496Z"}
stdout | api/integration.test.ts > API Integration Tests > Path Handling > should handle path variables with special $~ alias syntax
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:04.502Z"}
stdout | api/integration.test.ts > API Integration Tests > Path Handling > should reject invalid path formats (raw absolute paths)
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:04.517Z"}
stdout | api/integration.test.ts > API Integration Tests > Path Handling > should reject invalid path formats (relative paths with dot segments)
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:04.528Z"}
stdout | api/integration.test.ts > API Integration Tests > Import Handling > should handle simple imports
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:04.538Z"}
stdout | api/integration.test.ts > API Integration Tests > Import Handling > should handle nested imports with proper scope inheritance
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:04.561Z"}
 ✓ api/integration.test.ts (14 tests) 368ms
stdout | tests/utils/debug/StateTrackingService/StateTrackingService.test.ts > StateTrackingService > Merge Operations > should handle merge target relationships
Created source state: acee05da-5932-4e99-b05d-5646e10aa355
Created target state: 5b0d8b54-df26-4007-ab74-69b9e526ae88
Created parent state: d3b26c9a-1770-4374-b80a-872d3b78970f
Initial States: graph TD;
Added parent-child relationship: {
  parent: 'd3b26c9a-1770-4374-b80a-872d3b78970f',
  child: '5b0d8b54-df26-4007-ab74-69b9e526ae88',
  parentMetadata: {
    id: 'd3b26c9a-1770-4374-b80a-872d3b78970f',
    source: 'new',
    parentId: undefined,
    filePath: undefined,
    transformationEnabled: true,
    createdAt: 1741118104640
  },
  childMetadata: {
    id: '5b0d8b54-df26-4007-ab74-69b9e526ae88',
    source: 'new',
    parentId: 'd3b26c9a-1770-4374-b80a-872d3b78970f',
    filePath: undefined,
    transformationEnabled: true,
    createdAt: 1741118104640
  },
  parentRelationships: [
    {
      targetId: '5b0d8b54-df26-4007-ab74-69b9e526ae88',
      type: 'parent-child'
    }
  ],
  childRelationships: []
}
After Parent-Child Relationship: graph TD;
    5b0d8b54-df26-4007-ab74-69b9e526ae88 -->|parent-child| parent-child style="solid,#000000";
Added merge-target relationship: {
  source: 'acee05da-5932-4e99-b05d-5646e10aa355',
  target: '5b0d8b54-df26-4007-ab74-69b9e526ae88',
  sourceMetadata: {
    id: 'acee05da-5932-4e99-b05d-5646e10aa355',
    source: 'new',
    parentId: 'd3b26c9a-1770-4374-b80a-872d3b78970f',
    filePath: undefined,
    transformationEnabled: true,
    createdAt: 1741118104640
  },
  targetMetadata: {
    id: '5b0d8b54-df26-4007-ab74-69b9e526ae88',
    source: 'new',
    parentId: 'd3b26c9a-1770-4374-b80a-872d3b78970f',
    filePath: undefined,
    transformationEnabled: true,
    createdAt: 1741118104640
  },
  sourceRelationships: [
    {
      targetId: '5b0d8b54-df26-4007-ab74-69b9e526ae88',
      type: 'merge-target'
    }
  ],
  targetRelationships: []
}
After Merge-Target Relationship: graph TD;
    5b0d8b54-df26-4007-ab74-69b9e526ae88 -->|parent-child| parent-child style="solid,#000000";
    acee05da-5932-4e99-b05d-5646e10aa355 -->|parent-child| parent-child style="solid,#000000";
State Transitions: State Lineage: {
  sourceId: 'acee05da-5932-4e99-b05d-5646e10aa355',
  targetId: '5b0d8b54-df26-4007-ab74-69b9e526ae88',
  parentId: 'd3b26c9a-1770-4374-b80a-872d3b78970f',
  lineage: [
    'd3b26c9a-1770-4374-b80a-872d3b78970f',
    '5b0d8b54-df26-4007-ab74-69b9e526ae88',
    'acee05da-5932-4e99-b05d-5646e10aa355'
  ],
  sourceMetadata: {
    id: 'acee05da-5932-4e99-b05d-5646e10aa355',
    source: 'new',
    parentId: 'd3b26c9a-1770-4374-b80a-872d3b78970f',
    filePath: undefined,
    transformationEnabled: true,
    createdAt: 1741118104640
  },
  targetMetadata: {
    id: '5b0d8b54-df26-4007-ab74-69b9e526ae88',
    source: 'new',
    parentId: 'd3b26c9a-1770-4374-b80a-872d3b78970f',
    filePath: undefined,
    transformationEnabled: true,
    createdAt: 1741118104640
  },
  parentMetadata: {
    id: 'd3b26c9a-1770-4374-b80a-872d3b78970f',
    source: 'new',
    parentId: undefined,
    filePath: undefined,
    transformationEnabled: true,
    createdAt: 1741118104640
  },
  sourceRelationships: [
    {
      targetId: '5b0d8b54-df26-4007-ab74-69b9e526ae88',
      type: 'merge-target'
    }
  ],
  targetRelationships: [],
  parentRelationships: [
    {
      targetId: '5b0d8b54-df26-4007-ab74-69b9e526ae88',
      type: 'parent-child'
    }
  ]
}
Complete Debug Report: Debug Session Report (8f23196a-53ba-49b4-8c0b-ea7dbe944135)
Duration: 0.005s
Diagnostics: Metrics:
Snapshots:
 ✓ tests/utils/debug/StateTrackingService/StateTrackingService.test.ts (14 tests) 14ms
stdout | tests/debug/import-debug.test.ts > Import Directive Debug > should transform import directive and resolve variables
stdout | services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts > RunDirectiveHandler > error handling > should handle validation errors
stdout | services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts > RunDirectiveHandler > error handling > should handle resolution errors
stdout | services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts > RunDirectiveHandler > error handling > should handle command execution errors
 ✓ services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts (10 tests) 19ms
stdout | tests/debug/import-debug.test.ts > Import Directive Debug > should transform import directive and resolve variables
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:04.752Z"}
 ✓ tests/debug/import-debug.test.ts (1 test) 117ms
 ✓ services/pipeline/DirectiveService/handlers/execution/EmbedDirectiveHandler.transformation.test.ts (9 tests) 47ms
 ✓ services/resolution/ValidationService/ValidationService.test.ts (32 tests) 24ms
stdout | services/resolution/ResolutionService/ResolutionService.test.ts > ResolutionService > extractSection > should extract section by heading
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"none"},"timestamp":"2025-03-04T19:55:04.859Z"}
stdout | services/resolution/ResolutionService/ResolutionService.test.ts > ResolutionService > extractSection > should include content until next heading of same or higher level
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"none"},"timestamp":"2025-03-04T19:55:04.869Z"}
stdout | services/resolution/ResolutionService/ResolutionService.test.ts > ResolutionService > extractSection > should throw when section is not found
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"none"},"timestamp":"2025-03-04T19:55:04.878Z"}
 ✓ services/resolution/ResolutionService/ResolutionService.test.ts (19 tests) 120ms
stdout | cli/cli.test.ts > CLI Tests > Argument Parsing Tests > should handle invalid argument combinations
stdout | cli/cli.test.ts > CLI Tests > Argument Parsing Tests > should handle missing required arguments
stdout | cli/cli.test.ts > CLI Tests > File I/O Tests > should handle error for file not found
stdout | services/cli/CLIService/CLIService.test.ts > CLIService > Format Conversion > should output xml format by default
stdout | services/cli/CLIService/CLIService.test.ts > CLIService > Format Conversion > should handle format aliases correctly
stdout | services/cli/CLIService/CLIService.test.ts > CLIService > Format Conversion > should preserve markdown with markdown format
stdout | services/cli/CLIService/CLIService.test.ts > CLIService > Command Line Options > should respect --stdout option
stdout | services/cli/CLIService/CLIService.test.ts > CLIService > Command Line Options > should use default output path when not specified
stdout | services/cli/CLIService/CLIService.test.ts > CLIService > Command Line Options > should handle project path option
stdout | services/cli/CLIService/CLIService.test.ts > CLIService > Command Line Options > should handle home path option
stdout | services/cli/CLIService/CLIService.test.ts > CLIService > Command Line Options > should handle verbose option
stdout | services/cli/CLIService/CLIService.test.ts > CLIService > File Handling > should handle missing input files
stdout | services/cli/CLIService/CLIService.test.ts > CLIService > File Handling > should handle write errors
stdout | services/cli/CLIService/CLIService.test.ts > CLIService > File Handling > should handle read errors
stdout | services/cli/CLIService/CLIService.test.ts > CLIService > Error Handling > should handle parser errors
stdout | services/cli/CLIService/CLIService.test.ts > CLIService > Error Handling > should handle interpreter errors
stdout | services/cli/CLIService/CLIService.test.ts > CLIService > Error Handling > should handle output conversion errors
stdout | services/cli/CLIService/CLIService.test.ts > CLIService > File Overwrite Handling > should prompt for overwrite when file exists
stdout | services/cli/CLIService/CLIService.test.ts > CLIService > File Overwrite Handling > should handle explicit output paths appropriately
 ✓ services/cli/CLIService/CLIService.test.ts (18 tests) 84ms
stdout | cli/cli.test.ts > CLI Tests > File I/O Tests > should handle permission issues for reading files
stdout | cli/cli.test.ts > CLI Tests > Error Handling Tests > should format error messages clearly
 ✓ cli/cli.test.ts (14 tests | 4 skipped) 127ms
stdout | services/pipeline/InterpreterService/InterpreterService.unit.test.ts > InterpreterService Unit > child context creation > handles errors in child context creation
 ✓ services/pipeline/InterpreterService/InterpreterService.unit.test.ts (22 tests) 43ms
 ✓ services/pipeline/DirectiveService/handlers/definition/TextDirectiveHandler.test.ts (9 tests) 45ms
 ✓ services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler.transformation.test.ts (4 tests) 60ms
 ✓ services/resolution/ResolutionService/resolvers/PathResolver.test.ts (20 tests) 13ms
 ✓ tests/utils/debug/StateVisualizationService/TestVisualizationManager.test.ts (17 tests) 24ms
 ✓ tests/utils/debug/TestOutputFilterService/TestOutputFilterService.test.ts (17 tests) 9ms
 ✓ services/fs/PathService/PathService.test.ts (17 tests) 42ms
 ✓ services/resolution/ResolutionService/resolvers/StringConcatenationHandler.test.ts (13 tests) 13ms
stdout | api/api.test.ts > SDK Integration Tests > Service Management > should create services in correct initialization order
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:05.507Z"}
stdout | api/api.test.ts > SDK Integration Tests > Service Management > should allow service injection through options
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:05.522Z"}
stdout | api/api.test.ts > SDK Integration Tests > Transformation Mode > should enable transformation through options
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:05.547Z"}
 ✓ services/fs/PathService/PathService.tmp.test.ts (14 tests) 43ms
stdout | api/api.test.ts > SDK Integration Tests > Transformation Mode > should respect existing transformation state
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:05.560Z"}
 ✓ tests/embed-directive-fixes.test.ts (5 tests) 7ms
stdout | api/api.test.ts > SDK Integration Tests > Transformation Mode > should handle execution directives correctly
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:05.577Z"}
stdout | api/api.test.ts > SDK Integration Tests > Transformation Mode > should handle complex meld content with mixed directives
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:05.604Z"}
stdout | api/api.test.ts > SDK Integration Tests > Debug Mode > should enable debug mode through options
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:05.619Z"}
 ✓ services/resolution/ResolutionService/resolvers/DataResolver.test.ts (12 tests) 7ms
stdout | api/api.test.ts > SDK Integration Tests > Format Conversion > should handle definition directives correctly
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:05.630Z"}
stdout | api/api.test.ts > SDK Integration Tests > Format Conversion > should handle execution directives correctly
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:05.637Z"}
stdout | api/api.test.ts > SDK Integration Tests > Format Conversion > should handle complex meld content with mixed directives
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:05.648Z"}
 ✓ cli/commands/debug-context.test.ts (3 tests) 5ms
stdout | api/api.test.ts > SDK Integration Tests > Error Handling > should handle missing files correctly
stdout | api/api.test.ts > SDK Integration Tests > Full Pipeline Integration > should handle the complete parse -> interpret -> convert pipeline
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:05.681Z"}
 ✓ tests/utils/debug/StateDebuggerService/StateDebuggerService.test.ts (15 tests) 12ms
stdout | api/api.test.ts > SDK Integration Tests > Full Pipeline Integration > should preserve state and content in transformation mode
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:05.701Z"}
stdout | api/api.test.ts > SDK Integration Tests > Examples > should run api-demo-simple.meld example file
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:05.731Z"}
 ✓ api/api.test.ts (18 tests | 2 skipped) 350ms
 ✓ services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts (17 tests) 46ms
 ✓ services/pipeline/ParserService/ParserService.test.ts (16 tests) 34ms
 ✓ services/state/utilities/StateVariableCopier.test.ts (8 tests) 10ms
 ✓ services/resolution/ResolutionService/resolvers/CommandResolver.test.ts (12 tests) 32ms
 ✓ tests/pipeline/pipelineValidation.test.ts (8 tests) 20ms
 ✓ services/state/StateService/StateFactory.test.ts (10 tests) 6ms
stdout | services/resolution/ResolutionService/resolvers/VariableReferenceResolver.test.ts > VariableReferenceResolver > resolve > should handle environment variables
stdout | services/resolution/ResolutionService/resolvers/VariableReferenceResolver.test.ts > VariableReferenceResolver > resolve > should throw for undefined variables
 ✓ services/resolution/ResolutionService/resolvers/VariableReferenceResolver.test.ts (15 tests) 43ms
 ✓ services/pipeline/DirectiveService/handlers/definition/TextDirectiveHandler.integration.test.ts (8 tests | 3 skipped) 8ms
 ✓ services/pipeline/DirectiveService/handlers/definition/PathDirectiveHandler.test.ts (6 tests) 54ms
 ✓ cli/commands/debug-transform.test.ts (3 tests) 5ms
 ✓ services/resolution/ResolutionService/resolvers/TextResolver.test.ts (11 tests) 9ms
 ✓ tests/utils/tests/ErrorTestUtils.test.ts (12 tests) 8ms
stdout | tests/utils/tests/TestSnapshot.test.ts > TestSnapshot > directory-specific snapshots > returns empty snapshot for non-existent directory
stdout | tests/utils/tests/TestSnapshot.test.ts > TestSnapshot > snapshot comparison > detects added files
Added files: [ '/new.txt' ]
stdout | tests/utils/tests/TestSnapshot.test.ts > TestSnapshot > snapshot comparison > detects removed files
Removed files: [ '/remove.txt' ]
stdout | tests/utils/tests/TestSnapshot.test.ts > TestSnapshot > snapshot comparison > detects modified files
Modified files: [ '/modify.txt' ]
stdout | tests/utils/tests/TestSnapshot.test.ts > TestSnapshot > snapshot comparison > detects multiple changes
Multiple changes - added: [ '/new.txt' ]
Multiple changes - removed: [ '/remove.txt' ]
Multiple changes - modified: [ '/modify.txt' ]
stdout | tests/utils/tests/TestSnapshot.test.ts > TestSnapshot > error handling > handles comparison with empty snapshots
Empty snapshot diff1 added: [ '/file.txt' ]
Empty snapshot diff2 removed: [ '/file.txt' ]
 ✓ tests/embed-directive-transformation-fixes.test.ts (4 tests) 7ms
 ✓ tests/utils/tests/TestSnapshot.test.ts (13 tests) 28ms
stdout | services/state/StateEventService/StateInstrumentation.test.ts > State Instrumentation > Error Handling > should handle errors in event handlers without affecting others
 ✓ services/state/StateEventService/StateInstrumentation.test.ts (7 tests) 24ms
stdout | cli/commands/init.test.ts > initCommand > should create a meld.json file with custom project root
Meld project initialized successfully.
Project root set to: undefined
 ✓ cli/commands/init.test.ts (4 tests | 1 skipped) 8ms
stdout | services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.transformation.test.ts > RunDirectiveHandler Transformation > transformation behavior > should preserve error handling during transformation
 ✓ services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.transformation.test.ts (5 tests) 9ms
stdout | tests/utils/tests/TestContext.test.ts > TestContext > xml conversion > converts content to xml
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:06.668Z"}
stdout | tests/utils/tests/TestContext.test.ts > TestContext > cleanup > cleans up resources properly
Cleanup completed
Re-initialized file system
File exists after cleanup: false
stdout | services/pipeline/DirectiveService/DirectiveService.test.ts > DirectiveService > Directive processing > Import directives > should detect circular imports
 ✓ services/pipeline/DirectiveService/DirectiveService.test.ts (9 tests) 198ms
 ✓ tests/utils/tests/TestContext.test.ts (11 tests) 219ms
 ✓ tests/utils/debug/StateHistoryService/StateHistoryService.test.ts (9 tests) 15ms
stdout | services/fs/FileSystemService/FileSystemService.test.ts > FileSystemService > File operations > throws MeldError when reading non-existent file
stdout | services/fs/FileSystemService/FileSystemService.test.ts > FileSystemService > Directory operations > throws MeldError when reading non-existent directory
 ✓ services/sourcemap/SourceMapService.test.ts (10 tests) 5ms
 ✓ tests/variable-index-debug.test.ts (3 tests) 4ms
stdout | services/state/StateService/migration.test.ts > State Migration > error handling > should handle migration errors gracefully
 ✓ services/state/StateService/migration.test.ts (8 tests) 7ms
 ✓ services/fs/FileSystemService/FileSystemService.test.ts (17 tests) 149ms
 ✓ tests/utils/debug/VariableResolutionTracker/VariableResolutionTracker.test.ts (14 tests) 8ms
 ✓ tests/utils/tests/ProjectBuilder.test.ts (10 tests) 28ms
stdout | tests/utils/tests/MemfsTestFileSystem.test.ts > MemfsTestFileSystem > error handling > throws when reading non-existent file
stdout | tests/utils/tests/MemfsTestFileSystem.test.ts > MemfsTestFileSystem > error handling > throws when getting stats of non-existent path
 ✓ tests/utils/tests/MemfsTestFileSystem.test.ts (14 tests) 26ms
 ✓ services/fs/ProjectPathResolver.test.ts (5 tests) 6ms
 ✓ tests/utils/tests/FixtureManager.test.ts (9 tests) 14ms
 ✓ services/resolution/ValidationService/validators/FuzzyMatchingValidator.test.ts (6 tests | 3 skipped) 3ms
 ✓ tests/utils/fs/MockCommandExecutor.test.ts (7 tests) 5ms
 ✓ services/resolution/ResolutionService/resolvers/ContentResolver.test.ts (5 tests) 5ms
stdout | services/state/StateEventService/StateEventService.test.ts > StateEventService > should continue processing handlers after error
 ✓ services/state/StateEventService/StateEventService.test.ts (8 tests) 25ms
 ✓ services/state/StateService/StateService.transformation.test.ts (8 tests) 5ms
stdout | services/resolution/CircularityService/CircularityService.test.ts > CircularityService > Circular import detection > should detect direct circular imports
stdout | services/resolution/CircularityService/CircularityService.test.ts > CircularityService > Circular import detection > should detect indirect circular imports
stdout | services/resolution/CircularityService/CircularityService.test.ts > CircularityService > Circular import detection > should include import chain in error
 ✓ services/resolution/CircularityService/CircularityService.test.ts (10 tests) 7ms
stdout | tests/specific-variable-resolution.test.ts > Variable Resolution Specific Tests > should handle nested object data structures with variable references
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:07.573Z"}
stdout | tests/specific-variable-resolution.test.ts > Variable Resolution Specific Tests > should handle array access in variable references
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:07.613Z"}
stdout | tests/cli/cli-error-handling.test.ts > CLI Error Handling > Using standalone utilities > should handle permissive mode for missing variables
stdout | tests/specific-variable-resolution.test.ts > Variable Resolution Specific Tests > should format output with variable references
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:07.631Z"}
 ✓ tests/specific-variable-resolution.test.ts (3 tests) 205ms
stdout | tests/cli/cli-error-handling.test.ts > CLI Error Handling > Using standalone utilities > should throw errors in strict mode
stdout | tests/cli/cli-error-handling.test.ts > CLI Error Handling > Using TestContext > should handle multiple errors in permissive mode
stdout | tests/cli/cli-error-handling.test.ts > CLI Error Handling > Using TestContext > should handle multiple errors in permissive mode
 ✓ tests/cli/cli-error-handling.test.ts (3 tests) 85ms
stdout | api/resolution-debug.test.ts > Variable Resolution Debug Tests > should handle simple text variables
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:07.675Z"}
stdout | api/resolution-debug.test.ts > Variable Resolution Debug Tests > should handle basic array access with dot notation
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:07.708Z"}
stdout | api/resolution-debug.test.ts > Variable Resolution Debug Tests > should handle object array access with dot notation
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:07.719Z"}
stdout | api/resolution-debug.test.ts > Variable Resolution Debug Tests > should handle complex nested arrays
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:07.735Z"}
 ✓ api/resolution-debug.test.ts (4 tests) 177ms
 ↓ tests/utils/examples/RunDirectiveCommandMock.test.ts (3 tests | 3 skipped)
 ✓ tests/sourcemap/sourcemap-integration.test.ts (2 tests) 16ms
stdout | tests/sourcemap/sourcemap-integration.test.ts > Source Mapping Integration > Errors in imported files are reported with correct source location
Error type: MeldParseError
Error properties: [
  'name',
  'code',
  'errorCause',
  'filePath',
  'severity',
  'context',
  'location'
]
Error message: Parse error: Parse error: Expected "$", "[", "{{", or whitespace but "p" found. at line 4, column 9
Got expected error when processing invalid file: Parse error: Parse error: Expected "$", "[", "{{", or whitespace but "p" found. at line 4, column 9
 ✓ services/fs/FileSystemService/PathOperationsService.test.ts (8 tests) 3ms
stdout | tests/transformation-debug.test.ts > Transformation Debug Tests > should transform simple text variables without newlines
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:08.005Z"}
 ✓ scripts/debug-parser.test.ts (1 test) 24ms
stdout | tests/specific-nested-array.test.ts > Nested Arrays Specific Test > should handle nested array access correctly
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:08.018Z"}
 ✓ tests/specific-nested-array.test.ts (1 test) 101ms
stdout | tests/transformation-debug.test.ts > Transformation Debug Tests > should transform array access with dot notation
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:08.030Z"}
 ✓ tests/transformation-debug.test.ts (2 tests) 109ms
stdout | api/nested-array.test.ts > Nested Array Access Tests > should handle nested array access with dot notation
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:08.044Z"}
 ✓ api/nested-array.test.ts (1 test) 99ms
stdout | api/array-access.test.ts > Array Access Tests > should handle direct array access with dot notation
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-04T19:55:08.123Z"}
 ✓ api/array-access.test.ts (1 test) 89ms
 Test Files  76 passed | 1 skipped (77)
      Tests  824 passed | 13 skipped | 8 todo (845)
   Start at  11:55:03
   Duration  4.93s (transform 1.51s, setup 19.70s, collect 2.75s, tests 4.22s, environment 9ms, prepare 4.48s)
(node:25425) MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 warning listeners added to [EventEmitter]. MaxListeners is 10. Use emitter.setMaxListeners() to increase limit
(Use `node --trace-warnings ...` to show where the warning was created)
stderr | services/resolution/ResolutionService/resolvers/StringConcatenationHandler.test.ts > StringConcatenationHandler > hasConcatenation > should fall back to regex detection when AST parsing fails
Failed to check concatenation with AST, falling back to regex: Error: Parse error
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringConcatenationHandler.test.ts:54:60
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:146:14
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:11
    at runWithTimeout (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:39:7)
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:17)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runFiles (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1262:5)
Failed to check concatenation with AST, falling back to regex: Error: Parse error
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringConcatenationHandler.test.ts:54:60
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:146:14
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:11
    at runWithTimeout (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:39:7)
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:17)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runFiles (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1262:5)
stderr | services/resolution/ResolutionService/resolvers/StringConcatenationHandler.test.ts > StringConcatenationHandler > resolveConcatenation > should fall back to regex-based splitting when AST parsing fails
Failed to parse concatenation with AST, falling back to manual parsing: Error: Parse error
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringConcatenationHandler.test.ts:103:60
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:146:14
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:11
    at runWithTimeout (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:39:7)
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:17)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runFiles (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1262:5)
stderr | services/resolution/ResolutionService/resolvers/StringConcatenationHandler.test.ts > StringConcatenationHandler > resolveConcatenation > should reject empty parts
Failed to parse concatenation with AST, falling back to manual parsing: Error: Parse error
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringConcatenationHandler.test.ts:212:60
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:146:14
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:11
    at runWithTimeout (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:39:7)
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:17)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runFiles (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1262:5)
(node:25474) MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 warning listeners added to [EventEmitter]. MaxListeners is 10. Use emitter.setMaxListeners() to increase limit
(Use `node --trace-warnings ...` to show where the warning was created)
stderr | services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts > StringLiteralHandler > isStringLiteral > should fall back to regex when AST parsing fails
Failed to check string literal with AST, falling back to manual check: Error: Parse error
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts:35:56
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:146:14
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:11
    at runWithTimeout (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:39:7)
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:17)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runFiles (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1262:5)
stderr | services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts > StringLiteralHandler > isStringLiteral > should reject unmatched quotes
Failed to check string literal with AST, falling back to manual check: Error: Parse error
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts:94:56
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:146:14
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:11
    at runWithTimeout (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:39:7)
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:17)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runFiles (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1262:5)
stderr | services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts > StringLiteralHandler > validateLiteral > should fall back to manual validation when AST parsing fails
Failed to validate string literal with AST, falling back to manual validation: Error: Parse error
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts:121:56
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:146:14
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:11
    at runWithTimeout (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:39:7)
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:17)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runFiles (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1262:5)
stderr | services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts > StringLiteralHandler > validateLiteral > should reject empty strings with AST
Failed to validate string literal with AST, falling back to manual validation: Error: Parse error
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts:131:56
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:146:14
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:11
    at runWithTimeout (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:39:7)
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:17)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runFiles (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1262:5)
stderr | services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts > StringLiteralHandler > validateLiteral > should reject strings without quotes with AST
Failed to validate string literal with AST, falling back to manual validation: Error: Parse error
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts:141:56
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:146:14
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:11
    at runWithTimeout (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:39:7)
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:17)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runFiles (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1262:5)
stderr | services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts > StringLiteralHandler > parseLiteral > should parse string literals using AST when available
Failed to validate string literal with AST, falling back to manual validation: ResolutionError: Resolution error ([object Object]): String literal must start with a quote (', ", or `)
    at StringLiteralHandler.validateLiteral (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:162:13)
    at StringLiteralHandler.validateLiteralWithAst (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:131:21)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at StringLiteralHandler.parseLiteralWithAst (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:217:7)
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts:161:22
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:5
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:11)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15) {
  code: { value: 'hello world' },
  details: undefined
}
Failed to parse string literal with AST, falling back to manual parsing: ResolutionError: Resolution error ([object Object]): String literal must start with a quote (', ", or `)
    at StringLiteralHandler.validateLiteral (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:162:13)
    at StringLiteralHandler.parseLiteral (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:261:10)
    at StringLiteralHandler.parseLiteralWithAst (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:242:23)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts:161:22
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:5
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:11)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15) {
  code: { value: 'hello world' },
  details: undefined
}
stderr | services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts > StringLiteralHandler > parseLiteral > should fall back to manual parsing when AST parsing fails
Failed to validate string literal with AST, falling back to manual validation: Error: Parse error
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts:168:56
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:146:14
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:11
    at runWithTimeout (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:39:7)
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:17)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runFiles (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1262:5)
Failed to parse string literal with AST, falling back to manual parsing: Error: Parse error
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts:168:56
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:146:14
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:11
    at runWithTimeout (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:39:7)
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:17)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runFiles (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1262:5)
stderr | services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts > StringLiteralHandler > parseLiteral > should remove matching single quotes with AST
Failed to validate string literal with AST, falling back to manual validation: ResolutionError: Resolution error ([object Object]): String literal must start with a quote (', ", or `)
    at StringLiteralHandler.validateLiteral (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:162:13)
    at StringLiteralHandler.validateLiteralWithAst (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:131:21)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at StringLiteralHandler.parseLiteralWithAst (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:217:7)
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts:187:22
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:5
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:11)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15) {
  code: { value: 'hello world' },
  details: undefined
}
Failed to parse string literal with AST, falling back to manual parsing: ResolutionError: Resolution error ([object Object]): String literal must start with a quote (', ", or `)
    at StringLiteralHandler.validateLiteral (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:162:13)
    at StringLiteralHandler.parseLiteral (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:261:10)
    at StringLiteralHandler.parseLiteralWithAst (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:242:23)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts:187:22
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:5
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:11)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15) {
  code: { value: 'hello world' },
  details: undefined
}
stderr | services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts > StringLiteralHandler > parseLiteral > should remove matching double quotes with AST
Failed to validate string literal with AST, falling back to manual validation: ResolutionError: Resolution error ([object Object]): String literal must start with a quote (', ", or `)
    at StringLiteralHandler.validateLiteral (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:162:13)
    at StringLiteralHandler.validateLiteralWithAst (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:131:21)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at StringLiteralHandler.parseLiteralWithAst (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:217:7)
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts:204:22
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:5
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:11)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15) {
  code: { value: 'hello world' },
  details: undefined
}
Failed to parse string literal with AST, falling back to manual parsing: ResolutionError: Resolution error ([object Object]): String literal must start with a quote (', ", or `)
    at StringLiteralHandler.validateLiteral (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:162:13)
    at StringLiteralHandler.parseLiteral (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:261:10)
    at StringLiteralHandler.parseLiteralWithAst (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:242:23)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts:204:22
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:5
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:11)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15) {
  code: { value: 'hello world' },
  details: undefined
}
stderr | services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts > StringLiteralHandler > parseLiteral > should remove matching backticks with AST
Failed to validate string literal with AST, falling back to manual validation: ResolutionError: Resolution error ([object Object]): String literal must start with a quote (', ", or `)
    at StringLiteralHandler.validateLiteral (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:162:13)
    at StringLiteralHandler.validateLiteralWithAst (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:131:21)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at StringLiteralHandler.parseLiteralWithAst (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:217:7)
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts:221:22
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:5
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:11)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15) {
  code: { value: 'hello world' },
  details: undefined
}
Failed to parse string literal with AST, falling back to manual parsing: ResolutionError: Resolution error ([object Object]): String literal must start with a quote (', ", or `)
    at StringLiteralHandler.validateLiteral (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:162:13)
    at StringLiteralHandler.parseLiteral (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:261:10)
    at StringLiteralHandler.parseLiteralWithAst (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:242:23)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts:221:22
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:5
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:11)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15) {
  code: { value: 'hello world' },
  details: undefined
}
stderr | services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts > StringLiteralHandler > parseLiteral > should preserve internal quotes with AST
Failed to validate string literal with AST, falling back to manual validation: ResolutionError: Resolution error ([object Object]): String literal must start with a quote (', ", or `)
    at StringLiteralHandler.validateLiteral (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:162:13)
    at StringLiteralHandler.validateLiteralWithAst (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:131:21)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at StringLiteralHandler.parseLiteralWithAst (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:217:7)
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts:238:22
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:5
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:11)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15) {
  code: { value: "It's a test" },
  details: undefined
}
Failed to parse string literal with AST, falling back to manual parsing: ResolutionError: Resolution error ([object Object]): String literal must start with a quote (', ", or `)
    at StringLiteralHandler.validateLiteral (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:162:13)
    at StringLiteralHandler.parseLiteral (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:261:10)
    at StringLiteralHandler.parseLiteralWithAst (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:242:23)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts:238:22
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:5
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:11)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15) {
  code: { value: "It's a test" },
  details: undefined
}
stderr | services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts > StringLiteralHandler > parseLiteral > should throw on invalid input with AST
Failed to validate string literal with AST, falling back to manual validation: Error: Parse error
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts:247:56
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:146:14
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:11
    at runWithTimeout (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:39:7)
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:17)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runFiles (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1262:5)
Failed to parse string literal with AST, falling back to manual parsing: ResolutionError: Resolution error ([object Object]): String literal must start with a quote (', ", or `)
    at StringLiteralHandler.validateLiteral (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:162:13)
    at StringLiteralHandler.validateLiteralWithAst (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:141:19)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at StringLiteralHandler.parseLiteralWithAst (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:217:7) {
  code: { value: 'invalid' },
  details: undefined
}
stderr | services/resolution/ResolutionService/resolvers/VariableReferenceResolver.test.ts > VariableReferenceResolver > extractReferencesAsync > should fall back to regex when parser fails
*** Error during variable reference extraction: Error: Parser error
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/VariableReferenceResolver.test.ts:185:56
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:146:14
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:11
    at runWithTimeout (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:39:7)
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:17)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runFiles (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1262:5)
stderr | cli/commands/init.test.ts > initCommand > should reject invalid project root paths
Error: Project root must be "." or a valid subdirectory.
## Your task
[directive output placeholder]
