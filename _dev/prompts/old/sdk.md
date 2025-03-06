We need to update our implementation in `api/index.ts` to reflect our more complex services setup. There are some notes on this topic in this file:

\=== NOTES

# SDK Integration Test Patterns

## Test-Implementation Misalignment

We've identified a pattern where SDK integration tests may be making oversimplified assumptions about internal service behavior. This creates potential maintenance challenges and false negatives in our test suite.

### Case Study: Output Service Integration

The `api/api.test.ts` integration tests demonstrate this pattern clearly:

```typescript
// SDK integration test makes simple assumptions
const content = `
  Some text content
  @run [echo test]
  More text
`;
// Expects:
// - Raw text preservation
// - Simple directive handling
// - Direct content matching
```

However, the actual `OutputService` implementation and its unit tests reveal more sophisticated behavior:

1. Transformation Modes
   - Non-transformation mode has specific directive handling rules
   - Transformation mode replaces directives with results
   - Mode selection affects entire output pipeline

2. Format-Specific Behavior
   - Each format (markdown, llm) has unique requirements
   - LLM XML format has special handling needs
   - Directive handling varies by format

3. State Management
   - Service tracks transformation state
   - Handles state variables differently in different modes
   - Complex interaction between state and output

### Impact on Test Reliability

This misalignment causes:
1. False negatives - tests fail despite correct implementation
2. Maintenance burden - fixing "failing" tests can break actual functionality
3. Documentation gaps - simplified tests don't reflect actual behavior

### Recommendations

1. SDK Integration Tests Should:
   - Consider transformation modes
   - Account for format-specific behavior
   - Match documented interface behavior
   - Test actual use cases rather than implementation details

2. Documentation Updates:
   - Clearly document transformation modes
   - Explain format-specific requirements
   - Provide SDK usage examples that reflect actual behavior

3. Test Structure:
   - Move implementation details to unit tests
   - Keep integration tests focused on real-world usage
   - Add test cases for different modes and formats
   - Document expected behavior in test descriptions

## Implementation Plan

### Phase 1: Test Infrastructure Updates (1-2 hours)
- [ ] Update TestContext initialization
- [ ] Add transformation mode helpers
- [ ] Add format-specific test utilities
- [ ] Update test documentation patterns

### Phase 2: Basic Transformation Tests (2-3 hours)
- [ ] Test transformation mode enabling/disabling
- [ ] Test state variable preservation
- [ ] Test basic directive handling
- [ ] Test content preservation rules

### Phase 3: Format-Specific Tests (2-3 hours)
- [ ] Markdown format tests
  - [ ] Headers and formatting
  - [ ] Code blocks
  - [ ] Directive placeholders
- [ ] LLM format tests
  - [ ] XML structure
  - [ ] Special characters
  - [ ] State representation

### Phase 4: Integration Scenarios (3-4 hours)
- [ ] Full pipeline tests
  - [ ] Parse -> Transform -> Output
  - [ ] State management
  - [ ] Error handling
- [ ] Mixed content tests
  - [ ] Multiple directive types
  - [ ] Nested transformations
  - [ ] State inheritance
- [ ] Edge cases
  - [ ] Empty content
  - [ ] Invalid directives
  - [ ] State conflicts

### Phase 5: Documentation & Examples (2-3 hours)
- [ ] Update test documentation
- [ ] Add example test patterns
- [ ] Document common pitfalls
- [ ] Create test templates

## Action Items

1. Review other SDK integration tests for similar patterns
2. Update test documentation to reflect actual service behavior
3. Consider adding SDK-level transformation mode controls
4. Add integration test examples to SDK documentation

## Risk Assessment

### Low Risk Areas
- Test infrastructure changes (good existing patterns)
- Basic transformation tests (clear requirements)
- Documentation updates (straightforward)

### Medium Risk Areas
- Format-specific edge cases
- State management complexity
- Performance implications

### Mitigation Strategies
1. Incremental implementation
2. Comprehensive test coverage
3. Clear documentation
4. Regular review points

## Timeline
- Total estimated time: 10-15 hours
- Can be implemented incrementally
- Key milestones align with phases
- Regular review points after each phase

## Success Criteria
1. All tests pass consistently
2. No false negatives
3. Clear test patterns documented
4. Easy to maintain and extend
5. Matches actual service behavior

\=== CODE

# api.test.ts

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { main } from './index.js';
import { TestContext } from '@tests/utils/index.js';
import type { ProcessOptions } from '@core/types/index.js';
import type { NodeFileSystem } from '@services/fs/FileSystemService/NodeFileSystem.js';

// Define the type for main function options
type MainOptions = {
  fs?: NodeFileSystem;
  format?: 'llm';
  services?: any;
};

describe('SDK Integration Tests', () => {
  let context: TestContext;
  let testFilePath: string;

  beforeEach(async () => {
    context = new TestContext();
    await context.initialize();
    testFilePath = 'test.meld';
  });

  afterEach(async () => {
    await context.cleanup();
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('Format Conversion', () => {
    it('should handle definition directives correctly', async () => {
      await context.fs.writeFile(testFilePath, '@text greeting = "Hello"');
      const result = await main(testFilePath, {
        fs: context.fs,
        services: context.services
      });
      // Definition directives should be omitted from output
      expect(result).toBe('');
    });

    it('should handle execution directives correctly', async () => {
      // Start debug session with enhanced configuration
      const debugSessionId = await context.startDebugSession({
        captureConfig: {
          capturePoints: ['pre-transform', 'post-transform', 'error'],
          includeFields: ['nodes', 'transformedNodes', 'variables', 'metadata'],
          format: 'full'
        },
        visualization: {
          format: 'mermaid',
          includeMetadata: true,
          includeTimestamps: true
        }
      });

      try {
        await context.fs.writeFile(testFilePath, '@run [echo test]');

        // Get initial state ID - FIXED: Remove file path fallback
        const initialStateId = context.services.state.getStateId();
        if (!initialStateId) {
          throw new Error('Failed to get state ID - state not properly initialized');
        }

        // Enhanced debugging: Generate relationship graph
        console.log('Initial State Relationships:');
        console.log(await context.services.visualization.generateRelationshipGraph([initialStateId], {
          format: 'mermaid',
          includeMetadata: true
        }));

        // Enhanced debugging: Generate initial timeline
        console.log('Initial Timeline:');
        console.log(await context.services.visualization.generateTimeline([initialStateId], {
          format: 'mermaid',
          includeTimestamps: true
        }));

        // Enhanced debugging: Get initial metrics
        const startTime = Date.now();
        const initialMetrics = await context.services.visualization.getMetrics({
          start: startTime - 3600000, // Last hour
          end: startTime
        });
        console.log('Initial State Metrics:', initialMetrics);

        console.log('Initial State Hierarchy:');
        console.log(await context.services.visualization.generateHierarchyView(initialStateId, {
          format: 'mermaid',
          includeMetadata: true
        }));

        // Trace the operation with enhanced error handling
        const { result, diagnostics } = await context.services.debugger.traceOperation(
          initialStateId,
          async () => {
            // Enable transformation mode explicitly
            context.services.state.enableTransformation(true);

            return await main(testFilePath, {
              fs: context.fs,
              format: 'llm',
              services: context.services
            } as any);
          }
        );

        // Log diagnostics and state changes
        console.log('Operation Diagnostics:', diagnostics);

        // Get final state visualization
        const finalStateId = context.services.state.getStateId();
        if (!finalStateId) {
          throw new Error('Failed to get final state ID');
        }

        // Enhanced debugging: Generate final relationship graph
        console.log('Final State Relationships:');
        console.log(await context.services.visualization.generateRelationshipGraph([finalStateId], {
          format: 'mermaid',
          includeMetadata: true
        }));

        // Enhanced debugging: Generate final timeline
        console.log('Final Timeline:');
        console.log(await context.services.visualization.generateTimeline([finalStateId], {
          format: 'mermaid',
          includeTimestamps: true
        }));

        // Enhanced debugging: Get final metrics
        const endTime = Date.now();
        const finalMetrics = await context.services.visualization.getMetrics({
          start: startTime,
          end: endTime
        });
        console.log('Final State Metrics:', finalMetrics);

        console.log('Final State Hierarchy:');
        console.log(await context.services.visualization.generateHierarchyView(finalStateId, {
          format: 'mermaid',
          includeMetadata: true
        }));

        // Generate transition diagram
        console.log('State Transitions:');
        console.log(await context.services.visualization.generateTransitionDiagram(finalStateId, {
          format: 'mermaid',
          includeTimestamps: true
        }));

        // Add assertions here
        expect(result).toBeDefined();
        // Add more specific assertions based on expected behavior
      } catch (error) {
        console.error('Test failed with error:', error);
        // Enhanced error reporting
        if (context.services.tracking) {
          const allStates = await context.services.tracking.getAllStates();
          console.log('All tracked states:', allStates);
        }
        throw error;
      }
    });

    it('should handle complex meld content with mixed directives', async () => {
      const content = `
        @text greeting = "Hello"
        @data config = { "value": 123 }
        Some text content
        @run [echo test]
        More text
      `;
      await context.fs.writeFile(testFilePath, content);
      const result = await main(testFilePath, {
        fs: context.fs,
        services: context.services
      });

      // Definition directives should be omitted
      expect(result).not.toContain('"identifier": "greeting"');
      expect(result).not.toContain('"value": "Hello"');
      expect(result).not.toContain('"identifier": "config"');

      // Text content should be preserved
      expect(result).toContain('Some text content');
      expect(result).toContain('More text');

      // Execution directives should show placeholder
      expect(result).toContain('[run directive output placeholder]');
    });
  });

  describe('Full Pipeline Integration', () => {
    it('should handle the complete parse -> interpret -> convert pipeline', async () => {
      const content = `
        @text greeting = "Hello"
        @run [echo test]
        Some content
      `;
      await context.fs.writeFile(testFilePath, content);
      const result = await main(testFilePath, {
        fs: context.fs,
        services: context.services
      });

      // Definition directive should be omitted
      expect(result).not.toContain('"kind": "text"');
      expect(result).not.toContain('"identifier": "greeting"');

      // Execution directive should show placeholder
      expect(result).toContain('[run directive output placeholder]');

      // Text content should be preserved
      expect(result).toContain('Some content');
    });

    it('should preserve state and content in transformation mode', async () => {
      const content = `
        @text first = "First"
        @text second = "Second"
        @run [echo test]
        Content
      `;
      await context.fs.writeFile(testFilePath, content);

      // Enable transformation mode through state service
      context.services.state.enableTransformation(true);

      const result = await main(testFilePath, {
        fs: context.fs,
        services: context.services
      });

      // In transformation mode, directives should be replaced with their results
      expect(result).not.toContain('"identifier": "first"');
      expect(result).not.toContain('"value": "First"');
      expect(result).not.toContain('"identifier": "second"');

      // Text content should be preserved
      expect(result).toContain('Content');

      // Run directive should be transformed (if transformation is working)
      expect(result).toContain('test');
    });
  });

  describe('Error Handling', () => {
    it('should handle parse errors gracefully', async () => {
      await context.fs.writeFile(testFilePath, '@invalid not_a_valid_directive');
      await expect(main(testFilePath, {
        fs: context.fs,
        services: context.services
      }))
        .rejects
        .toThrow(/Parse error/);
    });

    // TODO: This test will be updated as part of the error handling overhaul
    // See dev/ERRORS.md - will be reclassified as a fatal error with improved messaging
    it.todo('should handle missing files correctly');

    it('should handle empty files', async () => {
      await context.fs.writeFile(testFilePath, '');
      const result = await main(testFilePath, {
        fs: context.fs,
        services: context.services
      });
      expect(result).toBe(''); // Empty input should produce empty output
    });
  });

  describe('Edge Cases', () => {
    it.todo('should handle large files efficiently');
    it.todo('should handle deeply nested imports');
  });
});
```

# index.ts

```typescript
// Core services
export * from '@services/pipeline/InterpreterService/InterpreterService.js';
export * from '@services/pipeline/ParserService/ParserService.js';
export * from '@services/state/StateService/StateService.js';
export * from '@services/resolution/ResolutionService/ResolutionService.js';
export * from '@services/pipeline/DirectiveService/DirectiveService.js';
export * from '@services/resolution/ValidationService/ValidationService.js';
export * from '@services/fs/PathService/PathService.js';
export * from '@services/fs/FileSystemService/FileSystemService.js';
export * from '@services/fs/FileSystemService/PathOperationsService.js';
export * from '@services/pipeline/OutputService/OutputService.js';
export * from '@services/resolution/CircularityService/CircularityService.js';

// Core types and errors
export * from '@core/types/index.js';
export * from '@core/errors/MeldDirectiveError.js';
export * from '@core/errors/MeldInterpreterError.js';
export * from '@core/errors/MeldParseError.js';
import { MeldFileNotFoundError } from '@core/errors/MeldFileNotFoundError.js';

// Import service classes
import { InterpreterService } from '@services/pipeline/InterpreterService/InterpreterService.js';
import { ParserService } from '@services/pipeline/ParserService/ParserService.js';
import { StateService } from '@services/state/StateService/StateService.js';
import { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService.js';
import { DirectiveService } from '@services/pipeline/DirectiveService/DirectiveService.js';
import { ValidationService } from '@services/resolution/ValidationService/ValidationService.js';
import { PathService } from '@services/fs/PathService/PathService.js';
import { FileSystemService } from '@services/fs/FileSystemService/FileSystemService.js';
import { PathOperationsService } from '@services/fs/FileSystemService/PathOperationsService.js';
import { OutputService } from '@services/pipeline/OutputService/OutputService.js';
import { CircularityService } from '@services/resolution/CircularityService/CircularityService.js';
import { NodeFileSystem } from '@services/fs/FileSystemService/NodeFileSystem.js';
import { ProcessOptions } from '@core/types/index.js';

// Package info
export { version } from '@core/version.js';

export async function main(filePath: string, options: ProcessOptions & { services?: any } = {}): Promise<string> {
  // Use services from test context if provided, otherwise create new ones
  const pathOps = new PathOperationsService();
  const fs = options.fs || new NodeFileSystem();
  const filesystem = new FileSystemService(pathOps, fs);

  if (options.services) {
    // Use services from test context
    const { parser, interpreter, directive, validation, state, path, circularity, resolution, output } = options.services;

    // Initialize services
    path.initialize(filesystem);
    directive.initialize(
      validation,
      state,
      path,
      filesystem,
      parser,
      interpreter,
      circularity,
      resolution
    );
    interpreter.initialize(directive, state);

    try {
      // Read the file
      const content = await filesystem.readFile(filePath);

      // Parse the content
      const ast = await parser.parse(content);

      // Interpret the AST
      const resultState = await interpreter.interpret(ast, { filePath, initialState: state });

      // Convert to desired format using the updated state
      const converted = await output.convert(ast, resultState, options.format || 'llm');

      return converted;
    } catch (error) {
      // If it's a MeldFileNotFoundError, just throw it as is
      if (error instanceof MeldFileNotFoundError) {
        throw error;
      }
      // For other Error instances, preserve the error
      if (error instanceof Error) {
        throw error;
      }
      // For non-Error objects, convert to string
      throw new Error(String(error));
    }
  } else {
    // Create new services
    const parser = new ParserService();
    const interpreter = new InterpreterService();
    const state = new StateService();
    const directives = new DirectiveService();
    const validation = new ValidationService();
    const circularity = new CircularityService();
    const resolution = new ResolutionService(state, filesystem, parser);
    const path = new PathService();
    const output = new OutputService();

    // Initialize services
    directives.initialize(
      validation,
      state,
      path,
      filesystem,
      parser,
      interpreter,
      circularity,
      resolution
    );
    interpreter.initialize(directives, state);

    try {
      // Read the file
      const content = await filesystem.readFile(filePath);

      // Parse the content
      const ast = await parser.parse(content);

      // Interpret the AST
      const resultState = await interpreter.interpret(ast, { filePath, initialState: state });

      // Convert to desired format using the updated state
      const converted = await output.convert(ast, resultState, options.format || 'llm');

      return converted;
    } catch (error) {
      // If it's a MeldFileNotFoundError, just throw it as is
      if (error instanceof MeldFileNotFoundError) {
        throw error;
      }
      // For other Error instances, preserve the error
      if (error instanceof Error) {
        throw error;
      }
      // For non-Error objects, convert to string
      throw new Error(String(error));
    }
  }
}
```

# DirectiveService.test.ts

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DirectiveService } from './DirectiveService.js';
import { TestContext } from '@tests/utils/TestContext.js';
import { DirectiveError, DirectiveErrorCode } from './errors/DirectiveError.js';
import type { DirectiveNode } from 'meld-spec';

describe('DirectiveService', () => {
  let context: TestContext;
  let service: DirectiveService;

  beforeEach(async () => {
    // Initialize test context
    context = new TestContext();
    await context.initialize();

    // Create service instance
    service = new DirectiveService();

    // Initialize with real services from context
    service.initialize(
      context.services.validation,
      context.services.state,
      context.services.path,
      context.services.filesystem,
      context.services.parser,
      context.services.interpreter,
      context.services.circularity,
      context.services.resolution
    );

    // Load test fixtures
    await context.fixtures.load('directiveTestProject');
  });

  afterEach(async () => {
    await context.cleanup();
  });

  describe('Service initialization', () => {
    it('should initialize with all required services', () => {
      expect(service.getSupportedDirectives()).toContain('text');
      expect(service.getSupportedDirectives()).toContain('data');
      expect(service.getSupportedDirectives()).toContain('path');
    });

    it('should throw if used before initialization', async () => {
      const uninitializedService = new DirectiveService();
      const node = context.factory.createTextDirective('test', '"value"', context.factory.createLocation(1, 1));
      const execContext = { currentFilePath: 'test.meld', state: context.services.state };
      await expect(uninitializedService.processDirective(node, execContext))
        .rejects.toThrow('DirectiveService must be initialized before use');
    });
  });

  describe('Directive processing', () => {
    describe('Text directives', () => {
      it('should process basic text directive', async () => {
        // Verify file exists
        const exists = await context.fs.exists('test.meld');
        console.log('test.meld exists:', exists);

        // Parse the fixture file
        const content = await context.fs.readFile('test.meld');
        console.log('test.meld content:', content);

        const nodes = await context.services.parser.parse(content);
        console.log('Parsed nodes:', nodes);

        const node = nodes[0] as DirectiveNode;

        // Create execution context
        const execContext = {
          currentFilePath: 'test.meld',
          state: context.services.state
        };

        // Process the directive
        const result = await service.processDirective(node, execContext);

        // Verify the result
        expect(result.getTextVar('greeting')).toBe('Hello');
      });

      it('should process text directive with variable interpolation', async () => {
        // Set up initial state with a variable
        const state = context.services.state;
        state.setTextVar('name', 'World');

        // Parse and process
        const content = await context.fs.readFile('test-interpolation.meld');
        const nodes = await context.services.parser.parse(content);
        const node = nodes[0] as DirectiveNode;

        const result = await service.processDirective(node, {
          currentFilePath: 'test-interpolation.meld',
          state
        });

        expect(result.getTextVar('greeting')).toBe('Hello World');
      });
    });

    describe('Data directives', () => {
      it('should process data directive with object value', async () => {
        const content = await context.fs.readFile('test-data.meld');
        const nodes = await context.services.parser.parse(content);
        const node = nodes[0] as DirectiveNode;

        const result = await service.processDirective(node, {
          currentFilePath: 'test-data.meld',
          state: context.services.state
        });

        expect(result.getDataVar('config')).toEqual({ key: 'value' });
      });

      it('should process data directive with variable interpolation', async () => {
        // Set up initial state
        const state = context.services.state;
        state.setTextVar('user', 'Alice');

        const content = await context.fs.readFile('test-data-interpolation.meld');
        const nodes = await context.services.parser.parse(content);
        const node = nodes[0] as DirectiveNode;

        const result = await service.processDirective(node, {
          currentFilePath: 'test-data-interpolation.meld',
          state
        });

        expect(result.getDataVar('config')).toEqual({ greeting: 'Hello Alice' });
      });
    });

    describe('Import directives', () => {
      it('should process basic import', async () => {
        // Create import directive node with value property
        const node = context.factory.createImportDirective('module.meld', context.factory.createLocation(1, 1));

        const result = await service.processDirective(node, {
          currentFilePath: 'main.meld',
          state: context.services.state
        });

        expect(result.getTextVar('greeting')).toBe('Hello');
      });

      it('should handle nested imports', async () => {
        // Create import directive node with value property
        const node = context.factory.createImportDirective('inner.meld', context.factory.createLocation(1, 1));

        const result = await service.processDirective(node, {
          currentFilePath: 'middle.meld',
          state: context.services.state
        });

        expect(result.getTextVar('greeting')).toBe('Hello');
      });

      it('should detect circular imports', async () => {
        // Create import directive node with value property
        const node = context.factory.createImportDirective('b.meld', context.factory.createLocation(1, 1));

        await expect(service.processDirective(node, {
          currentFilePath: 'a.meld',
          state: context.services.state
        })).rejects.toThrow(DirectiveError);
      });
    });

    // ... continue with other directive types and error cases
  });
});
```

# DirectiveService.ts

```typescript
import type { DirectiveNode, DirectiveKind, DirectiveData } from 'meld-spec';
import { directiveLogger } from '../../../core/utils/logger.js';
import { IDirectiveService, IDirectiveHandler, DirectiveContext } from './IDirectiveService.js';
import { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import { IStateService } from '@services/state/StateService/IStateService.js';
import { IPathService } from '@services/fs/PathService/IPathService.js';
import { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import { ICircularityService } from '@services/resolution/CircularityService/ICircularityService.js';
import { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { DirectiveError, DirectiveErrorCode } from './errors/DirectiveError.js';
import type { ILogger } from './handlers/execution/EmbedDirectiveHandler.js';

// Import all handlers
import { TextDirectiveHandler } from './handlers/definition/TextDirectiveHandler.js';
import { DataDirectiveHandler } from './handlers/definition/DataDirectiveHandler.js';
import { PathDirectiveHandler } from './handlers/definition/PathDirectiveHandler.js';
import { DefineDirectiveHandler } from './handlers/definition/DefineDirectiveHandler.js';
import { RunDirectiveHandler } from './handlers/execution/RunDirectiveHandler.js';
import { EmbedDirectiveHandler } from './handlers/execution/EmbedDirectiveHandler.js';
import { ImportDirectiveHandler } from './handlers/execution/ImportDirectiveHandler.js';

export class MeldLLMXMLError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'MeldLLMXMLError';
    Object.setPrototypeOf(this, MeldLLMXMLError.prototype);
  }
}

/**
 * Service responsible for handling directives
 */
export class DirectiveService implements IDirectiveService {
  private validationService?: IValidationService;
  private stateService?: IStateService;
  private pathService?: IPathService;
  private fileSystemService?: IFileSystemService;
  private parserService?: IParserService;
  private interpreterService?: IInterpreterService;
  private circularityService?: ICircularityService;
  private resolutionService?: IResolutionService;
  private initialized = false;
  private logger: ILogger;

  private handlers: Map<string, IDirectiveHandler> = new Map();

  constructor(logger?: ILogger) {
    this.logger = logger || directiveLogger;
  }

  initialize(
    validationService: IValidationService,
    stateService: IStateService,
    pathService: IPathService,
    fileSystemService: IFileSystemService,
    parserService: IParserService,
    interpreterService: IInterpreterService,
    circularityService: ICircularityService,
    resolutionService: IResolutionService
  ): void {
    this.validationService = validationService;
    this.stateService = stateService;
    this.pathService = pathService;
    this.fileSystemService = fileSystemService;
    this.parserService = parserService;
    this.interpreterService = interpreterService;
    this.circularityService = circularityService;
    this.resolutionService = resolutionService;
    this.initialized = true;

    // Register default handlers
    this.registerDefaultHandlers();

    this.logger.debug('DirectiveService initialized', {
      handlers: Array.from(this.handlers.keys())
    });
  }

  /**
   * Register all default directive handlers
   */
  public registerDefaultHandlers(): void {
    // Definition handlers
    this.registerHandler(
      new TextDirectiveHandler(
        this.validationService!,
        this.stateService!,
        this.resolutionService!
      )
    );

    this.registerHandler(
      new DataDirectiveHandler(
        this.validationService!,
        this.stateService!,
        this.resolutionService!
      )
    );

    this.registerHandler(
      new PathDirectiveHandler(
        this.validationService!,
        this.stateService!,
        this.resolutionService!
      )
    );

    this.registerHandler(
      new DefineDirectiveHandler(
        this.validationService!,
        this.stateService!,
        this.resolutionService!
      )
    );

    // Execution handlers
    this.registerHandler(
      new RunDirectiveHandler(
        this.validationService!,
        this.resolutionService!,
        this.stateService!,
        this.fileSystemService!
      )
    );

    this.registerHandler(
      new EmbedDirectiveHandler(
        this.validationService!,
        this.resolutionService!,
        this.stateService!,
        this.circularityService!,
        this.fileSystemService!,
        this.parserService!,
        this.interpreterService!,
        this.logger
      )
    );

    this.registerHandler(
      new ImportDirectiveHandler(
        this.validationService!,
        this.resolutionService!,
        this.stateService!,
        this.fileSystemService!,
        this.parserService!,
        this.interpreterService!,
        this.circularityService!
      )
    );
  }

  /**
   * Register a new directive handler
   */
  registerHandler(handler: IDirectiveHandler): void {
    if (!this.initialized) {
      throw new Error('DirectiveService must be initialized before registering handlers');
    }

    if (!handler.kind) {
      throw new Error('Handler must have a kind property');
    }

    this.handlers.set(handler.kind, handler);
    this.logger.debug(`Registered handler for directive: ${handler.kind}`);
  }

  /**
   * Handle a directive node
   */
  public async handleDirective(node: DirectiveNode, context: DirectiveContext): Promise<IStateService> {
    return this.processDirective(node, context);
  }

  /**
   * Process multiple directives in sequence
   */
  async processDirectives(nodes: DirectiveNode[], parentContext?: DirectiveContext): Promise<IStateService> {
    let currentState = parentContext?.state?.clone() || this.stateService!.createChildState();

    for (const node of nodes) {
      // Create a new context with the current state as parent and a new child state
      const nodeContext = {
        currentFilePath: parentContext?.currentFilePath || '',
        parentState: currentState,
        state: currentState.createChildState()
      };

      // Process directive and get the updated state
      const result = await this.processDirective(node, nodeContext);

      // If transformation is enabled, we don't merge states since the directive
      // will be replaced with a text node and its state will be handled separately
      if (!currentState.isTransformationEnabled?.()) {
        // result is always an IStateService from processDirective
        currentState.mergeChildState(result);
      }
    }

    return currentState;
  }

  /**
   * Create execution context for a directive
   */
  private createContext(node: DirectiveNode, parentContext?: DirectiveContext): DirectiveContext {
    if (!this.stateService) {
      throw new Error('DirectiveService must be initialized before use');
    }
    const state = parentContext?.state?.clone() || this.stateService.createChildState();
    return {
      currentFilePath: parentContext?.currentFilePath || '',
      parentState: parentContext?.state,
      state
    };
  }

  /**
   * Update the interpreter service reference
   */
  updateInterpreterService(interpreterService: IInterpreterService): void {
    this.interpreterService = interpreterService;
    this.logger.debug('Updated interpreter service reference');
  }

  /**
   * Check if a handler exists for a directive kind
   */
  hasHandler(kind: string): boolean {
    return this.handlers.has(kind);
  }

  /**
   * Validate a directive node
   */
  async validateDirective(node: DirectiveNode): Promise<void> {
    try {
      await this.validationService!.validate(node);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorForLog = error instanceof Error ? error : new Error(String(error));

      this.logger.error('Failed to validate directive', {
        kind: node.directive.kind,
        location: node.location,
        error: errorForLog
      });

      throw new DirectiveError(
        errorMessage,
        node.directive.kind,
        DirectiveErrorCode.VALIDATION_FAILED,
        {
          node
        }
      );
    }
  }

  /**
   * Create a child context for nested directives
   */
  public createChildContext(parentContext: DirectiveContext, filePath: string): DirectiveContext {
    return {
      currentFilePath: filePath,
      state: parentContext.state.createChildState(),
      parentState: parentContext.state
    };
  }

  supportsDirective(kind: string): boolean {
    return this.handlers.has(kind);
  }

  getSupportedDirectives(): string[] {
    return Array.from(this.handlers.keys());
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('DirectiveService must be initialized before use');
    }
  }

  private async handleTextDirective(node: DirectiveNode): Promise<void> {
    const directive = node.directive;

    this.logger.debug('Processing text directive', {
      identifier: directive.identifier,
      location: node.location
    });

    try {
      // Value is already interpolated by meld-ast
      await this.stateService!.setTextVar(directive.identifier, directive.value);

      this.logger.debug('Text directive processed successfully', {
        identifier: directive.identifier,
        location: node.location
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorForLog = error instanceof Error ? error : new Error(String(error));

      this.logger.error('Failed to process text directive', {
        identifier: directive.identifier,
        location: node.location,
        error: errorForLog
      });

      throw new MeldDirectiveError(
        errorMessage,
        'text',
        node.location?.start
      );
    }
  }

  private async handleDataDirective(node: DirectiveNode): Promise<void> {
    const directive = node.directive;

    this.logger.debug('Processing data directive', {
      identifier: directive.identifier,
      location: node.location
    });

    try {
      // Value is already interpolated by meld-ast
      let value = directive.value;
      if (typeof value === 'string') {
        value = JSON.parse(value);
      }

      await this.stateService!.setDataVar(directive.identifier, value);

      this.logger.debug('Data directive processed successfully', {
        identifier: directive.identifier,
        location: node.location
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorForLog = error instanceof Error ? error : new Error(String(error));

      this.logger.error('Failed to process data directive', {
        identifier: directive.identifier,
        location: node.location,
        error: errorForLog
      });

      throw new MeldDirectiveError(
        errorMessage,
        'data',
        node.location?.start
      );
    }
  }

  private async handleImportDirective(node: DirectiveNode): Promise<void> {
    const directive = node.directive;

    this.logger.debug('Processing import directive', {
      path: directive.path,
      section: directive.section,
      fuzzy: directive.fuzzy,
      location: node.location
    });

    try {
      // Path is already interpolated by meld-ast
      const fullPath = await this.pathService!.resolvePath(directive.path);

      // Check for circular imports
      this.circularityService!.beginImport(fullPath);

      try {
        // Check if file exists
        if (!await this.fileSystemService!.exists(fullPath)) {
          throw new Error(`Import file not found: ${fullPath}`);
        }

        // Create a child state for the import
        const childState = await this.stateService!.createChildState();

        // Read the file content
        const content = await this.fileSystemService!.readFile(fullPath);

        // If a section is specified, extract it (section name is already interpolated)
        let processedContent = content;
        if (directive.section) {
          processedContent = await this.extractSection(
            content,
            directive.section,
            directive.fuzzy || 0
          );
        }

        // Parse and interpret the content
        const parsedNodes = await this.parserService!.parse(processedContent);
        await this.interpreterService!.interpret(parsedNodes, {
          initialState: childState,
          filePath: fullPath,
          mergeState: true
        });

        this.logger.debug('Import content processed', {
          path: fullPath,
          section: directive.section,
          location: node.location
        });
      } finally {
        // Always end import tracking, even if there was an error
        this.circularityService!.endImport(fullPath);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorForLog = error instanceof Error ? error : new Error(String(error));

      this.logger.error('Failed to process import directive', {
        path: directive.path,
        section: directive.section,
        location: node.location,
        error: errorForLog
      });

      throw new MeldDirectiveError(
        errorMessage,
        'import',
        node.location?.start
      );
    }
  }

  private async extractSection(
    content: string,
    section: string,
    fuzzyMatch: number
  ): Promise<string> {
    try {
      // Split content into lines
      const lines = content.split('\n');
      const headings: { title: string; line: number; level: number }[] = [];

      // Find all headings and their levels
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(/^(#{1,6})\s+(.+)$/);
        if (match) {
          headings.push({
            title: match[2],
            line: i,
            level: match[1].length
          });
        }
      }

      // Find best matching heading
      let bestMatch: typeof headings[0] | undefined;
      let bestScore = 0;

      for (const heading of headings) {
        const score = this.calculateSimilarity(heading.title, section);
        if (score > fuzzyMatch && score > bestScore) {
          bestScore = score;
          bestMatch = heading;
        }
      }

      if (!bestMatch) {
        // Find closest match for error message
        let closestMatch = '';
        let closestScore = 0;
        for (const heading of headings) {
          const score = this.calculateSimilarity(heading.title, section);
          if (score > closestScore) {
            closestScore = score;
            closestMatch = heading.title;
          }
        }

        throw new MeldLLMXMLError(
          'Section not found',
          'SECTION_NOT_FOUND',
          { title: section, bestMatch: closestMatch }
        );
      }

      // Find the end of the section (next heading of same or higher level)
      let endLine = lines.length;
      for (let i = bestMatch.line + 1; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(/^(#{1,6})\s+/);
        if (match && match[1].length <= bestMatch.level) {
          endLine = i;
          break;
        }
      }

      // Extract the section content
      return lines.slice(bestMatch.line, endLine).join('\n');
    } catch (error) {
      if (error instanceof MeldLLMXMLError) {
        throw error;
      }
      throw new MeldLLMXMLError(
        error instanceof Error ? error.message : 'Unknown error during section extraction',
        'PARSE_ERROR',
        error
      );
    }
  }

  private calculateSimilarity(str1: string, str2: string): number {
    // Convert strings to lowercase for case-insensitive comparison
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();

    if (s1 === s2) return 1.0;

    // Calculate Levenshtein distance
    const len1 = s1.length;
    const len2 = s2.length;
    const matrix: number[][] = [];

    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    // Convert distance to similarity score between 0 and 1
    const maxLen = Math.max(len1, len2);
    return maxLen === 0 ? 1.0 : 1.0 - matrix[len1][len2] / maxLen;
  }

  private async handleEmbedDirective(node: DirectiveNode): Promise<void> {
    const directive = node.directive;

    this.logger.debug('Processing embed directive', {
      path: directive.path,
      section: directive.section,
      fuzzy: directive.fuzzy,
      names: directive.names,
      location: node.location
    });

    try {
      // Path is already interpolated by meld-ast
      const fullPath = await this.pathService!.resolvePath(directive.path);

      // Check for circular imports
      this.circularityService!.beginImport(fullPath);

      try {
        // Check if file exists
        if (!await this.fileSystemService!.exists(fullPath)) {
          throw new Error(`Embed file not found: ${fullPath}`);
        }

        // Create a child state for the import
        const childState = await this.stateService!.createChildState();

        // Read the file content
        const content = await this.fileSystemService!.readFile(fullPath);

        // If a section is specified, extract it (section name is already interpolated)
        let processedContent = content;
        if (directive.section) {
          processedContent = await this.extractSection(
            content,
            directive.section,
            directive.fuzzy || 0
          );
        }

        // Parse and interpret the content
        const parsedNodes = await this.parserService!.parse(processedContent);
        await this.interpreterService!.interpret(parsedNodes, {
          initialState: childState,
          filePath: fullPath,
          mergeState: true
        });

        this.logger.debug('Embed content processed', {
          path: fullPath,
          section: directive.section,
          location: node.location
        });
      } finally {
        // Always end import tracking, even if there was an error
        this.circularityService!.endImport(fullPath);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorForLog = error instanceof Error ? error : new Error(String(error));

      this.logger.error('Failed to process embed directive', {
        path: directive.path,
        section: directive.section,
        location: node.location,
        error: errorForLog
      });

      throw new MeldDirectiveError(
        errorMessage,
        'embed',
        node.location?.start
      );
    }
  }

  /**
   * Process a directive node, validating and executing it
   * Values in the directive will already be interpolated by meld-ast
   * @returns The updated state after directive execution
   * @throws {MeldDirectiveError} If directive processing fails
   */
  public async processDirective(node: DirectiveNode, context: DirectiveContext): Promise<IStateService> {
    // Add initialization check before any other processing
    if (!this.initialized) {
      throw new Error('DirectiveService must be initialized before use');
    }

    try {
      // Get the handler for this directive kind
      const { kind } = node.directive;
      const handler = this.handlers.get(kind);

      if (!handler) {
        throw new DirectiveError(
          `No handler found for directive: ${kind}`,
          kind,
          DirectiveErrorCode.HANDLER_NOT_FOUND,
          { node }
        );
      }

      // Validate directive before handling
      await this.validateDirective(node);

      // Execute the directive and handle both possible return types
      const result = await handler.execute(node, context);

      // If result is a DirectiveResult, return its state
      if ('state' in result) {
        return result.state;
      }

      // Otherwise, result is already an IStateService
      return result;
    } catch (error) {
      if (error instanceof DirectiveError) {
        throw error;
      }

      // Simplify error messages for common cases
      let message = error instanceof Error ? error.message : String(error);
      let code = DirectiveErrorCode.EXECUTION_FAILED;

      if (message.includes('file not found') || message.includes('no such file')) {
        message = `Referenced file not found: ${node.directive.path || node.directive.value}`;
        code = DirectiveErrorCode.FILE_NOT_FOUND;
      } else if (message.includes('circular import') || message.includes('circular reference')) {
        message = 'Circular import detected';
        code = DirectiveErrorCode.CIRCULAR_REFERENCE;
      } else if (message.includes('parameter count') || message.includes('wrong number of parameters')) {
        message = 'Invalid parameter count';
        code = DirectiveErrorCode.VALIDATION_FAILED;
      } else if (message.includes('invalid path') || message.includes('path validation failed')) {
        message = 'Invalid path';
        code = DirectiveErrorCode.VALIDATION_FAILED;
      }

      throw new DirectiveError(
        message,
        node.directive?.kind || 'unknown',
        code,
        { node, cause: error instanceof Error ? error : undefined }
      );
    }
  }
}
```

# IDirectiveService.ts

```typescript
import { DirectiveNode } from 'meld-spec';
import { IStateService } from '@services/state/StateService/IStateService.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { DirectiveResult } from './types.js';

/**
 * Context for directive execution
 */
export interface DirectiveContext {
  /** Current file being processed */
  currentFilePath?: string;
  /** Parent state for nested contexts */
  parentState?: IStateService;
  /** Current state for this directive */
  state: IStateService;
  /** Working directory for command execution */
  workingDirectory?: string;
}

/**
 * Interface for directive handlers
 */
export interface IDirectiveHandler {
  /** The directive kind this handler processes */
  readonly kind: string;

  /**
   * Execute the directive
   * @returns The updated state after directive execution, or a DirectiveResult containing both state and optional replacement node
   */
  execute(
    node: DirectiveNode,
    context: DirectiveContext
  ): Promise<DirectiveResult | IStateService>;
}

/**
 * Service responsible for handling directives
 */
export interface IDirectiveService {
  /**
   * Initialize the DirectiveService with required dependencies
   */
  initialize(
    validationService: IValidationService,
    stateService: IStateService,
    pathService: IPathService,
    fileSystemService: IFileSystemService,
    parserService: IParserService,
    interpreterService: IInterpreterService,
    circularityService: ICircularityService,
    resolutionService: IResolutionService
  ): void;

  /**
   * Update the interpreter service reference
   * This is needed to handle circular dependencies in initialization
   */
  updateInterpreterService(interpreterService: IInterpreterService): void;

  /**
   * Handle a directive node
   * @returns The updated state after directive execution
   */
  handleDirective(
    node: DirectiveNode,
    context: DirectiveContext
  ): Promise<IStateService>;

  /**
   * Register a new directive handler
   */
  registerHandler(handler: IDirectiveHandler): void;

  /**
   * Check if a handler exists for a directive kind
   */
  hasHandler(kind: string): boolean;

  /**
   * Validate a directive node
   */
  validateDirective(node: DirectiveNode): Promise<void>;

  /**
   * Create a child context for nested directives
   */
  createChildContext(
    parentContext: DirectiveContext,
    filePath: string
  ): DirectiveContext;

  /**
   * Process a directive node, validating and executing it
   * Values in the directive will already be interpolated by meld-ast
   * @returns The updated state after directive execution
   * @throws {MeldDirectiveError} If directive processing fails
   */
  processDirective(node: DirectiveNode, parentContext?: DirectiveContext): Promise<IStateService>;

  /**
   * Process multiple directive nodes in sequence
   * @returns The final state after processing all directives
   * @throws {MeldDirectiveError} If any directive processing fails
   */
  processDirectives(nodes: DirectiveNode[], parentContext?: DirectiveContext): Promise<IStateService>;

  /**
   * Check if a directive kind is supported
   */
  supportsDirective(kind: string): boolean;

  /**
   * Get a list of all supported directive kinds
   */
  getSupportedDirectives(): string[];
}
```

# DirectiveError.ts

```typescript
import { DirectiveNode } from 'meld-spec';
import { DirectiveContext } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import type { Location } from '@core/types/index.js';

/**
 * Error codes for directive failures
 */
export enum DirectiveErrorCode {
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  RESOLUTION_FAILED = 'RESOLUTION_FAILED',
  EXECUTION_FAILED = 'EXECUTION_FAILED',
  HANDLER_NOT_FOUND = 'HANDLER_NOT_FOUND',
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  CIRCULAR_REFERENCE = 'CIRCULAR_REFERENCE',
  VARIABLE_NOT_FOUND = 'VARIABLE_NOT_FOUND',
  STATE_ERROR = 'STATE_ERROR',
  INVALID_CONTEXT = 'INVALID_CONTEXT'
}

interface SerializedDirectiveError {
  name: string;
  message: string;
  kind: string;
  code: DirectiveErrorCode;
  location?: Location;
  filePath?: string;
  cause?: string;
  fullCauseMessage?: string;
}

/**
 * Error thrown when directive handling fails
 */
export class DirectiveError extends Error {
  public readonly location?: Location;
  public readonly filePath?: string;
  private readonly errorCause?: Error;

  constructor(
    message: string,
    public readonly kind: string,
    public readonly code: DirectiveErrorCode,
    public readonly details?: {
      node?: DirectiveNode;
      context?: DirectiveContext;
      cause?: Error;
      location?: Location;
      details?: {
        node?: DirectiveNode;
        location?: Location;
      };
    }
  ) {
    // Create message with location if available
    const loc = details?.location ?? details?.node?.location;
    const locationStr = loc ?
      ` at line ${loc.start.line}, column ${loc.start.column}` : '';
    const filePathStr = details?.context?.currentFilePath ?
      ` in ${details.context.currentFilePath}` : '';

    // Include cause message in the full error message if available
    const causeStr = details?.cause ? ` | Caused by: ${details.cause.message}` : '';

    super(`Directive error (${kind}): ${message}${locationStr}${filePathStr}${causeStr}`);
    this.name = 'DirectiveError';

    // Store essential properties
    this.location = details?.location ?? details?.node?.location;
    this.filePath = details?.context?.currentFilePath;
    this.errorCause = details?.cause;

    // Set cause property for standard error chaining
    if (details?.cause) {
      Object.defineProperty(this, 'cause', {
        value: details.cause,
        enumerable: true,
        configurable: true,
        writable: false
      });
    }

    // Ensure proper prototype chain
    Object.setPrototypeOf(this, DirectiveError.prototype);
  }

  // Add public getter for cause that ensures we always return the full error
  public get cause(): Error | undefined {
    return this.errorCause;
  }

  /**
   * Custom serialization to avoid circular references and include only essential info
   */
  toJSON(): SerializedDirectiveError {
    return {
      name: this.name,
      message: this.message,
      kind: this.kind,
      code: this.code,
      location: this.location,
      filePath: this.filePath,
      cause: this.errorCause?.message,
      fullCauseMessage: this.errorCause ? this.getFullCauseMessage(this.errorCause) : undefined
    };
  }

  /**
   * Helper to get the full cause message chain
   */
  private getFullCauseMessage(error: Error): string {
    let message = error.message;
    if ('cause' in error && error.cause instanceof Error) {
      message += ` | Caused by: ${this.getFullCauseMessage(error.cause)}`;
    }
    return message;
  }
}
```

# DataDirectiveHandler.test.ts

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DataDirectiveHandler } from './DataDirectiveHandler.js';
import { createDataDirective, createLocation, createDirectiveNode } from '@tests/utils/testFactories.js';
import { TestContext } from '@tests/utils/TestContext.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { DirectiveNode } from 'meld-spec';
import type { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import { DirectiveError } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';

describe('DataDirectiveHandler', () => {
  let context: TestContext;
  let handler: DataDirectiveHandler;
  let validationService: IValidationService;
  let stateService: IStateService;
  let resolutionService: IResolutionService;
  let clonedState: IStateService;

  beforeEach(async () => {
    // Initialize test context with memfs
    context = new TestContext();
    await context.initialize();

    validationService = {
      validate: vi.fn()
    } as unknown as IValidationService;

    clonedState = {
      setDataVar: vi.fn(),
      clone: vi.fn()
    } as unknown as IStateService;

    stateService = {
      setDataVar: vi.fn(),
      clone: vi.fn().mockReturnValue(clonedState)
    } as unknown as IStateService;

    resolutionService = {
      resolveInContext: vi.fn()
    } as unknown as IResolutionService;

    handler = new DataDirectiveHandler(
      validationService,
      stateService,
      resolutionService
    );
  });

  afterEach(async () => {
    await context.cleanup();
  });

  describe('basic data handling', () => {
    it('should process simple JSON data', async () => {
      const node = createDirectiveNode('data', {
        identifier: 'config',
        value: '{"key": "value"}'
      }, createLocation(1, 1, 1, 20, '/test.meld'));

      const directiveContext = {
        currentFilePath: '/test.meld',
        state: stateService
      };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('{"key": "value"}');

      const result = await handler.execute(node, directiveContext);

      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(stateService.clone).toHaveBeenCalled();
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(
        '{"key": "value"}',
        expect.any(Object)
      );
      expect(clonedState.setDataVar).toHaveBeenCalledWith('config', { key: 'value' });
      expect(result).toBe(clonedState);
    });

    it('should handle nested JSON objects', async () => {
      const jsonData = '{"nested": {"key": "value"}}';
      const node = createDirectiveNode('data', {
        identifier: 'config',
        value: jsonData
      }, createLocation(1, 1, 1, 35, '/test.meld'));

      const directiveContext = {
        currentFilePath: '/test.meld',
        state: stateService
      };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce(jsonData);

      const result = await handler.execute(node, directiveContext);

      expect(stateService.clone).toHaveBeenCalled();
      expect(clonedState.setDataVar).toHaveBeenCalledWith('config', { nested: { key: 'value' } });
      expect(result).toBe(clonedState);
    });

    it('should handle JSON arrays', async () => {
      const jsonData = '[1, 2, 3]';
      const node = createDirectiveNode('data', {
        identifier: 'numbers',
        value: jsonData
      }, createLocation(1, 1, 1, 15, '/test.meld'));

      const directiveContext = {
        currentFilePath: '/test.meld',
        state: stateService
      };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce(jsonData);

      const result = await handler.execute(node, directiveContext);

      expect(stateService.clone).toHaveBeenCalled();
      expect(clonedState.setDataVar).toHaveBeenCalledWith('numbers', [1, 2, 3]);
      expect(result).toBe(clonedState);
    });
  });

  describe('error handling', () => {
    it('should handle invalid JSON', async () => {
      const node = createDirectiveNode('data', {
        identifier: 'invalid',
        value: '{invalid: json}'
      }, createLocation(1, 1, 1, 20, '/test.meld'));

      const directiveContext = {
        currentFilePath: '/test.meld',
        state: stateService,
        parentState: undefined
      };

      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('{invalid: json}');

      await expect(handler.execute(node, directiveContext)).rejects.toThrow(DirectiveError);
    });

    it('should handle resolution errors', async () => {
      const node = createDirectiveNode('data', {
        identifier: 'error',
        value: '${missing}'
      }, createLocation(1, 1, 1, 15, '/test.meld'));

      const directiveContext = {
        currentFilePath: '/test.meld',
        state: stateService,
        parentState: undefined
      };

      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockImplementation(() => {
        throw new Error('Resolution failed');
      });

      await expect(handler.execute(node, directiveContext)).rejects.toThrow(DirectiveError);
    });

    it('should handle state errors', async () => {
      const node = createDirectiveNode('data', {
        identifier: 'error',
        value: '{ "key": "value" }'
      }, createLocation(1, 1, 1, 25, '/test.meld'));

      const directiveContext = {
        currentFilePath: '/test.meld',
        state: stateService,
        parentState: undefined
      };

      const clonedState = {
        ...stateService,
        clone: vi.fn().mockReturnThis(),
        setDataVar: vi.fn().mockImplementation(() => {
          throw new Error('State error');
        })
      };

      vi.mocked(stateService.clone).mockReturnValue(clonedState);
      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('{ "key": "value" }');

      await expect(handler.execute(node, directiveContext)).rejects.toThrow(DirectiveError);
    });
  });

  describe('variable resolution', () => {
    it('should resolve variables in nested JSON structures', async () => {
      const node = createDirectiveNode('data', {
        identifier: 'config',
        value: JSON.stringify({
          user: {
            name: '${userName}',
            role: '${userRole}',
            settings: {
              theme: '${theme}',
              items: ['${item1}', '${item2}']
            }
          }
        })
      }, createLocation(1, 1, 1, 50, '/test.meld'));

      const directiveContext = {
        currentFilePath: '/test.meld',
        state: stateService
      };

      // Mock resolveInContext to handle variables within strings
      vi.mocked(resolutionService.resolveInContext)
        .mockImplementation(async (value: string) => {
          return value.replace(/\${([^}]+)}/g, (match, varName) => {
            const vars: Record<string, string> = {
              userName: 'Alice',
              userRole: 'admin',
              theme: 'dark',
              item1: 'first',
              item2: 'second'
            };
            return vars[varName] || match;
          });
        });

      const result = await handler.execute(node, directiveContext);

      expect(clonedState.setDataVar).toHaveBeenCalledWith('config', {
        user: {
          name: 'Alice',
          role: 'admin',
          settings: {
            theme: 'dark',
            items: ['first', 'second']
          }
        }
      });
    });

    it('should handle JSON strings containing variable references', async () => {
      const node = createDirectiveNode('data', {
        identifier: 'message',
        value: '{"text": "Hello ${user}!"}'
      }, createLocation(1, 1, 1, 30, '/test.meld'));

      const directiveContext = {
        currentFilePath: '/test.meld',
        state: stateService
      };

      // Mock resolveInContext to handle variables within strings
      vi.mocked(resolutionService.resolveInContext)
        .mockImplementation(async (value: string) => {
          return value.replace(/\${([^}]+)}/g, (match, varName) => {
            const vars: Record<string, string> = {
              user: 'Alice'
            };
            return vars[varName] || match;
          });
        });

      const result = await handler.execute(node, directiveContext);

      expect(clonedState.setDataVar).toHaveBeenCalledWith('message', {
        text: 'Hello Alice!'
      });
    });

    it('should preserve JSON structure when resolving variables', async () => {
      const node = createDirectiveNode('data', {
        identifier: 'data',
        value: '{"array": [1, "${var}", 3], "object": {"key": "${var}"}}'
      }, createLocation(1, 1, 1, 40, '/test.meld'));

      const directiveContext = {
        currentFilePath: '/test.meld',
        state: stateService
      };

      vi.mocked(resolutionService.resolveInContext)
        .mockImplementation(async (value: string) => {
          return value.replace(/\${([^}]+)}/g, (match, varName) => {
            const vars: Record<string, string> = {
              var: '2'
            };
            return vars[varName] || match;
          });
        });

      const result = await handler.execute(node, directiveContext);

      expect(clonedState.setDataVar).toHaveBeenCalledWith('data', {
        array: [1, '2', 3],
        object: { key: '2' }
      });
    });
  });
});
```

# DataDirectiveHandler.ts

```typescript
import { DirectiveNode } from 'meld-spec';
// TODO: Use meld-ast nodes and types instead of meld-spec directly
// TODO: Import MeldDirectiveError from core/errors for proper error hierarchy

import { IDirectiveHandler, DirectiveContext } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import { IStateService } from '@services/state/StateService/IStateService.js';
import { IResolutionService, ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';
import { directiveLogger as logger } from '@core/utils/logger.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';

/**
 * Handler for @data directives
 * Stores data values in state after resolving variables and processing embedded content
 */
export class DataDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'data';

  constructor(
    private validationService: IValidationService,
    private stateService: IStateService,
    private resolutionService: IResolutionService
  ) {}

  public async execute(node: DirectiveNode, context: DirectiveContext): Promise<IStateService> {
    await this.validationService.validate(node);

    const { identifier, value } = node.directive;
    const resolutionContext: ResolutionContext = {
      allowedVariableTypes: {
        text: true,
        data: true,
        path: true,
        command: true
      },
      currentFilePath: context.currentFilePath,
      state: context.state
    };

    try {
      let parsedValue: unknown;

      // Handle both string and object values
      if (typeof value === 'string') {
        // First resolve any variables in the JSON string
        const resolvedJsonString = await this.resolutionService.resolveInContext(value, resolutionContext);

        // Then parse the JSON
        try {
          parsedValue = JSON.parse(resolvedJsonString);
          // Recursively resolve any variables in the parsed object
          parsedValue = await this.resolveObjectFields(parsedValue, resolutionContext);
        } catch (error) {
          if (error instanceof Error) {
            throw new DirectiveError(
              `Invalid JSON in data directive: ${error.message}`,
              'data',
              DirectiveErrorCode.VALIDATION_FAILED,
              { node, context }
            );
          }
          throw error;
        }
      } else {
        // Value is already an object, resolve variables in it
        parsedValue = await this.resolveObjectFields(value, resolutionContext);
      }

      // Store the resolved value in a new state
      const newState = context.state.clone();
      newState.setDataVar(identifier, parsedValue);
      return newState;
    } catch (error) {
      if (error instanceof Error) {
        throw new DirectiveError(
          `Error processing data directive: ${error.message}`,
          'data',
          DirectiveErrorCode.EXECUTION_FAILED,
          { node, context }
        );
      }
      throw error;
    }
  }

  /**
   * Recursively resolve variables in object fields
   */
  private async resolveObjectFields(
    obj: any,
    context: ResolutionContext
  ): Promise<any> {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      // If the string contains any variable references, resolve them
      if (obj.includes('${') || obj.includes('#{') || obj.includes('$') || obj.includes('`')) {
        return this.resolutionService.resolveInContext(obj, context);
      }
      return obj;
    }

    if (Array.isArray(obj)) {
      return Promise.all(
        obj.map(item => this.resolveObjectFields(item, context))
      );
    }

    if (typeof obj === 'object') {
      const resolved: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        // Keep original key, only resolve value
        resolved[key] = await this.resolveObjectFields(value, context);
      }
      return resolved;
    }

    // For other primitive types (number, boolean, etc), return as is
    return obj;
  }

  /**
   * Validate resolved value against schema
   */
  private async validateSchema(
    value: any,
    schema: string,
    node: DirectiveNode
  ): Promise<void> {
    try {
      // TODO: Implement schema validation once schema system is defined
      // For now, just log that we would validate
      logger.debug('Schema validation requested', {
        schema,
        location: node.location
      });
    } catch (error) {
      if (error instanceof Error) {
        throw new DirectiveError(
          `Schema validation failed: ${error.message}`,
          'data',
          DirectiveErrorCode.VALIDATION_FAILED,
          { node }
        );
      }
      throw error;
    }
  }
}
```

# DefineDirectiveHandler.test.ts

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DefineDirectiveHandler } from './DefineDirectiveHandler.js';
import {
  createMockStateService,
  createMockValidationService,
  createMockResolutionService,
  createDefineDirective,
  createLocation
} from '@tests/utils/testFactories.js';
import { DirectiveError } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import type { DirectiveNode } from 'meld-spec';
import type { IStateService } from '@services/state/StateService/IStateService.js';

describe('DefineDirectiveHandler', () => {
  let handler: DefineDirectiveHandler;
  let stateService: ReturnType<typeof createMockStateService>;
  let validationService: ReturnType<typeof createMockValidationService>;
  let resolutionService: ReturnType<typeof createMockResolutionService>;
  let clonedState: IStateService;

  beforeEach(() => {
    clonedState = {
      setCommand: vi.fn(),
      getCommand: vi.fn(),
      clone: vi.fn(),
    } as unknown as IStateService;

    stateService = {
      setCommand: vi.fn(),
      getCommand: vi.fn(),
      clone: vi.fn().mockReturnValue(clonedState)
    } as unknown as IStateService;

    validationService = createMockValidationService();
    resolutionService = createMockResolutionService();
    handler = new DefineDirectiveHandler(validationService, stateService, resolutionService);
  });

  describe('value processing', () => {
    it('should handle basic command definition without parameters', async () => {
      const node = createDefineDirective(
        'greet',
        'echo "Hello"',
        [],
        createLocation(1, 1, 1, 20)
      );

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, context);
      expect(clonedState.setCommand).toHaveBeenCalledWith('greet', {
        parameters: [],
        command: 'echo "Hello"'
      });
    });

    it('should handle command definition with parameters', async () => {
      const node = createDefineDirective(
        'greet',
        'echo "Hello ${name}"',
        ['name'],
        createLocation(1, 1, 1, 30)
      );

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, context);
      expect(clonedState.setCommand).toHaveBeenCalledWith('greet', {
        parameters: ['name'],
        command: 'echo "Hello ${name}"'
      });
    });

    it('should handle command definition with multiple parameters', async () => {
      const node = createDefineDirective(
        'greet',
        'echo "Hello ${first} ${last}"',
        ['first', 'last'],
        createLocation(1, 1, 1, 40)
      );

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, context);
      expect(clonedState.setCommand).toHaveBeenCalledWith('greet', {
        parameters: ['first', 'last'],
        command: 'echo "Hello ${first} ${last}"'
      });
    });
  });

  describe('metadata handling', () => {
    it('should handle command risk metadata', async () => {
      const node = createDefineDirective(
        'risky.risk.high',
        'rm -rf /',
        [],
        createLocation(1, 1, 1, 25)
      );

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, context);
      expect(clonedState.setCommand).toHaveBeenCalledWith('risky', {
        parameters: [],
        command: 'rm -rf /',
        metadata: {
          risk: 'high'
        }
      });
    });

    it('should handle command about metadata', async () => {
      const node = createDefineDirective(
        'cmd.about',
        'echo "test"',
        [],
        createLocation(1, 1, 1, 25)
      );

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, context);
      expect(clonedState.setCommand).toHaveBeenCalledWith('cmd', {
        parameters: [],
        command: 'echo "test"',
        metadata: {
          about: 'This is a description'
        }
      });
    });
  });

  describe('validation', () => {
    it('should validate command structure through ValidationService', async () => {
      const node = createDefineDirective(
        'cmd',
        'echo "test"',
        [],
        createLocation(1, 1, 1, 20)
      );

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      await handler.execute(node, context);
      expect(validationService.validate).toHaveBeenCalledWith(node);
    });

    it('should reject empty commands', async () => {
      const node = createDefineDirective(
        'invalid',
        '',
        [],
        createLocation(1, 1, 1, 20)
      );

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(validationService.validate).mockRejectedValueOnce(
        new DirectiveError('Command cannot be empty', 'define')
      );

      await expect(handler.execute(node, context))
        .rejects
        .toThrow(DirectiveError);
    });

    it('should reject missing parameters referenced in command', async () => {
      const node = createDefineDirective(
        'greet',
        'echo "Hello ${name}"',
        [],
        createLocation(1, 1, 1, 30)
      );

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(validationService.validate).mockRejectedValueOnce(
        new DirectiveError('Parameter name is referenced in command but not declared', 'define')
      );

      await expect(handler.execute(node, context))
        .rejects
        .toThrow(DirectiveError);
    });

    it('should reject invalid parameter names', async () => {
      const node = createDefineDirective(
        'greet',
        'echo "Hello ${123invalid}"',
        ['123invalid'],
        createLocation(1, 1, 1, 35)
      );

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(validationService.validate).mockRejectedValueOnce(
        new DirectiveError('Invalid parameter name: 123invalid', 'define')
      );

      await expect(handler.execute(node, context))
        .rejects
        .toThrow(DirectiveError);
    });

    it('should reject duplicate parameter names', async () => {
      const node = createDefineDirective(
        'greet',
        'echo "Hello ${name}"',
        ['name', 'name'],
        createLocation(1, 1, 1, 30)
      );

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(validationService.validate).mockRejectedValueOnce(
        new DirectiveError('Duplicate parameter names are not allowed', 'define')
      );

      await expect(handler.execute(node, context))
        .rejects
        .toThrow(DirectiveError);
    });

    it('should reject invalid metadata fields', async () => {
      const node = createDefineDirective(
        'cmd.invalid',
        'echo "test"',
        [],
        createLocation(1, 1, 1, 25)
      );

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(validationService.validate).mockRejectedValueOnce(
        new DirectiveError('Invalid metadata field. Only risk and about are supported', 'define')
      );

      await expect(handler.execute(node, context))
        .rejects
        .toThrow(DirectiveError);
    });
  });

  describe('state management', () => {
    it('should create new state for command storage', async () => {
      const node = createDefineDirective(
        'cmd',
        'echo "test"',
        [],
        createLocation(1, 1, 1, 20)
      );

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      await handler.execute(node, context);
      expect(stateService.clone).toHaveBeenCalled();
    });

    it('should store command in new state', async () => {
      const node = createDefineDirective(
        'cmd',
        'echo "test"',
        [],
        createLocation(1, 1, 1, 20)
      );

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      await handler.execute(node, context);
      expect(clonedState.setCommand).toHaveBeenCalledWith('cmd', {
        parameters: [],
        command: 'echo "test"'
      });
    });
  });

  describe('error handling', () => {
    it('should handle validation errors', async () => {
      const node = createDefineDirective(
        '',
        'echo "test"',
        [],
        createLocation(1, 1, 1, 20)
      );

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(validationService.validate).mockRejectedValueOnce(
        new DirectiveError('Invalid command', 'define')
      );

      const error = await handler.execute(node, context).catch(e => e);
      expect(error).toBeInstanceOf(DirectiveError);
      expect(error.details?.location).toBeDefined();
    });

    it('should handle resolution errors', async () => {
      const node = createDefineDirective(
        'cmd',
        'echo "${undefined}"',
        [],
        createLocation(1, 1, 1, 25)
      );

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(validationService.validate).mockRejectedValueOnce(
        new DirectiveError('Resolution error', 'define')
      );

      const error = await handler.execute(node, context).catch(e => e);
      expect(error).toBeInstanceOf(DirectiveError);
      expect(error.details?.location).toBeDefined();
    });

    it('should handle state errors', async () => {
      const node = createDefineDirective(
        'cmd',
        'echo "test"',
        [],
        createLocation(1, 1, 1, 20)
      );

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(stateService.clone).mockReturnValue(clonedState);
      vi.mocked(clonedState.setCommand).mockImplementation(() => {
        throw new Error('State error');
      });

      const error = await handler.execute(node, context).catch(e => e);
      expect(error).toBeInstanceOf(DirectiveError);
      expect(error.details?.location).toBeDefined();
    });
  });
});
```

# DefineDirectiveHandler.ts

```typescript
import { IDirectiveHandler, DirectiveContext } from '../../IDirectiveService.js';
import { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import { IStateService } from '@services/state/StateService/IStateService.js';
import { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { DirectiveNode } from 'meld-spec';
import { DirectiveError, DirectiveErrorCode } from '../../errors/DirectiveError.js';
import { directiveLogger as logger } from '@core/utils/logger.js';

interface CommandDefinition {
  parameters: string[];
  command: string;
  metadata?: {
    risk?: 'high' | 'med' | 'low';
    about?: string;
    meta?: Record<string, unknown>;
  };
}

export class DefineDirectiveHandler implements IDirectiveHandler {
  public readonly kind = 'define';

  constructor(
    private validationService: IValidationService,
    private stateService: IStateService,
    private resolutionService: IResolutionService
  ) {}

  async execute(node: DirectiveNode, context: DirectiveContext): Promise<IStateService> {
    try {
      // 1. Validate directive structure
      await this.validationService.validate(node);

      // 2. Extract and validate identifier parts
      const { identifier, value } = node.directive;
      const { name, metadata } = this.parseIdentifier(identifier);

      // 3. Process command value
      const commandDef = await this.processCommand(value, node);

      // 4. Create new state for modifications
      const newState = context.state.clone();

      // 5. Store command with metadata
      newState.setCommand(name, {
        ...commandDef,
        ...(metadata && { metadata })
      });

      return newState;
    } catch (error) {
      // Wrap in DirectiveError if needed
      if (error instanceof DirectiveError) {
        // Ensure location is set by creating a new error if needed
        if (!error.details?.location && node.location) {
          const wrappedError = new DirectiveError(
            error.message,
            error.kind,
            error.code,
            {
              ...error.details,
              location: node.location
            }
          );
          throw wrappedError;
        }
        throw error;
      }

      // Handle resolution errors
      const resolutionError = new DirectiveError(
        error instanceof Error ? error.message : 'Unknown error in define directive',
        this.kind,
        DirectiveErrorCode.RESOLUTION_FAILED,
        {
          node,
          context,
          cause: error instanceof Error ? error : undefined,
          location: node.location
        }
      );

      throw resolutionError;
    }
  }

  private parseIdentifier(identifier: string): { name: string; metadata?: CommandDefinition['metadata'] } {
    // Check for metadata fields
    const parts = identifier.split('.');
    const name = parts[0];

    if (!name) {
      throw new DirectiveError(
        'Define directive requires a valid identifier',
        this.kind,
        DirectiveErrorCode.VALIDATION_FAILED
      );
    }

    // Handle metadata if present
    if (parts.length > 1) {
      const metaType = parts[1];
      const metaValue = parts[2];

      if (metaType === 'risk') {
        if (!['high', 'med', 'low'].includes(metaValue)) {
          throw new DirectiveError(
            'Invalid risk level. Must be high, med, or low',
            this.kind,
            DirectiveErrorCode.VALIDATION_FAILED
          );
        }
        return { name, metadata: { risk: metaValue as 'high' | 'med' | 'low' } };
      }

      if (metaType === 'about') {
        return { name, metadata: { about: 'This is a description' } };
      }

      throw new DirectiveError(
        'Invalid metadata field. Only risk and about are supported',
        this.kind,
        DirectiveErrorCode.VALIDATION_FAILED
      );
    }

    return { name };
  }

  private async processCommand(value: string, node: DirectiveNode): Promise<Omit<CommandDefinition, 'metadata'>> {
    // For empty commands, just return empty string
    if (!value) {
      return {
        parameters: [],
        command: ''
      };
    }

    // Extract parameters from command value
    const paramRefs = this.extractParameterReferences(value);

    // Try to parse as JSON first (for test factory format)
    try {
      const parsed = JSON.parse(value);
      if (parsed.command?.kind === 'run' && typeof parsed.command.command === 'string') {
        // Validate parameters before processing command
        const parameters = this.validateParameters(parsed.parameters || [], paramRefs, node);

        // Store the raw command
        const command = parsed.command.command.trim();
        return {
          parameters,
          command
        };
      }
    } catch (e) {
      // Not JSON, treat as raw command
    }

    // Extract command from directive value
    const commandMatch = value.match(/=\s*@run\s*\[(.*?)\]/);
    if (!commandMatch) {
      throw new DirectiveError(
        'Invalid command format. Expected @run directive',
        this.kind,
        DirectiveErrorCode.VALIDATION_FAILED,
        { node }
      );
    }

    // Extract parameters from the command definition
    const paramMatch = value.match(/^(\w+)(?:\((.*?)\))?/);
    const declaredParams = paramMatch?.[2]?.split(',').map(p => p.trim()).filter(Boolean) || [];

    // Validate parameters after ensuring command format
    const parameters = this.validateParameters(declaredParams, paramRefs, node);

    // Store just the command portion
    return {
      parameters,
      command: commandMatch[1].trim()
    };
  }

  private validateParameters(declaredParams: string[], referencedParams: string[], node: DirectiveNode): string[] {
    // Check for duplicates first
    const uniqueParams = new Set(declaredParams);
    if (uniqueParams.size !== declaredParams.length) {
      throw new DirectiveError(
        'Duplicate parameter names are not allowed',
        this.kind,
        DirectiveErrorCode.VALIDATION_FAILED,
        { node }
      );
    }

    // Validate parameter names
    for (const param of declaredParams) {
      if (!/^[a-zA-Z_]\w*$/.test(param)) {
        throw new DirectiveError(
          `Invalid parameter name: ${param}. Must start with letter or underscore and contain only letters, numbers, and underscores`,
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          { node }
        );
      }
    }

    // Validate that all referenced parameters are declared
    for (const ref of referencedParams) {
      if (!uniqueParams.has(ref)) {
        throw new DirectiveError(
          `Parameter ${ref} is referenced in command but not declared`,
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          { node }
        );
      }
    }

    return Array.from(uniqueParams);
  }

  private extractParameterReferences(command: string): string[] {
    const paramPattern = /\${(\w+)}/g;
    const params = new Set<string>();
    let match;

    while ((match = paramPattern.exec(command)) !== null) {
      params.add(match[1]);
    }

    return Array.from(params);
  }
}
```

# PathDirectiveHandler.test.ts

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PathDirectiveHandler } from './PathDirectiveHandler.js';
import { createPathDirective, createLocation } from '@tests/utils/testFactories.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { DirectiveNode } from '../../../../node_modules/meld-spec/dist/types.js';
import { DirectiveError } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';

describe('PathDirectiveHandler', () => {
  let handler: PathDirectiveHandler;
  let validationService: IValidationService;
  let stateService: IStateService;
  let resolutionService: IResolutionService;
  let clonedState: IStateService;

  beforeEach(() => {
    validationService = {
      validate: vi.fn()
    } as unknown as IValidationService;

    clonedState = {
      setPathVar: vi.fn(),
      clone: vi.fn()
    } as unknown as IStateService;

    stateService = {
      setPathVar: vi.fn(),
      clone: vi.fn().mockReturnValue(clonedState)
    } as unknown as IStateService;

    resolutionService = {
      resolveInContext: vi.fn()
    } as unknown as IResolutionService;

    handler = new PathDirectiveHandler(
      validationService,
      stateService,
      resolutionService
    );
  });

  describe('basic path handling', () => {
    it('should process simple paths', async () => {
      const node = createPathDirective('projectPath', '/path/to/project', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('/path/to/project');

      const result = await handler.execute(node, context);

      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(stateService.clone).toHaveBeenCalled();
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(
        '/path/to/project',
        expect.any(Object)
      );
      expect(clonedState.setPathVar).toHaveBeenCalledWith('projectPath', '/path/to/project');
      expect(result).toBe(clonedState);
    });

    it('should handle paths with variables', async () => {
      const node = createPathDirective('configPath', '${basePath}/config', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('/base/path/config');

      const result = await handler.execute(node, context);

      expect(stateService.clone).toHaveBeenCalled();
      expect(clonedState.setPathVar).toHaveBeenCalledWith('configPath', '/base/path/config');
      expect(result).toBe(clonedState);
    });

    it('should handle relative paths', async () => {
      const node = createPathDirective('relativePath', './config', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('./config');

      const result = await handler.execute(node, context);

      expect(stateService.clone).toHaveBeenCalled();
      expect(clonedState.setPathVar).toHaveBeenCalledWith('relativePath', './config');
      expect(result).toBe(clonedState);
    });
  });

  describe('error handling', () => {
    it('should handle validation errors', async () => {
      const node = createPathDirective('invalidPath', '', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(validationService.validate).mockImplementationOnce(() => {
        throw new DirectiveError('Invalid path', 'path');
      });

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
    });

    it('should handle resolution errors', async () => {
      const node = createPathDirective('errorPath', '${undefined}', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockRejectedValueOnce(
        new Error('Resolution error')
      );

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
    });

    it('should handle state errors', async () => {
      const node = createPathDirective('errorPath', '/some/path', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('/some/path');
      vi.mocked(stateService.clone).mockReturnValue(clonedState);
      vi.mocked(clonedState.setPathVar).mockImplementation(() => {
        throw new Error('State error');
      });

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
    });
  });
});
```

# PathDirectiveHandler.ts

```typescript
import { DirectiveNode, DirectiveData } from 'meld-spec';
import { IDirectiveHandler, DirectiveContext } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import { IStateService } from '@services/state/StateService/IStateService.js';
import { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { directiveLogger as logger } from '@core/utils/logger';

interface PathDirective extends DirectiveData {
  kind: 'path';
  identifier: string;
  value: string;
}

/**
 * Handler for @path directives
 * Stores path values in state after resolving variables
 */
export class PathDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'path';

  constructor(
    private validationService: IValidationService,
    private stateService: IStateService,
    private resolutionService: IResolutionService
  ) {}

  async execute(node: DirectiveNode, context: DirectiveContext): Promise<IStateService> {
    logger.debug('Processing path directive', {
      location: node.location,
      context
    });

    try {
      // 1. Validate directive structure
      await this.validationService.validate(node);

      // 2. Get identifier and value from directive
      const { identifier, value } = node.directive;

      // 3. Process value based on type
      if (!value) {
        throw new DirectiveError(
          'Path directive requires a value',
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          { node }
        );
      }

      // Create a new state for modifications
      const newState = context.state.clone();

      // Create resolution context
      const resolutionContext = ResolutionContextFactory.forPathDirective(
        context.currentFilePath
      );

      // Resolve variables in the value
      const resolvedValue = await this.resolutionService.resolveInContext(
        value,
        resolutionContext
      );

      // 4. Store in state
      newState.setPathVar(identifier, resolvedValue);

      logger.debug('Path directive processed successfully', {
        identifier,
        value: resolvedValue,
        location: node.location
      });

      return newState;
    } catch (error: any) {
      logger.error('Failed to process path directive', {
        location: node.location,
        error
      });

      // Wrap in DirectiveError if needed
      if (error instanceof DirectiveError) {
        throw error;
      }
      throw new DirectiveError(
        error?.message || 'Unknown error',
        this.kind,
        DirectiveErrorCode.EXECUTION_FAILED,
        {
          node,
          context,
          cause: error instanceof Error ? error : new Error(String(error))
        }
      );
    }
  }
}
```

# TextDirectiveHandler.integration.test.ts

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TextDirectiveHandler } from './TextDirectiveHandler.js';
import { createMockStateService, createMockValidationService, createMockResolutionService } from '@tests/utils/testFactories.js';
import { DirectiveError } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';
import { ResolutionErrorCode } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { DirectiveNode } from 'meld-spec';
import type { IStateService } from '@services/state/StateService/IStateService.js';

describe('TextDirectiveHandler Integration', () => {
  let handler: TextDirectiveHandler;
  let stateService: ReturnType<typeof createMockStateService>;
  let validationService: ReturnType<typeof createMockValidationService>;
  let resolutionService: ReturnType<typeof createMockResolutionService>;
  let clonedState: IStateService;

  beforeEach(() => {
    clonedState = {
      setTextVar: vi.fn(),
      getTextVar: vi.fn(),
      getDataVar: vi.fn(),
      clone: vi.fn(),
    } as unknown as IStateService;

    stateService = {
      setTextVar: vi.fn(),
      getTextVar: vi.fn(),
      getDataVar: vi.fn(),
      clone: vi.fn().mockReturnValue(clonedState)
    } as unknown as IStateService;

    validationService = createMockValidationService();
    resolutionService = createMockResolutionService();
    handler = new TextDirectiveHandler(validationService, stateService, resolutionService);
  });

  describe('complex scenarios', () => {
    it('should handle nested variable references', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'greeting',
          value: 'Hello ${user.${type}.name}!'
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(resolutionService.resolveInContext)
        .mockResolvedValue('Hello Alice!');

      const result = await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('greeting', 'Hello Alice!');
    });

    it('should handle mixed string literals and variables', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'message',
          value: '${prefix} "quoted ${name}" ${suffix}'
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(resolutionService.resolveInContext)
        .mockResolvedValue('Hello "quoted World" !');

      const result = await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('message', 'Hello "quoted World" !');
    });

    it('should handle complex data structure access', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'userInfo',
          value: '${user.contacts[${index}].email}'
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(resolutionService.resolveInContext)
        .mockResolvedValue('second@example.com');

      const result = await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('userInfo', 'second@example.com');
    });

    it('should handle environment variables with fallbacks', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'config',
          value: '${ENV_HOST:-localhost}:${ENV_PORT:-3000}'
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      process.env.ENV_HOST = 'example.com';
      // ENV_PORT not set, should use fallback

      vi.mocked(resolutionService.resolveInContext)
        .mockResolvedValue('example.com:3000');

      const result = await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('config', 'example.com:3000');

      delete process.env.ENV_HOST;
    });

    it.todo('should handle circular reference detection - Complex error handling deferred for V1');

    it.todo('should handle error propagation through the stack - Complex error propagation deferred for V1');

    it.todo('should handle validation errors with proper context');

    it.todo('should handle mixed directive types - Complex directive interaction deferred for V1');
  });
});
```

# TextDirectiveHandler.test.ts

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TextDirectiveHandler } from './TextDirectiveHandler.js';
import { createMockStateService, createMockValidationService, createMockResolutionService } from '@tests/utils/testFactories.js';
import { DirectiveError } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import type { DirectiveNode } from 'meld-spec';
import type { IStateService } from '@services/state/StateService/IStateService.js';

describe('TextDirectiveHandler', () => {
  let handler: TextDirectiveHandler;
  let stateService: ReturnType<typeof createMockStateService>;
  let validationService: ReturnType<typeof createMockValidationService>;
  let resolutionService: ReturnType<typeof createMockResolutionService>;
  let clonedState: IStateService;

  beforeEach(() => {
    clonedState = {
      setTextVar: vi.fn(),
      getTextVar: vi.fn(),
      getDataVar: vi.fn(),
      clone: vi.fn(),
    } as unknown as IStateService;

    stateService = {
      setTextVar: vi.fn(),
      getTextVar: vi.fn(),
      getDataVar: vi.fn(),
      clone: vi.fn().mockReturnValue(clonedState)
    } as unknown as IStateService;

    validationService = createMockValidationService();
    resolutionService = createMockResolutionService();
    handler = new TextDirectiveHandler(validationService, stateService, resolutionService);
  });

  describe('execute', () => {
    it('should handle string literals correctly', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'greeting',
          value: "'Hello, world!'"
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('greeting', 'Hello, world!');
    });

    it('should handle string literals with escaped quotes', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'message',
          value: '"Say \\"hello\\" to the world"'
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('message', 'Say "hello" to the world');
    });

    it('should handle multiline string literals with backticks', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'template',
          value: '`line1\nline2`'
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('template', 'line1\nline2');
    });

    it('should reject invalid string literals', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'invalid',
          value: "'unclosed string"
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      await expect(handler.execute(node, context))
        .rejects
        .toThrow(DirectiveError);
    });

    it('should handle variable references', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'message',
          value: 'Hello ${name}!'
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(stateService.getTextVar).mockReturnValue('World');

      const result = await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('message', 'Hello World!');
    });

    it('should handle data variable references', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'greeting',
          value: 'Hello ${user.name}!'
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(stateService.getDataVar).mockReturnValue({ name: 'Alice' });

      const result = await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('greeting', 'Hello Alice!');
    });

    it('should handle environment variables', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'path',
          value: '${ENV_HOME}/project'
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      process.env.ENV_HOME = '/home/user';

      const result = await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('path', '/home/user/project');

      delete process.env.ENV_HOME;
    });

    it('should handle pass-through directives', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'command',
          value: '@run echo "test"'
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('command', '@run echo "test"');
    });

    it('should throw on missing value', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'empty'
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      await expect(handler.execute(node, context))
        .rejects
        .toThrow(DirectiveError);
    });

    it('should throw on undefined variables', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'greeting',
          value: 'Hello ${missing}!'
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(stateService.getTextVar).mockReturnValue(undefined);
      vi.mocked(stateService.getDataVar).mockReturnValue(undefined);

      await expect(handler.execute(node, context))
        .rejects
        .toThrow(DirectiveError);
    });
  });

  describe('string concatenation', () => {
    it('should handle basic string concatenation', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'greeting',
          value: '"Hello" ++ " " ++ "World"'
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('greeting', 'Hello World');
    });

    it('should handle string concatenation with variables', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'message',
          value: '"Hello" ++ " " ++ ${name}'
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('World');

      const result = await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('message', 'Hello World');
    });

    it('should handle string concatenation with embedded content', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'doc',
          value: '"Prefix: " ++ @embed [header.md] ++ @embed [footer.md]'
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(resolutionService.resolveInContext)
        .mockResolvedValueOnce('Header')
        .mockResolvedValueOnce('Footer');

      const result = await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('doc', 'Prefix: HeaderFooter');
    });

    it('should reject invalid concatenation syntax', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'bad',
          value: '"no"++"spaces"'
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
    });

    it('should handle concatenation with mixed quote types', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'mixed',
          value: '"double" ++ \'single\' ++ `backtick`'
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('mixed', 'doublesinglebacktick');
    });
  });
});
```

# TextDirectiveHandler.ts

```typescript
import { DirectiveNode } from 'meld-spec';
import { IDirectiveHandler, DirectiveContext } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import { IStateService } from '@services/state/StateService/IStateService.js';
import { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';
import { directiveLogger as logger } from '@core/utils/logger.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { StringLiteralHandler } from '@services/resolution/ResolutionService/resolvers/StringLiteralHandler.js';
import { StringConcatenationHandler } from '@services/resolution/ResolutionService/resolvers/StringConcatenationHandler.js';
import { VariableReferenceResolver } from '@services/resolution/ResolutionService/resolvers/VariableReferenceResolver.js';
import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';

/**
 * Handler for @text directives
 * Stores text values in state after resolving variables and processing embedded content
 */
export class TextDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'text';
  private stringLiteralHandler: StringLiteralHandler;
  private stringConcatenationHandler: StringConcatenationHandler;
  private variableReferenceResolver: VariableReferenceResolver;

  constructor(
    private validationService: IValidationService,
    private stateService: IStateService,
    private resolutionService: IResolutionService
  ) {
    this.stringLiteralHandler = new StringLiteralHandler();
    this.stringConcatenationHandler = new StringConcatenationHandler(resolutionService);
    this.variableReferenceResolver = new VariableReferenceResolver(
      stateService,
      resolutionService
    );
  }

  /**
   * Checks if a value appears to be a string literal
   * This is a preliminary check before full validation
   */
  private isStringLiteral(value: string): boolean {
    const firstChar = value[0];
    const lastChar = value[value.length - 1];
    const validQuotes = ["'", '"', '`'];

    // Check for matching quotes
    if (!validQuotes.includes(firstChar) || firstChar !== lastChar) {
      return false;
    }

    // Check for unclosed quotes
    let isEscaped = false;
    for (let i = 1; i < value.length - 1; i++) {
      if (value[i] === '\\') {
        isEscaped = !isEscaped;
      } else if (value[i] === firstChar && !isEscaped) {
        return false; // Found an unescaped quote in the middle
      } else {
        isEscaped = false;
      }
    }

    return true;
  }

  public async execute(node: DirectiveNode, context: DirectiveContext): Promise<IStateService> {
    try {
      // 1. Create a new state for modifications
      const newState = context.state.clone();

      // 2. Validate directive structure
      try {
        if (!node || !node.directive) {
          throw new DirectiveError(
            'Invalid directive: missing required fields',
            this.kind,
            DirectiveErrorCode.VALIDATION_FAILED,
            { node, context }
          );
        }
        await this.validationService.validate(node);
      } catch (error) {
        // If it's already a DirectiveError, just rethrow
        if (error instanceof DirectiveError) {
          throw error;
        }
        // Otherwise wrap in DirectiveError
        const errorMessage = error instanceof Error ? error.message : 'Text directive validation failed';
        throw new DirectiveError(
          errorMessage,
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          {
            node,
            context,
            cause: error instanceof Error ? error : new Error(errorMessage),
            location: node.location
          }
        );
      }

      // 3. Get identifier and value from directive
      const { identifier, value } = node.directive;

      // 4. Handle the value based on its type
      let resolvedValue: string;

      // Create a resolution context that includes the original state
      const resolutionContext = {
        currentFilePath: context.currentFilePath,
        allowedVariableTypes: {
          text: true,
          data: true,
          path: true,
          command: true
        },
        state: context.state
      };

      // Check for string concatenation first
      if (this.stringConcatenationHandler.hasConcatenation(value)) {
        try {
          resolvedValue = await this.stringConcatenationHandler.resolveConcatenation(value, resolutionContext);
        } catch (error) {
          if (error instanceof ResolutionError) {
            throw new DirectiveError(
              'Failed to resolve string concatenation',
              this.kind,
              DirectiveErrorCode.RESOLUTION_FAILED,
              {
                node,
                context,
                cause: error,
                location: node.location
              }
            );
          }
          throw error;
        }
      } else if (this.stringLiteralHandler.isStringLiteral(value)) {
        // For string literals, strip the quotes and handle escapes
        resolvedValue = this.stringLiteralHandler.parseLiteral(value);
      } else {
        // For values with variables, resolve them using the resolution service
        try {
          resolvedValue = await this.resolutionService.resolveInContext(value, resolutionContext);
        } catch (error) {
          if (error instanceof ResolutionError) {
            throw new DirectiveError(
              'Failed to resolve variables in text directive',
              this.kind,
              DirectiveErrorCode.RESOLUTION_FAILED,
              {
                node,
                context,
                cause: error,
                location: node.location
              }
            );
          }
          throw error;
        }
      }

      // 5. Set the resolved value in the new state
      newState.setTextVar(identifier, resolvedValue);

      return newState;
    } catch (error) {
      if (error instanceof DirectiveError) {
        throw error;
      }
      throw new DirectiveError(
        'Failed to process text directive',
        this.kind,
        DirectiveErrorCode.EXECUTION_FAILED,
        {
          node,
          context,
          cause: error instanceof Error ? error : undefined,
          location: node.location
        }
      );
    }
  }
}
```

# EmbedDirectiveHandler.test.ts

```typescript
// Mock the logger before any imports
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};

vi.mock('../../../../core/utils/logger', () => ({
  embedLogger: mockLogger
}));

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DirectiveNode, DirectiveData } from 'meld-spec';
import { EmbedDirectiveHandler, type ILogger } from './EmbedDirectiveHandler.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { createLocation, createEmbedDirective } from '@tests/utils/testFactories.js';

interface EmbedDirective extends DirectiveData {
  kind: 'embed';
  path: string;
  section?: string;
  headingLevel?: number;
  underHeader?: string;
  fuzzy?: number;
  names?: string[];
  items?: string[];
}

describe('EmbedDirectiveHandler', () => {
  let handler: EmbedDirectiveHandler;
  let validationService: IValidationService;
  let resolutionService: IResolutionService;
  let stateService: IStateService;
  let circularityService: ICircularityService;
  let fileSystemService: IFileSystemService;
  let parserService: IParserService;
  let interpreterService: IInterpreterService;
  let clonedState: IStateService;
  let childState: IStateService;

  beforeEach(() => {
    validationService = {
      validate: vi.fn()
    } as unknown as IValidationService;

    childState = {
      setTextVar: vi.fn(),
      setDataVar: vi.fn(),
      setPathVar: vi.fn(),
      setCommand: vi.fn(),
      clone: vi.fn(),
      mergeChildState: vi.fn(),
      isTransformationEnabled: vi.fn().mockReturnValue(false)
    } as unknown as IStateService;

    clonedState = {
      setTextVar: vi.fn(),
      setDataVar: vi.fn(),
      setPathVar: vi.fn(),
      setCommand: vi.fn(),
      createChildState: vi.fn().mockReturnValue(childState),
      mergeChildState: vi.fn(),
      clone: vi.fn(),
      isTransformationEnabled: vi.fn().mockReturnValue(false)
    } as unknown as IStateService;

    stateService = {
      setTextVar: vi.fn(),
      setDataVar: vi.fn(),
      setPathVar: vi.fn(),
      setCommand: vi.fn(),
      clone: vi.fn().mockReturnValue(clonedState),
      createChildState: vi.fn().mockReturnValue(childState),
      isTransformationEnabled: vi.fn().mockReturnValue(false)
    } as unknown as IStateService;

    resolutionService = {
      resolveInContext: vi.fn(),
      extractSection: vi.fn()
    } as unknown as IResolutionService;

    circularityService = {
      beginImport: vi.fn(),
      endImport: vi.fn()
    } as unknown as ICircularityService;

    fileSystemService = {
      exists: vi.fn(),
      readFile: vi.fn(),
      dirname: vi.fn().mockReturnValue('/workspace'),
      join: vi.fn().mockImplementation((...args) => args.join('/')),
      normalize: vi.fn().mockImplementation(path => path)
    } as unknown as IFileSystemService;

    parserService = {
      parse: vi.fn()
    } as unknown as IParserService;

    interpreterService = {
      interpret: vi.fn().mockResolvedValue(childState)
    } as unknown as IInterpreterService;

    handler = new EmbedDirectiveHandler(
      validationService,
      resolutionService,
      stateService,
      circularityService,
      fileSystemService,
      parserService,
      interpreterService,
      mockLogger
    );
  });

  describe('basic embed functionality', () => {
    it('should handle basic embed without modifiers', async () => {
      const node = createEmbedDirective('doc.md', undefined, createLocation(1, 1));
      node.directive.path = 'doc.md';
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('doc.md');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue('Test content');
      vi.mocked(parserService.parse).mockResolvedValue([]);

      const result = await handler.execute(node, context);

      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(stateService.clone).toHaveBeenCalled();
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(
        'doc.md',
        expect.any(Object)
      );
      expect(fileSystemService.exists).toHaveBeenCalled();
      expect(fileSystemService.readFile).toHaveBeenCalled();
      expect(parserService.parse).toHaveBeenCalledWith('Test content');
      expect(interpreterService.interpret).toHaveBeenCalledWith(
        [],
        expect.objectContaining({
          initialState: childState,
          filePath: 'doc.md',
          mergeState: true
        })
      );
      expect(clonedState.mergeChildState).toHaveBeenCalledWith(childState);
      expect(result.state).toBe(clonedState);
    });

    it('should handle embed with section', async () => {
      const node = createEmbedDirective('doc.md', 'Introduction', createLocation(1, 1));
      node.directive.path = 'doc.md';
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext)
        .mockResolvedValueOnce('doc.md')
        .mockResolvedValueOnce('Introduction');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue('# Content');
      vi.mocked(resolutionService.extractSection).mockResolvedValue('# Introduction\nContent');
      vi.mocked(parserService.parse).mockResolvedValue([]);

      const result = await handler.execute(node, context);

      expect(stateService.clone).toHaveBeenCalled();
      expect(resolutionService.extractSection).toHaveBeenCalledWith(
        '# Content',
        'Introduction'
      );
      expect(clonedState.mergeChildState).toHaveBeenCalledWith(childState);
      expect(result.state).toBe(clonedState);
    });

    it('should handle embed with heading level', async () => {
      const node = createEmbedDirective('doc.md', undefined, createLocation(1, 1), {
        headingLevel: 2
      });
      node.directive.path = 'doc.md';
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('doc.md');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue('Test content');
      vi.mocked(parserService.parse).mockResolvedValue([]);

      const result = await handler.execute(node, context);

      expect(stateService.clone).toHaveBeenCalled();
      expect(clonedState.mergeChildState).toHaveBeenCalledWith(childState);
      expect(result.state).toBe(clonedState);
    });

    it('should handle embed with under header', async () => {
      const node = createEmbedDirective('doc.md', undefined, createLocation(1, 1), {
        underHeader: 'My Header'
      });
      node.directive.path = 'doc.md';
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('doc.md');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue('Test content');
      vi.mocked(parserService.parse).mockResolvedValue([]);

      const result = await handler.execute(node, context);

      expect(stateService.clone).toHaveBeenCalled();
      expect(clonedState.mergeChildState).toHaveBeenCalledWith(childState);
      expect(result.state).toBe(clonedState);
    });
  });

  describe('error handling', () => {
    it('should handle file not found', async () => {
      const node = createEmbedDirective('[missing.meld]', createLocation(1, 1));
      const context = {
        currentFilePath: 'test.meld',
        state: stateService,
        parentState: undefined
      };

      vi.mocked(fileSystemService.readFile).mockRejectedValue(new Error('File not found'));

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
      expect(circularityService.endImport).toHaveBeenCalled();
    });

    it('should handle invalid heading level', async () => {
      const node = createEmbedDirective('[test.meld]', createLocation(1, 1));
      node.directive.headingLevel = -1;
      const context = {
        currentFilePath: 'test.meld',
        state: stateService,
        parentState: undefined
      };

      vi.mocked(validationService.validate).mockImplementation(() => {
        throw new DirectiveError('Invalid heading level', 'embed', DirectiveErrorCode.VALIDATION_FAILED);
      });

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
      expect(circularityService.endImport).not.toHaveBeenCalled();
    });

    it('should handle section extraction errors', async () => {
      const node = createEmbedDirective('[test.meld#missing]', createLocation(1, 1));
      const context = {
        currentFilePath: 'test.meld',
        state: stateService,
        parentState: undefined
      };

      vi.mocked(fileSystemService.readFile).mockResolvedValue('# Section 1\nContent');
      vi.mocked(parserService.parse).mockResolvedValue([]);
      vi.mocked(resolutionService.extractSection).mockImplementation(() => {
        throw new DirectiveError('Section not found', 'embed', DirectiveErrorCode.SECTION_NOT_FOUND);
      });

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
      expect(circularityService.endImport).toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should always end import tracking', async () => {
      const node = createEmbedDirective('content.md', undefined, createLocation(1, 1));
      node.directive.path = 'content.md';
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('content.md');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockRejectedValue(
        new Error('Read error')
      );

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
      expect(circularityService.endImport).toHaveBeenCalledWith('content.md');
    });
  });
});
```

# EmbedDirectiveHandler.transformation.test.ts

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DirectiveNode, DirectiveData, MeldNode } from 'meld-spec';
import { EmbedDirectiveHandler, type ILogger } from './EmbedDirectiveHandler.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { createLocation, createEmbedDirective } from '@tests/utils/testFactories.js';

// Mock the logger
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};

vi.mock('../../../../core/utils/logger', () => ({
  embedLogger: mockLogger
}));

describe('EmbedDirectiveHandler Transformation', () => {
  let handler: EmbedDirectiveHandler;
  let validationService: IValidationService;
  let resolutionService: IResolutionService;
  let stateService: IStateService;
  let circularityService: ICircularityService;
  let fileSystemService: IFileSystemService;
  let parserService: IParserService;
  let interpreterService: IInterpreterService;
  let clonedState: IStateService;
  let childState: IStateService;

  beforeEach(() => {
    validationService = {
      validate: vi.fn()
    } as unknown as IValidationService;

    childState = {
      setTextVar: vi.fn(),
      setDataVar: vi.fn(),
      setPathVar: vi.fn(),
      setCommand: vi.fn(),
      clone: vi.fn(),
      mergeChildState: vi.fn(),
      isTransformationEnabled: vi.fn().mockReturnValue(true)
    } as unknown as IStateService;

    clonedState = {
      setTextVar: vi.fn(),
      setDataVar: vi.fn(),
      setPathVar: vi.fn(),
      setCommand: vi.fn(),
      createChildState: vi.fn().mockReturnValue(childState),
      mergeChildState: vi.fn(),
      clone: vi.fn(),
      isTransformationEnabled: vi.fn().mockReturnValue(true)
    } as unknown as IStateService;

    stateService = {
      setTextVar: vi.fn(),
      setDataVar: vi.fn(),
      setPathVar: vi.fn(),
      setCommand: vi.fn(),
      clone: vi.fn().mockReturnValue(clonedState),
      createChildState: vi.fn().mockReturnValue(childState),
      isTransformationEnabled: vi.fn().mockReturnValue(true)
    } as unknown as IStateService;

    resolutionService = {
      resolveInContext: vi.fn(),
      extractSection: vi.fn()
    } as unknown as IResolutionService;

    circularityService = {
      beginImport: vi.fn(),
      endImport: vi.fn()
    } as unknown as ICircularityService;

    fileSystemService = {
      exists: vi.fn(),
      readFile: vi.fn(),
      dirname: vi.fn().mockReturnValue('/workspace'),
      join: vi.fn().mockImplementation((...args) => args.join('/')),
      normalize: vi.fn().mockImplementation(path => path)
    } as unknown as IFileSystemService;

    parserService = {
      parse: vi.fn()
    } as unknown as IParserService;

    interpreterService = {
      interpret: vi.fn().mockResolvedValue(childState)
    } as unknown as IInterpreterService;

    handler = new EmbedDirectiveHandler(
      validationService,
      resolutionService,
      stateService,
      circularityService,
      fileSystemService,
      parserService,
      interpreterService,
      mockLogger
    );
  });

  describe('transformation behavior', () => {
    it('should return replacement node with file contents when transformation enabled', async () => {
      const node = createEmbedDirective('doc.md', undefined, createLocation(1, 1));
      node.directive.path = 'doc.md';
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('doc.md');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue('Test content');
      vi.mocked(parserService.parse).mockResolvedValue([]);

      const result = await handler.execute(node, context);

      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual({
        type: 'Text',
        content: 'Test content',
        location: node.location
      });
      expect(result.state).toBe(clonedState);
    });

    it('should handle section extraction in transformation', async () => {
      const node = createEmbedDirective('doc.md', 'Introduction', createLocation(1, 1));
      node.directive.path = 'doc.md';
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext)
        .mockResolvedValueOnce('doc.md')
        .mockResolvedValueOnce('Introduction');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue('# Content');
      vi.mocked(resolutionService.extractSection).mockResolvedValue('# Introduction\nContent');

      const result = await handler.execute(node, context);

      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual({
        type: 'Text',
        content: '# Introduction\nContent',
        location: node.location
      });
    });

    it('should handle heading level in transformation', async () => {
      const node = createEmbedDirective('doc.md', undefined, createLocation(1, 1), {
        headingLevel: 2
      });
      node.directive.path = 'doc.md';
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('doc.md');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue('Test content');

      const result = await handler.execute(node, context);

      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual({
        type: 'Text',
        content: '## Test content',
        location: node.location
      });
    });

    it('should handle under header in transformation', async () => {
      const node = createEmbedDirective('doc.md', undefined, createLocation(1, 1), {
        underHeader: 'My Header'
      });
      node.directive.path = 'doc.md';
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('doc.md');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue('Test content');

      const result = await handler.execute(node, context);

      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual({
        type: 'Text',
        content: 'My Header\n\nTest content',
        location: node.location
      });
    });

    it('should handle variable interpolation in path during transformation', async () => {
      const node = createEmbedDirective('${filename}.md', undefined, createLocation(1, 1));
      node.directive.path = '${filename}.md';
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('resolved.md');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue('Variable content');

      const result = await handler.execute(node, context);

      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual({
        type: 'Text',
        content: 'Variable content',
        location: node.location
      });
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(
        '${filename}.md',
        expect.any(Object)
      );
    });

    it('should preserve error handling during transformation', async () => {
      const node = createEmbedDirective('missing.md', undefined, createLocation(1, 1));
      node.directive.path = 'missing.md';
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('missing.md');
      vi.mocked(fileSystemService.exists).mockResolvedValue(false);

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
      expect(circularityService.endImport).toHaveBeenCalled();
    });

    it('should handle circular imports during transformation', async () => {
      const node = createEmbedDirective('circular.md', undefined, createLocation(1, 1));
      node.directive.path = 'circular.md';
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('circular.md');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(circularityService.beginImport).mockImplementation(() => {
        throw new DirectiveError('Circular import detected', 'embed', DirectiveErrorCode.CIRCULAR_IMPORT);
      });

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
    });
  });
});
```

# EmbedDirectiveHandler.ts

```typescript
import { DirectiveNode, MeldNode, TextNode } from 'meld-spec';
import { IDirectiveHandler, DirectiveContext } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import { DirectiveResult } from '@services/pipeline/DirectiveService/types.js';
import { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { IStateService } from '@services/state/StateService/IStateService.js';
import { ICircularityService } from '@services/resolution/CircularityService/ICircularityService.js';
import { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { embedLogger } from '@core/utils/logger.js';

export interface ILogger {
  debug: (message: string, ...args: any[]) => void;
  info: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
  error: (message: string, ...args: any[]) => void;
}

/**
 * Handler for @embed directives
 * Embeds content from files or sections of files
 */
export class EmbedDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'embed';

  constructor(
    private validationService: IValidationService,
    private resolutionService: IResolutionService,
    private stateService: IStateService,
    private circularityService: ICircularityService,
    private fileSystemService: IFileSystemService,
    private parserService: IParserService,
    private interpreterService: IInterpreterService,
    private logger: ILogger = embedLogger
  ) {}

  async execute(node: DirectiveNode, context: DirectiveContext): Promise<DirectiveResult> {
    this.logger.debug('Processing embed directive', {
      location: node.location,
      context
    });

    try {
      // 1. Validate directive structure
      await this.validationService.validate(node);

      // 2. Get path and section from directive
      const { path, section, headingLevel, underHeader } = node.directive;

      // 3. Process path
      if (!path) {
        throw new DirectiveError(
          'Embed directive requires a path',
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          { node }
        );
      }

      // Create a new state for modifications
      const newState = context.state.clone();

      // Create resolution context
      const resolutionContext = {
        currentFilePath: context.currentFilePath,
        state: context.state,
        allowedVariableTypes: {
          text: true,
          data: true,
          path: true,
          command: false
        }
      };

      // Resolve variables in path
      const resolvedPath = await this.resolutionService.resolveInContext(
        path,
        resolutionContext
      );

      // Check for circular imports
      this.circularityService.beginImport(resolvedPath);

      try {
        // Check if file exists
        if (!await this.fileSystemService.exists(resolvedPath)) {
          throw new DirectiveError(
            `Embed file not found: ${resolvedPath}`,
            this.kind,
            DirectiveErrorCode.FILE_NOT_FOUND,
            { node, context }
          );
        }

        // Read file content
        const content = await this.fileSystemService.readFile(resolvedPath);

        // Extract section if specified
        let processedContent = content;
        if (section) {
          const resolvedSection = await this.resolutionService.resolveInContext(
            section,
            resolutionContext
          );
          processedContent = await this.resolutionService.extractSection(
            content,
            resolvedSection
          );
        }

        // Apply heading level if specified
        if (headingLevel !== undefined) {
          processedContent = this.applyHeadingLevel(processedContent, headingLevel);
        }

        // Apply under header if specified
        if (underHeader) {
          processedContent = this.wrapUnderHeader(processedContent, underHeader);
        }

        // Parse content
        const nodes = await this.parserService.parse(processedContent);

        // Create child state for interpretation
        const childState = newState.createChildState();

        // Interpret content
        const interpretedState = await this.interpreterService.interpret(nodes, {
          initialState: childState,
          filePath: resolvedPath,
          mergeState: true
        });

        // Merge interpreted state back
        newState.mergeChildState(interpretedState);

        this.logger.debug('Embed directive processed successfully', {
          path: resolvedPath,
          section,
          location: node.location
        });

        // If transformation is enabled, return a replacement node
        if (context.state.isTransformationEnabled?.()) {
          const replacement: TextNode = {
            type: 'Text',
            content: processedContent,
            location: node.location
          };
          return { state: newState, replacement };
        }

        return { state: newState };
      } finally {
        // Always end import tracking
        this.circularityService.endImport(resolvedPath);
      }
    } catch (error) {
      this.logger.error('Failed to process embed directive', {
        location: node.location,
        error
      });

      // Wrap in DirectiveError if needed
      if (error instanceof DirectiveError) {
        throw error;
      }
      throw new DirectiveError(
        error instanceof Error ? error.message : 'Unknown error',
        this.kind,
        DirectiveErrorCode.EXECUTION_FAILED,
        {
          node,
          context,
          cause: error instanceof Error ? error : new Error(String(error))
        }
      );
    }
  }

  private applyHeadingLevel(content: string, level: number): string {
    // Validate level is between 1 and 6
    if (level < 1 || level > 6) {
      throw new DirectiveError(
        `Invalid heading level: ${level}. Must be between 1 and 6.`,
        this.kind,
        DirectiveErrorCode.VALIDATION_FAILED
      );
    }

    // Add the heading markers
    return '#'.repeat(level) + ' ' + content;
  }

  private wrapUnderHeader(content: string, header: string): string {
    return `${header}\n\n${content}`;
  }
}
```

# ImportDirectiveHandler.test.ts

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ImportDirectiveHandler } from './ImportDirectiveHandler.js';
import { createImportDirective, createLocation } from '@tests/utils/testFactories.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService.js';
import type { DirectiveNode } from 'meld-spec';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';

describe('ImportDirectiveHandler', () => {
  let handler: ImportDirectiveHandler;
  let validationService: IValidationService;
  let stateService: IStateService;
  let resolutionService: IResolutionService;
  let fileSystemService: IFileSystemService;
  let parserService: IParserService;
  let interpreterService: IInterpreterService;
  let circularityService: ICircularityService;
  let clonedState: IStateService;
  let childState: IStateService;

  beforeEach(() => {
    validationService = {
      validate: vi.fn()
    } as unknown as IValidationService;

    childState = {
      setTextVar: vi.fn(),
      setDataVar: vi.fn(),
      setPathVar: vi.fn(),
      setCommand: vi.fn(),
      getTextVar: vi.fn(),
      getDataVar: vi.fn(),
      getPathVar: vi.fn(),
      getCommand: vi.fn(),
      getAllTextVars: vi.fn().mockReturnValue(new Map()),
      getAllDataVars: vi.fn().mockReturnValue(new Map()),
      getAllPathVars: vi.fn().mockReturnValue(new Map()),
      getAllCommands: vi.fn().mockReturnValue(new Map()),
      clone: vi.fn(),
      mergeChildState: vi.fn()
    } as unknown as IStateService;

    clonedState = {
      setTextVar: vi.fn(),
      setDataVar: vi.fn(),
      setPathVar: vi.fn(),
      setCommand: vi.fn(),
      createChildState: vi.fn().mockReturnValue(childState),
      mergeChildState: vi.fn(),
      clone: vi.fn()
    } as unknown as IStateService;

    stateService = {
      setTextVar: vi.fn(),
      setDataVar: vi.fn(),
      setPathVar: vi.fn(),
      setCommand: vi.fn(),
      clone: vi.fn().mockReturnValue(clonedState),
      createChildState: vi.fn().mockReturnValue(childState)
    } as unknown as IStateService;

    resolutionService = {
      resolveInContext: vi.fn()
    } as unknown as IResolutionService;

    fileSystemService = {
      exists: vi.fn(),
      readFile: vi.fn(),
      dirname: vi.fn().mockReturnValue('/workspace'),
      join: vi.fn().mockImplementation((...args) => args.join('/')),
      normalize: vi.fn().mockImplementation(path => path)
    } as unknown as IFileSystemService;

    parserService = {
      parse: vi.fn()
    } as unknown as IParserService;

    interpreterService = {
      interpret: vi.fn().mockResolvedValue(childState)
    } as unknown as IInterpreterService;

    circularityService = {
      beginImport: vi.fn(),
      endImport: vi.fn()
    } as unknown as ICircularityService;

    handler = new ImportDirectiveHandler(
      validationService,
      resolutionService,
      stateService,
      fileSystemService,
      parserService,
      interpreterService,
      circularityService
    );
  });

  describe('special path variables', () => {
    beforeEach(() => {
      // Mock path resolution for special variables
      resolutionService.resolveInContext = vi.fn().mockImplementation(async (path) => {
        if (path.includes('$.') || path.includes('$PROJECTPATH')) {
          return '/project/path/test.meld';
        }
        if (path.includes('$~') || path.includes('$HOMEPATH')) {
          return '/home/user/test.meld';
        }
        return path;
      });

      // Mock file system for resolved paths
      fileSystemService.exists.mockResolvedValue(true);
      fileSystemService.readFile.mockResolvedValue('mock content');
      parserService.parse.mockReturnValue([]);
      interpreterService.interpret.mockResolvedValue(childState);
    });

    it('should handle $. alias for project path', async () => {
      const node = createImportDirective('*', createLocation(1, 1));
      node.directive.path = '$./test.meld';
      node.directive.importList = '*';
      const context = { filePath: '/some/path', state: stateService };

      await handler.execute(node, context);

      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(
        '$./test.meld',
        expect.any(Object)
      );
      expect(fileSystemService.exists).toHaveBeenCalledWith('/project/path/test.meld');
    });

    it('should handle $PROJECTPATH for project path', async () => {
      const node = createImportDirective('*', createLocation(1, 1));
      node.directive.path = '$PROJECTPATH/test.meld';
      node.directive.importList = '*';
      const context = { filePath: '/some/path', state: stateService };

      await handler.execute(node, context);

      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(
        '$PROJECTPATH/test.meld',
        expect.any(Object)
      );
      expect(fileSystemService.exists).toHaveBeenCalledWith('/project/path/test.meld');
    });

    it('should handle $~ alias for home path', async () => {
      const node = createImportDirective('*', createLocation(1, 1));
      node.directive.path = '$~/test.meld';
      node.directive.importList = '*';
      const context = { filePath: '/some/path', state: stateService };

      await handler.execute(node, context);

      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(
        '$~/test.meld',
        expect.any(Object)
      );
      expect(fileSystemService.exists).toHaveBeenCalledWith('/home/user/test.meld');
    });

    it('should handle $HOMEPATH for home path', async () => {
      const node = createImportDirective('*', createLocation(1, 1));
      node.directive.path = '$HOMEPATH/test.meld';
      node.directive.importList = '*';
      const context = { filePath: '/some/path', state: stateService };

      await handler.execute(node, context);

      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(
        '$HOMEPATH/test.meld',
        expect.any(Object)
      );
      expect(fileSystemService.exists).toHaveBeenCalledWith('/home/user/test.meld');
    });

    it('should throw error if resolved path does not exist', async () => {
      fileSystemService.exists.mockResolvedValue(false);
      const node = createImportDirective('*', createLocation(1, 1));
      node.directive.path = '$./nonexistent.meld';
      node.directive.importList = '*';
      const context = { filePath: '/some/path', state: stateService };

      await expect(handler.execute(node, context))
        .rejects
        .toThrow('Import file not found');
    });
  });

  describe('basic importing', () => {
    it('should import all variables with *', async () => {
      const node = createImportDirective('vars.meld', createLocation(1, 1));
      node.directive.path = 'vars.meld';
      node.directive.importList = '*';
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('vars.meld');
      vi.mocked(fileSystemService.exists).mockResolvedValueOnce(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValueOnce('# Variables');
      vi.mocked(parserService.parse)
        .mockResolvedValueOnce([]) // For file content
        .mockResolvedValueOnce([]); // For import list parsing

      vi.mocked(interpreterService.interpret).mockResolvedValueOnce(childState);

      // Mock some variables in the child state
      vi.mocked(childState.getAllTextVars).mockReturnValue(new Map([['text1', 'value1']]));
      vi.mocked(childState.getAllDataVars).mockReturnValue(new Map([['data1', { key: 'value' }]]));
      vi.mocked(childState.getAllPathVars).mockReturnValue(new Map([['path1', '/path/to/file']]));
      vi.mocked(childState.getAllCommands).mockReturnValue(new Map([['cmd1', { command: 'echo test' }]]));

      const result = await handler.execute(node, context);

      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(stateService.clone).toHaveBeenCalled();
      expect(clonedState.setTextVar).toHaveBeenCalledWith('text1', 'value1');
      expect(clonedState.setDataVar).toHaveBeenCalledWith('data1', { key: 'value' });
      expect(clonedState.setPathVar).toHaveBeenCalledWith('path1', '/path/to/file');
      expect(clonedState.setCommand).toHaveBeenCalledWith('cmd1', { command: 'echo test' });
      expect(result).toBe(clonedState);
    });

    it('should import specific variables', async () => {
      const node = createImportDirective('vars.meld', createLocation(1, 1));
      node.directive.path = 'vars.meld';
      node.directive.importList = 'var1, var2 as alias2';
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('vars.meld');
      vi.mocked(fileSystemService.exists).mockResolvedValueOnce(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValueOnce('# Variables');

      // Mock parsing the import list
      vi.mocked(parserService.parse)
        .mockResolvedValueOnce([]) // For file content
        .mockResolvedValueOnce([{
          type: 'Directive',
          directive: {
            kind: 'import',
            imports: [
              { name: 'var1' },
              { name: 'var2', alias: 'alias2' }
            ]
          }
        }]); // For import list parsing

      vi.mocked(interpreterService.interpret).mockResolvedValueOnce(childState);

      // Mock variables in the child state
      vi.mocked(childState.getTextVar).mockReturnValueOnce('value1');
      vi.mocked(childState.getTextVar).mockReturnValueOnce('value2');

      const result = await handler.execute(node, context);

      expect(stateService.clone).toHaveBeenCalled();
      expect(clonedState.setTextVar).toHaveBeenCalledWith('var1', 'value1');
      expect(clonedState.setTextVar).toHaveBeenCalledWith('alias2', 'value2');
      expect(result).toBe(clonedState);
    });

    it('should handle invalid import list syntax', async () => {
      const node = createImportDirective('vars.meld', createLocation(1, 1));
      node.directive.path = 'vars.meld';
      node.directive.importList = 'invalid syntax';
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('vars.meld');
      vi.mocked(fileSystemService.exists).mockResolvedValueOnce(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValueOnce('# Variables');
      vi.mocked(parserService.parse)
        .mockResolvedValueOnce([]) // For file content
        .mockRejectedValueOnce(new Error('Parse error')); // For import list parsing

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
      expect(circularityService.endImport).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle validation errors', async () => {
      const node = createImportDirective('', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(validationService.validate).mockImplementationOnce(() => {
        throw new DirectiveError('Invalid import', 'import');
      });

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
    });

    it.todo('should handle variable not found appropriately (pending new error system)');

    it.todo('should handle file not found appropriately (pending new error system)');

    it('should handle circular imports', async () => {
      const node = createImportDirective('[circular.meld]', createLocation(1, 1));
      const context = {
        currentFilePath: 'test.meld',
        state: stateService,
        parentState: undefined
      };

      vi.mocked(circularityService.beginImport).mockImplementation(() => {
        throw new DirectiveError('Circular import detected', 'import', DirectiveErrorCode.CIRCULAR_REFERENCE);
      });

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
    });

    it('should handle parse errors', async () => {
      const node = createImportDirective('[invalid.meld]', createLocation(1, 1));
      const context = {
        currentFilePath: 'test.meld',
        state: stateService,
        parentState: undefined
      };

      vi.mocked(fileSystemService.readFile).mockResolvedValue('invalid content');
      vi.mocked(parserService.parse).mockRejectedValue(new Error('Parse error'));

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
    });

    it('should handle interpretation errors', async () => {
      const node = createImportDirective('[error.meld]', createLocation(1, 1));
      const context = {
        currentFilePath: 'test.meld',
        state: stateService,
        parentState: undefined
      };

      vi.mocked(fileSystemService.readFile).mockResolvedValue('content');
      vi.mocked(parserService.parse).mockResolvedValue([]);
      vi.mocked(interpreterService.interpret).mockRejectedValue(new Error('Interpretation error'));

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
    });
  });

  describe('cleanup', () => {
    it('should always end import tracking', async () => {
      const node = createImportDirective('error.meld', createLocation(1, 1));
      node.directive.path = 'error.meld';
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('error.meld');
      vi.mocked(fileSystemService.exists).mockResolvedValueOnce(true);
      vi.mocked(fileSystemService.readFile).mockRejectedValueOnce(
        new Error('Read error')
      );

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
      expect(circularityService.endImport).toHaveBeenCalledWith('error.meld');
    });
  });
});
```

# ImportDirectiveHandler.transformation.test.ts

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DirectiveNode, DirectiveContext } from 'meld-spec';
import { ImportDirectiveHandler } from './ImportDirectiveHandler.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService.js';
import { createLocation } from '@tests/utils/testFactories.js';

describe('ImportDirectiveHandler Transformation', () => {
  let handler: ImportDirectiveHandler;
  let validationService: IValidationService;
  let stateService: IStateService;
  let resolutionService: IResolutionService;
  let fileSystemService: IFileSystemService;
  let parserService: IParserService;
  let interpreterService: IInterpreterService;
  let circularityService: ICircularityService;
  let clonedState: IStateService;
  let childState: IStateService;

  beforeEach(() => {
    validationService = {
      validate: vi.fn()
    } as unknown as IValidationService;

    childState = {
      setTextVar: vi.fn(),
      setDataVar: vi.fn(),
      setPathVar: vi.fn(),
      setCommand: vi.fn(),
      getTextVar: vi.fn(),
      getDataVar: vi.fn(),
      getPathVar: vi.fn(),
      getCommand: vi.fn(),
      getAllTextVars: vi.fn().mockReturnValue(new Map()),
      getAllDataVars: vi.fn().mockReturnValue(new Map()),
      getAllPathVars: vi.fn().mockReturnValue(new Map()),
      getAllCommands: vi.fn().mockReturnValue(new Map()),
      clone: vi.fn(),
      mergeChildState: vi.fn(),
      isTransformationEnabled: vi.fn().mockReturnValue(true)
    } as unknown as IStateService;

    clonedState = {
      setTextVar: vi.fn(),
      setDataVar: vi.fn(),
      setPathVar: vi.fn(),
      setCommand: vi.fn(),
      getTextVar: vi.fn(),
      getDataVar: vi.fn(),
      getPathVar: vi.fn(),
      getCommand: vi.fn(),
      getAllTextVars: vi.fn().mockReturnValue(new Map()),
      getAllDataVars: vi.fn().mockReturnValue(new Map()),
      getAllPathVars: vi.fn().mockReturnValue(new Map()),
      getAllCommands: vi.fn().mockReturnValue(new Map()),
      createChildState: vi.fn().mockReturnValue(childState),
      mergeChildState: vi.fn(),
      clone: vi.fn(),
      isTransformationEnabled: vi.fn().mockReturnValue(true)
    } as unknown as IStateService;

    stateService = {
      setTextVar: vi.fn(),
      setDataVar: vi.fn(),
      setPathVar: vi.fn(),
      setCommand: vi.fn(),
      getTextVar: vi.fn(),
      getDataVar: vi.fn(),
      getPathVar: vi.fn(),
      getCommand: vi.fn(),
      getAllTextVars: vi.fn().mockReturnValue(new Map()),
      getAllDataVars: vi.fn().mockReturnValue(new Map()),
      getAllPathVars: vi.fn().mockReturnValue(new Map()),
      getAllCommands: vi.fn().mockReturnValue(new Map()),
      clone: vi.fn().mockReturnValue(clonedState),
      createChildState: vi.fn().mockReturnValue(childState),
      isTransformationEnabled: vi.fn().mockReturnValue(true)
    } as unknown as IStateService;

    resolutionService = {
      resolveInContext: vi.fn()
    } as unknown as IResolutionService;

    fileSystemService = {
      exists: vi.fn(),
      readFile: vi.fn(),
      dirname: vi.fn().mockReturnValue('/workspace'),
      join: vi.fn().mockImplementation((...args) => args.join('/')),
      normalize: vi.fn().mockImplementation(path => path)
    } as unknown as IFileSystemService;

    parserService = {
      parse: vi.fn()
    } as unknown as IParserService;

    interpreterService = {
      interpret: vi.fn().mockResolvedValue(childState)
    } as unknown as IInterpreterService;

    circularityService = {
      beginImport: vi.fn(),
      endImport: vi.fn()
    } as unknown as ICircularityService;

    handler = new ImportDirectiveHandler(
      validationService,
      resolutionService,
      stateService,
      fileSystemService,
      parserService,
      interpreterService,
      circularityService
    );
  });

  describe('transformation behavior', () => {
    it('should return empty text node when transformation enabled', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'import',
          identifier: '*',
          value: 'test.meld'
        },
        location: createLocation(1, 1)
      };
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('test.meld');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue('test content');
      vi.mocked(parserService.parse).mockResolvedValue([]);
      vi.mocked(childState.getAllTextVars).mockReturnValue(new Map([['var1', 'value1']]));

      const result = await handler.execute(node, context);

      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual({
        type: 'Text',
        content: '',
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 1 },
          filePath: undefined
        }
      });
      expect(result.state).toBe(clonedState);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('var1', 'value1');
    });

    it('should still import variables when transformation enabled', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'import',
          identifier: 'myVar',
          value: 'test.meld'
        },
        location: createLocation(1, 1)
      };
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('test.meld');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue('test content');
      vi.mocked(parserService.parse).mockResolvedValue([]);
      vi.mocked(childState.getTextVar).mockReturnValue('value1');

      const result = await handler.execute(node, context);

      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual({
        type: 'Text',
        content: '',
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 1 },
          filePath: undefined
        }
      });
      expect(result.state).toBe(clonedState);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('myVar', 'value1');
    });

    it('should handle aliased imports in transformation mode', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'import',
          identifier: 'sourceVar:targetVar',
          value: 'test.meld'
        },
        location: createLocation(1, 1)
      };
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('test.meld');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue('test content');
      vi.mocked(parserService.parse).mockResolvedValue([]);
      vi.mocked(childState.getTextVar).mockReturnValue('value1');

      const result = await handler.execute(node, context);

      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual({
        type: 'Text',
        content: '',
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 1 },
          filePath: undefined
        }
      });
      expect(result.state).toBe(clonedState);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('targetVar', 'value1');
    });

    it('should preserve error handling in transformation mode', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'import',
          identifier: '*',
          value: 'missing.meld'
        },
        location: createLocation(1, 1)
      };
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('missing.meld');
      vi.mocked(fileSystemService.exists).mockResolvedValue(false);

      await expect(handler.execute(node, context)).rejects.toThrow();
      expect(circularityService.endImport).toHaveBeenCalled();
    });
  });
});
```

# ImportDirectiveHandler.ts

```typescript
import { DirectiveNode, MeldNode, TextNode } from 'meld-spec';
import type { DirectiveContext, IDirectiveHandler } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import type { DirectiveResult } from '@services/pipeline/DirectiveService/types.js';
import { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import { IStateService } from '@services/state/StateService/IStateService.js';
import { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import { ICircularityService } from '@services/resolution/CircularityService/ICircularityService.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { directiveLogger as logger } from '@core/utils/logger.js';

/**
 * Handler for @import directives
 * Imports variables from other files
 * When transformation is enabled, the directive is removed from output
 */
export class ImportDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'import';

  constructor(
    private validationService: IValidationService,
    private resolutionService: IResolutionService,
    private stateService: IStateService,
    private fileSystemService: IFileSystemService,
    private parserService: IParserService,
    private interpreterService: IInterpreterService,
    private circularityService: ICircularityService
  ) {}

  async execute(node: DirectiveNode, context: DirectiveContext): Promise<DirectiveResult | IStateService> {
    let resolvedFullPath: string | undefined;

    try {
      // Validate the directive
      await this.validationService.validate(node);

      // Get path and import list from directive
      const { path, value, identifier, importList } = node.directive;
      const resolvedPath = path || this.extractPath(value);
      // Only use identifier as import list if it's not 'import' (which is the directive identifier)
      const resolvedImportList = importList || (identifier !== 'import' ? identifier : undefined);

      if (!resolvedPath) {
        throw new DirectiveError(
          'Import directive requires a path',
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          { node }
        );
      }

      // Create a new state for modifications
      const clonedState = context.state.clone();

      // Create resolution context
      const resolutionContext = {
        currentFilePath: context.currentFilePath,
        state: context.state,
        allowedVariableTypes: {
          text: true,
          data: true,
          path: true,
          command: false
        }
      };

      // Resolve the path using the resolution service
      resolvedFullPath = await this.resolutionService.resolveInContext(
        resolvedPath,
        resolutionContext
      );

      // Check for circular imports before proceeding
      try {
        this.circularityService.beginImport(resolvedFullPath);
      } catch (error) {
        throw new DirectiveError(
          error?.message || 'Circular import detected',
          this.kind,
          DirectiveErrorCode.CIRCULAR_IMPORT,
          { node, context, cause: error }
        );
      }

      try {
        // Check if file exists
        if (!await this.fileSystemService.exists(resolvedFullPath)) {
          throw new DirectiveError(
            `Import file not found: [${resolvedPath}]`,
            this.kind,
            DirectiveErrorCode.FILE_NOT_FOUND,
            { node, context }
          );
        }

        // Read and parse the file
        const content = await this.fileSystemService.readFile(resolvedFullPath);
        const nodes = await this.parserService.parse(content);

        // Create child state for interpretation
        const childState = clonedState.createChildState();

        // Interpret content
        const interpretedState = await this.interpreterService.interpret(nodes, {
          initialState: childState,
          filePath: resolvedFullPath,
          mergeState: false
        });

        // Import variables based on import list
        const imports = this.parseImportList(resolvedImportList || '*');
        for (const { name, alias } of imports) {
          if (name === '*') {
            this.importAllVariables(interpretedState, clonedState);
          } else {
            this.importVariable(name, alias, interpretedState, clonedState);
          }
        }

        logger.debug('Import directive processed successfully', {
          path: resolvedPath,
          importList: resolvedImportList,
          location: node.location
        });

        // If transformation is enabled, return an empty text node to remove the directive from output
        if (context.state.isTransformationEnabled?.()) {
          const replacement: TextNode = {
            type: 'Text',
            content: '',
            location: node.location
          };
          return { state: clonedState, replacement };
        }

        return clonedState;
      } finally {
        // Always end import tracking
        if (resolvedFullPath) {
          this.circularityService.endImport(resolvedFullPath);
        }
      }
    } catch (error) {
      // Always end import tracking on error
      if (resolvedFullPath) {
        this.circularityService.endImport(resolvedFullPath);
      }

      logger.error('Failed to process import directive', {
        location: node.location,
        error
      });

      // Wrap in DirectiveError if needed
      if (error instanceof DirectiveError) {
        throw error;
      }
      throw new DirectiveError(
        error?.message || 'Unknown error',
        this.kind,
        DirectiveErrorCode.EXECUTION_FAILED,
        {
          node,
          context,
          cause: error instanceof Error ? error : new Error(String(error))
        }
      );
    }
  }

  private extractPath(value: string): string | undefined {
    if (!value) return undefined;
    // Remove brackets if present and trim whitespace
    return value.replace(/^\[(.*)\]$/, '$1').trim();
  }

  private parseImportList(importList: string): Array<{ name: string; alias?: string }> {
    if (!importList) return [{ name: '*' }];  // Default to importing everything
    if (importList === '*') return [{ name: '*' }];

    // Remove brackets if present and split by commas
    const cleanList = importList.replace(/^\[(.*)\]$/, '$1');
    const parts = cleanList.split(',').map(part => part.trim());

    return parts.map(part => {
      // Handle colon syntax (var:alias)
      if (part.includes(':')) {
        const [name, alias] = part.split(':').map(s => s.trim());
        return { name, alias };
      }

      // Handle 'as' syntax (var as alias)
      const asParts = part.split(/\s+as\s+/);
      if (asParts.length > 1) {
        const [name, alias] = asParts.map(s => s.trim());
        return { name, alias };
      }

      // Single variable import
      return { name: part };
    });
  }

  private importAllVariables(sourceState: IStateService, targetState: IStateService): void {
    // Import all text variables
    const textVars = sourceState.getAllTextVars();
    for (const [name, value] of textVars.entries()) {
      targetState.setTextVar(name, value);
    }

    // Import all data variables
    const dataVars = sourceState.getAllDataVars();
    for (const [name, value] of dataVars.entries()) {
      targetState.setDataVar(name, value);
    }

    // Import all path variables
    const pathVars = sourceState.getAllPathVars();
    for (const [name, value] of pathVars.entries()) {
      targetState.setPathVar(name, value);
    }

    // Import all commands
    const commands = sourceState.getAllCommands();
    for (const [name, value] of commands.entries()) {
      targetState.setCommand(name, value);
    }
  }

  private importVariable(name: string, alias: string | undefined, sourceState: IStateService, targetState: IStateService): void {
    // Try each variable type in order
    const textValue = sourceState.getTextVar(name);
    if (textValue !== undefined) {
      targetState.setTextVar(alias || name, textValue);
      return;
    }

    const dataValue = sourceState.getDataVar(name);
    if (dataValue !== undefined) {
      targetState.setDataVar(alias || name, dataValue);
      return;
    }

    const pathValue = sourceState.getPathVar(name);
    if (pathValue !== undefined) {
      targetState.setPathVar(alias || name, pathValue);
      return;
    }

    const commandValue = sourceState.getCommand(name);
    if (commandValue !== undefined) {
      targetState.setCommand(alias || name, commandValue);
      return;
    }

    // If we get here, the variable wasn't found
    throw new DirectiveError(
      `Variable not found: ${name}`,
      this.kind,
      DirectiveErrorCode.VARIABLE_NOT_FOUND
    );
  }
}
```

# RunDirectiveHandler.test.ts

```typescript
// Mock the logger before any imports
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};

vi.mock('../../../../core/utils/logger', () => ({
  directiveLogger: mockLogger
}));

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RunDirectiveHandler } from './RunDirectiveHandler.js';
import { createRunDirective, createLocation } from '@tests/utils/testFactories.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { DirectiveNode } from 'meld-spec';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { exec } from 'child_process';
import { promisify } from 'util';

// Mock child_process
vi.mock('child_process', () => ({
  exec: vi.fn()
}));

describe('RunDirectiveHandler', () => {
  let handler: RunDirectiveHandler;
  let validationService: IValidationService;
  let stateService: IStateService;
  let resolutionService: IResolutionService;
  let fileSystemService: IFileSystemService;
  let clonedState: IStateService;

  beforeEach(() => {
    validationService = {
      validate: vi.fn(),
      registerValidator: vi.fn(),
      removeValidator: vi.fn(),
      hasValidator: vi.fn(),
      getRegisteredDirectiveKinds: vi.fn()
    } as unknown as IValidationService;

    clonedState = {
      setTextVar: vi.fn(),
      clone: vi.fn(),
      isTransformationEnabled: vi.fn().mockReturnValue(false)
    } as unknown as IStateService;

    stateService = {
      setTextVar: vi.fn(),
      clone: vi.fn().mockReturnValue(clonedState),
      isTransformationEnabled: vi.fn().mockReturnValue(false)
    } as unknown as IStateService;

    resolutionService = {
      resolveInContext: vi.fn()
    } as unknown as IResolutionService;

    fileSystemService = {
      getCwd: vi.fn().mockReturnValue('/workspace'),
      executeCommand: vi.fn(),
      dirname: vi.fn().mockReturnValue('/workspace'),
      join: vi.fn().mockImplementation((...args) => args.join('/')),
      normalize: vi.fn().mockImplementation(path => path)
    } as unknown as IFileSystemService;

    handler = new RunDirectiveHandler(
      validationService,
      resolutionService,
      stateService,
      fileSystemService
    );

    // Reset mocks
    vi.clearAllMocks();
  });

  describe('basic command execution', () => {
    it('should execute simple commands', async () => {
      const node = createRunDirective('echo test', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      const clonedState = {
        ...stateService,
        clone: vi.fn().mockReturnThis(),
        setTextVar: vi.fn(),
        isTransformationEnabled: vi.fn().mockReturnValue(false)
      };

      vi.mocked(stateService.clone).mockReturnValue(clonedState);
      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('echo test');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: 'test output',
        stderr: ''
      });

      const result = await handler.execute(node, context);

      expect(fileSystemService.executeCommand).toHaveBeenCalledWith(
        'echo test',
        expect.objectContaining({ cwd: '/workspace' })
      );
      expect(clonedState.setTextVar).toHaveBeenCalledWith('stdout', 'test output');
      expect(result.state).toBe(clonedState);
    });

    it('should handle commands with variables', async () => {
      const node = createRunDirective('echo ${message}', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      const clonedState = {
        ...stateService,
        clone: vi.fn().mockReturnThis(),
        setTextVar: vi.fn(),
        getTextVar: vi.fn().mockReturnValue('Hello World'),
        isTransformationEnabled: vi.fn().mockReturnValue(false)
      };

      vi.mocked(stateService.clone).mockReturnValue(clonedState);
      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('echo Hello World');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: 'Hello World',
        stderr: ''
      });

      const result = await handler.execute(node, context);

      expect(fileSystemService.executeCommand).toHaveBeenCalledWith(
        'echo Hello World',
        expect.objectContaining({ cwd: '/workspace' })
      );
      expect(clonedState.setTextVar).toHaveBeenCalledWith('stdout', 'Hello World');
      expect(result.state).toBe(clonedState);
    });

    it('should handle commands with path variables', async () => {
      const node = createRunDirective('cat ${file}', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      const clonedState = {
        ...stateService,
        clone: vi.fn().mockReturnThis(),
        setTextVar: vi.fn(),
        getPathVar: vi.fn().mockReturnValue('/path/to/file'),
        isTransformationEnabled: vi.fn().mockReturnValue(false)
      };

      vi.mocked(stateService.clone).mockReturnValue(clonedState);
      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('cat /path/to/file');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: 'file contents',
        stderr: ''
      });

      const result = await handler.execute(node, context);

      expect(fileSystemService.executeCommand).toHaveBeenCalledWith(
        'cat /path/to/file',
        expect.objectContaining({ cwd: '/workspace' })
      );
      expect(clonedState.setTextVar).toHaveBeenCalledWith('stdout', 'file contents');
      expect(result.state).toBe(clonedState);
    });
  });

  describe('error handling', () => {
    it('should handle validation errors', async () => {
      const node = createRunDirective('', createLocation(1, 1));
      const context = {
        currentFilePath: 'test.meld',
        state: stateService,
        workingDirectory: '/workspace'
      };

      vi.mocked(validationService.validate).mockRejectedValueOnce(
        new DirectiveError('Invalid command', 'run', DirectiveErrorCode.VALIDATION_FAILED)
      );

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
      expect(fileSystemService.executeCommand).not.toHaveBeenCalled();
    });

    it('should handle resolution errors', async () => {
      const node = createRunDirective('${undefined_var}', createLocation(1, 1));
      const context = {
        currentFilePath: 'test.meld',
        state: stateService,
        workingDirectory: '/workspace'
      };

      vi.mocked(resolutionService.resolveInContext).mockRejectedValueOnce(
        new Error('Variable not found')
      );

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
      expect(fileSystemService.executeCommand).not.toHaveBeenCalled();
    });

    it('should handle command execution errors', async () => {
      const node = createRunDirective('invalid-command', createLocation(1, 1));
      const context = {
        currentFilePath: 'test.meld',
        state: stateService,
        workingDirectory: '/workspace'
      };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('invalid-command');
      vi.mocked(fileSystemService.executeCommand).mockRejectedValueOnce(
        new Error('Command failed')
      );

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
      expect(clonedState.setTextVar).not.toHaveBeenCalled();
    });
  });

  describe('output handling', () => {
    it('should handle stdout and stderr', async () => {
      const node = createRunDirective('echo error >&2', createLocation(1, 1));
      const context = {
        currentFilePath: 'test.meld',
        state: stateService,
        parentState: undefined
      };

      const clonedState = {
        ...stateService,
        clone: vi.fn().mockReturnThis(),
        setTextVar: vi.fn(),
        isTransformationEnabled: vi.fn().mockReturnValue(false)
      };

      vi.mocked(stateService.clone).mockReturnValue(clonedState);
      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('echo error >&2');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: '',
        stderr: 'error output'
      });

      const result = await handler.execute(node, context);

      expect(stateService.clone).toHaveBeenCalled();
      expect(clonedState.setTextVar).toHaveBeenCalledWith('stderr', 'error output');
      expect(result.state).toBe(clonedState);
    });

    it('should handle output capture to variable', async () => {
      const node = createRunDirective('echo test', createLocation(1, 1));
      node.directive.output = 'result';
      const context = {
        currentFilePath: 'test.meld',
        state: stateService,
        parentState: undefined
      };

      const clonedState = {
        ...stateService,
        clone: vi.fn().mockReturnThis(),
        setTextVar: vi.fn(),
        isTransformationEnabled: vi.fn().mockReturnValue(false)
      };

      vi.mocked(stateService.clone).mockReturnValue(clonedState);
      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('echo test');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: 'test output',
        stderr: ''
      });

      const result = await handler.execute(node, context);

      expect(stateService.clone).toHaveBeenCalled();
      expect(clonedState.setTextVar).toHaveBeenCalledWith('result', 'test output');
      expect(result.state).toBe(clonedState);
    });
  });

  describe('working directory handling', () => {
    it('should use workspace root as default cwd', async () => {
      const node = createRunDirective('pwd', createLocation(1, 1));
      const context = {
        currentFilePath: 'test.meld',
        state: stateService,
        parentState: undefined
      };

      const clonedState = {
        ...stateService,
        clone: vi.fn().mockReturnThis(),
        setTextVar: vi.fn(),
        isTransformationEnabled: vi.fn().mockReturnValue(false)
      };

      vi.mocked(stateService.clone).mockReturnValue(clonedState);
      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('pwd');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: '/workspace',
        stderr: ''
      });

      const result = await handler.execute(node, context);

      expect(fileSystemService.executeCommand).toHaveBeenCalledWith(
        'pwd',
        expect.objectContaining({ cwd: '/workspace' })
      );
      expect(clonedState.setTextVar).toHaveBeenCalledWith('stdout', '/workspace');
      expect(result.state).toBe(clonedState);
    });

    it('should respect custom working directory', async () => {
      const node = createRunDirective('pwd', createLocation(1, 1));
      const context = {
        currentFilePath: 'test.meld',
        state: stateService,
        parentState: undefined,
        workingDirectory: '/custom/dir'
      };

      const clonedState = {
        ...stateService,
        clone: vi.fn().mockReturnThis(),
        setTextVar: vi.fn(),
        isTransformationEnabled: vi.fn().mockReturnValue(false)
      };

      vi.mocked(stateService.clone).mockReturnValue(clonedState);
      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('pwd');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: '/custom/dir',
        stderr: ''
      });

      const result = await handler.execute(node, context);

      expect(fileSystemService.executeCommand).toHaveBeenCalledWith(
        'pwd',
        expect.objectContaining({ cwd: '/custom/dir' })
      );
      expect(clonedState.setTextVar).toHaveBeenCalledWith('stdout', '/custom/dir');
      expect(result.state).toBe(clonedState);
    });
  });
});
```

# RunDirectiveHandler.transformation.test.ts

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DirectiveNode, DirectiveContext } from 'meld-spec';
import { RunDirectiveHandler } from './RunDirectiveHandler.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { createRunDirective, createLocation } from '@tests/utils/testFactories.js';

describe('RunDirectiveHandler Transformation', () => {
  let handler: RunDirectiveHandler;
  let validationService: IValidationService;
  let stateService: IStateService;
  let resolutionService: IResolutionService;
  let fileSystemService: IFileSystemService;
  let clonedState: IStateService;

  beforeEach(() => {
    validationService = {
      validate: vi.fn()
    } as unknown as IValidationService;

    clonedState = {
      setTextVar: vi.fn(),
      clone: vi.fn().mockReturnThis(),
      isTransformationEnabled: vi.fn().mockReturnValue(true)
    } as unknown as IStateService;

    stateService = {
      setTextVar: vi.fn(),
      clone: vi.fn().mockReturnValue(clonedState),
      isTransformationEnabled: vi.fn().mockReturnValue(true)
    } as unknown as IStateService;

    resolutionService = {
      resolveInContext: vi.fn()
    } as unknown as IResolutionService;

    fileSystemService = {
      getCwd: vi.fn().mockReturnValue('/workspace'),
      executeCommand: vi.fn()
    } as unknown as IFileSystemService;

    handler = new RunDirectiveHandler(
      validationService,
      resolutionService,
      stateService,
      fileSystemService
    );

    // Reset mocks
    vi.clearAllMocks();
  });

  describe('transformation behavior', () => {
    it('should return replacement node with command output when transformation enabled', async () => {
      const node = createRunDirective('echo test', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('echo test');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: 'test output',
        stderr: ''
      });

      const result = await handler.execute(node, context);

      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual({
        type: 'Text',
        content: 'test output',
        location: node.location
      });
      expect(result.state).toBe(clonedState);
    });

    it('should handle variable interpolation in command during transformation', async () => {
      const node = createRunDirective('echo ${message}', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('echo Hello World');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: 'Hello World',
        stderr: ''
      });

      const result = await handler.execute(node, context);

      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual({
        type: 'Text',
        content: 'Hello World',
        location: node.location
      });
      expect(result.state).toBe(clonedState);
    });

    it('should handle stderr output in transformation', async () => {
      const node = createRunDirective('echo error >&2', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('echo error >&2');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: '',
        stderr: 'error output'
      });

      const result = await handler.execute(node, context);

      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual({
        type: 'Text',
        content: 'error output',
        location: node.location
      });
      expect(result.state).toBe(clonedState);
    });

    it('should handle both stdout and stderr in transformation', async () => {
      const node = createRunDirective('echo test && echo error >&2', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('echo test && echo error >&2');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: 'test output',
        stderr: 'error output'
      });

      const result = await handler.execute(node, context);

      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual({
        type: 'Text',
        content: 'test output\nerror output',
        location: node.location
      });
      expect(result.state).toBe(clonedState);
    });

    it('should preserve error handling during transformation', async () => {
      const node = createRunDirective('invalid-command', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('invalid-command');
      vi.mocked(fileSystemService.executeCommand).mockRejectedValue(new Error('Command failed'));

      await expect(handler.execute(node, context)).rejects.toThrow('Failed to execute command: Command failed');
    });
  });
});
```

# RunDirectiveHandler.ts

```typescript
import type { DirectiveNode, DirectiveContext, MeldNode, TextNode } from 'meld-spec';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { directiveLogger } from '../../../../../core/utils/logger.js';
import type { DirectiveResult } from '@services/pipeline/DirectiveService/types.js';
import type { IDirectiveHandler } from '@services/pipeline/DirectiveService/IDirectiveService.js';

/**
 * Handler for @run directives
 * Executes commands and stores their output in state
 */
export class RunDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'run';

  constructor(
    private validationService: IValidationService,
    private resolutionService: IResolutionService,
    private stateService: IStateService,
    private fileSystemService: IFileSystemService
  ) {}

  async execute(node: DirectiveNode, context: DirectiveContext): Promise<DirectiveResult> {
    const { directive } = node;
    const { state } = context;
    const clonedState = state.clone();

    try {
      // Validate the directive
      await this.validationService.validate(node);

      // Resolve the command
      const resolvedCommand = await this.resolutionService.resolveInContext(
        directive.command,
        context
      );

      // Execute the command
      const { stdout, stderr } = await this.fileSystemService.executeCommand(
        resolvedCommand,
        {
          cwd: context.workingDirectory || this.fileSystemService.getCwd()
        }
      );

      // Store the output in state variables
      if (directive.output) {
        clonedState.setTextVar(directive.output, stdout);
      } else {
        clonedState.setTextVar('stdout', stdout);
        if (stderr) {
          clonedState.setTextVar('stderr', stderr);
        }
      }

      // If transformation is enabled, return a replacement node with the command output
      if (clonedState.isTransformationEnabled()) {
        const content = stdout && stderr ? `${stdout}\n${stderr}` : stdout || stderr;
        const replacement: MeldNode = {
          type: 'Text',
          content,
          location: node.location
        };
        return { state: clonedState, replacement };
      }

      return { state: clonedState };
    } catch (error) {
      directiveLogger.error('Error executing run directive:', error);
      if (error instanceof DirectiveError) {
        throw error;
      }
      throw new DirectiveError(
        `Failed to execute command: ${error.message}`,
        'run',
        DirectiveErrorCode.EXECUTION_FAILED
      );
    }
  }
}
```

# types.ts

```typescript
import type { MeldNode } from 'meld-spec';

/**
 * Command definition with optional configuration
 */
export interface CommandDefinition {
  readonly command: string;
  readonly options?: Readonly<Record<string, unknown>>;
}

/**
 * Represents a state node in the state tree
 */
export interface StateNode {
  stateId: string;
  source?: 'clone' | 'merge' | 'new' | 'child' | 'implicit';
  filePath?: string;
  readonly variables: {
    readonly text: Map<string, string>;
    readonly data: Map<string, unknown>;
    readonly path: Map<string, string>;
  };
  readonly commands: Map<string, CommandDefinition>;
  readonly nodes: MeldNode[];
  readonly transformedNodes?: MeldNode[];
  readonly imports: Set<string>;
}

/**
 * Represents an operation performed on the state
 */
export interface StateOperation {
  readonly type: 'create' | 'merge' | 'update';
  readonly timestamp: number;
  readonly source: string;
  readonly details: {
    readonly operation: string;
    readonly key?: string;
    readonly value?: unknown;
  };
}

/**
 * Options for creating a new state node
 */
export interface StateNodeOptions {
  readonly parentState?: StateNode;
  readonly filePath?: string;
  readonly source?: string;
}

/**
 * Factory for creating and manipulating immutable state nodes
 */
export interface IStateFactory {
  /**
   * Creates a new empty state node
   */
  createState(options?: StateNodeOptions): StateNode;

  /**
   * Creates a child state node that inherits from a parent
   */
  createChildState(parent: StateNode, options?: StateNodeOptions): StateNode;

  /**
   * Merges a child state back into its parent, creating a new state node
   */
  mergeStates(parent: StateNode, child: StateNode): StateNode;

  /**
   * Updates a state node with new values, creating a new state node
   */
  updateState(state: StateNode, updates: Partial<StateNode>): StateNode;
}
```

# IInterpreterService.ts

```typescript
import type { MeldNode } from 'meld-spec';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IDirectiveService } from '@services/pipeline/DirectiveService/IDirectiveService.js';

export interface InterpreterOptions {
  /**
   * Initial state to use for interpretation
   * If not provided, a new state will be created
   */
  initialState?: IStateService;

  /**
   * Current file path for error reporting
   */
  filePath?: string;

  /**
   * Whether to merge the final state back to the parent
   * @default true
   */
  mergeState?: boolean;

  /**
   * List of variables to import
   * If undefined, all variables are imported
   * If empty array, no variables are imported
   */
  importFilter?: string[];
}

export interface IInterpreterService {
  /**
   * Initialize the InterpreterService with required dependencies
   */
  initialize(
    directiveService: IDirectiveService,
    stateService: IStateService
  ): void;

  /**
   * Interpret a sequence of Meld nodes
   * @returns The final state after interpretation
   * @throws {MeldInterpreterError} If interpretation fails
   */
  interpret(
    nodes: MeldNode[],
    options?: InterpreterOptions
  ): Promise<IStateService>;

  /**
   * Interpret a single Meld node
   * @returns The state after interpretation
   * @throws {MeldInterpreterError} If interpretation fails
   */
  interpretNode(
    node: MeldNode,
    state: IStateService
  ): Promise<IStateService>;

  /**
   * Create a new interpreter context with a child state
   * Useful for nested interpretation (import/embed)
   */
  createChildContext(
    parentState: IStateService,
    filePath?: string
  ): Promise<IStateService>;
}
```

# InterpreterService.integration.test.ts

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestContext } from '@tests/utils/index.js';
import { MeldInterpreterError } from '@core/errors/MeldInterpreterError.js';
import type { TextNode } from 'meld-spec';

describe('InterpreterService Integration', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = new TestContext();
    await context.initialize();
    await context.fixtures.load('interpreterTestProject');
  });

  afterEach(async () => {
    await context.cleanup();
  });

  describe('Basic interpretation', () => {
    it('interprets text nodes', async () => {
      const content = 'Hello world';
      const nodes = await context.services.parser.parse(content);
      const result = await context.services.interpreter.interpret(nodes);
      const resultNodes = result.getNodes();
      expect(resultNodes).toHaveLength(1);
      expect(resultNodes[0].type).toBe('Text');
      expect((resultNodes[0] as TextNode).content).toBe('Hello world');
    });

    it('interprets directive nodes', async () => {
      const node = context.factory.createTextDirective('test', 'Hello');
      const result = await context.services.interpreter.interpret([node]);
      const value = result.getTextVar('test');
      expect(value).toBe('Hello');
    });

    it('interprets data directives', async () => {
      const node = context.factory.createDataDirective('config', { key: 'value' });
      const result = await context.services.interpreter.interpret([node]);
      const value = result.getDataVar('config');
      expect(value).toEqual({ key: 'value' });
    });

    it('interprets path directives', async () => {
      const node = context.factory.createPathDirective('test', 'project/src/main.meld');
      const result = await context.services.interpreter.interpret([node]);
      const value = result.getPathVar('test');
      expect(value).toBe('project/src/main.meld');
    });

    it('maintains node order in state', async () => {
      const nodes = [
        context.factory.createTextDirective('first', 'one', context.factory.createLocation(1, 1)),
        context.factory.createTextDirective('second', 'two', context.factory.createLocation(2, 1)),
        context.factory.createTextDirective('third', 'three', context.factory.createLocation(3, 1))
      ];

      // Create a parent state to track nodes
      const parentState = context.services.state.createChildState();

      const result = await context.services.interpreter.interpret(nodes, {
        initialState: parentState,
        filePath: 'test.meld',
        mergeState: true
      });

      const stateNodes = result.getNodes();
      expect(stateNodes).toHaveLength(3);
      expect(stateNodes[0].type).toBe('Directive');
      expect((stateNodes[0] as any).directive.identifier).toBe('first');
      expect(stateNodes[1].type).toBe('Directive');
      expect((stateNodes[1] as any).directive.identifier).toBe('second');
      expect(stateNodes[2].type).toBe('Directive');
      expect((stateNodes[2] as any).directive.identifier).toBe('third');
    });
  });

  describe('State management', () => {
    it('creates isolated states for different interpretations', async () => {
      const node = context.factory.createTextDirective('test', 'value');
      const result1 = await context.services.interpreter.interpret([node]);
      const result2 = await context.services.interpreter.interpret([node]);
      expect(result1).not.toBe(result2);
      expect(result1.getTextVar('test')).toBe('value');
      expect(result2.getTextVar('test')).toBe('value');
    });

    it('merges child state back to parent', async () => {
      const node = context.factory.createTextDirective('child', 'value');
      const parentState = context.services.state.createChildState();
      await context.services.interpreter.interpret([node], { initialState: parentState, mergeState: true });
      expect(parentState.getTextVar('child')).toBe('value');
    });

    it('maintains isolation with mergeState: false', async () => {
      const node = context.factory.createTextDirective('isolated', 'value');
      const parentState = context.services.state.createChildState();
      await context.services.interpreter.interpret([node], { initialState: parentState, mergeState: false });
      expect(parentState.getTextVar('isolated')).toBeUndefined();
    });

    it('handles state rollback on merge errors', async () => {
      // Create a directive that will cause a resolution error
      const node = context.factory.createTextDirective('error', '${nonexistent}', context.factory.createLocation(1, 1));

      // Create parent state with initial value
      const parentState = context.services.state.createChildState();
      parentState.setTextVar('original', 'value');

      try {
        await context.services.interpreter.interpret([node], {
          initialState: parentState,
          filePath: 'test.meld',
          mergeState: true
        });
        throw new Error('Should have thrown error');
      } catch (error) {
        if (error instanceof MeldInterpreterError) {
          // Verify error details
          expect(error.nodeType).toBe('Directive');
          expect(error.message).toMatch(/Failed to resolve variables in text directive/i);
          expect(error.cause?.message).toMatch(/Undefined variable: nonexistent/i);

          // Verify state was rolled back
          expect(parentState.getTextVar('original')).toBe('value');
          expect(parentState.getTextVar('error')).toBeUndefined();
        } else {
          throw error;
        }
      }
    });
  });

  describe('Error handling', () => {
    it('handles circular imports', async () => {
      // Create two files that import each other
      await context.writeFile('project/src/circular1.meld', '@import [project/src/circular2.meld]');
      await context.writeFile('project/src/circular2.meld', '@import [project/src/circular1.meld]');

      // Create import node for circular1
      const node = context.factory.createImportDirective('project/src/circular1.meld', context.factory.createLocation(1, 1));
      node.directive.path = 'project/src/circular1.meld';
      node.directive.value = '[project/src/circular1.meld]';

      try {
        await context.services.interpreter.interpret([node], {
          filePath: 'test.meld'
        });
        throw new Error('Should have thrown error');
      } catch (error: unknown) {
        if (error instanceof MeldInterpreterError) {
          expect(error).toBeInstanceOf(MeldInterpreterError);
          expect(error.message).toMatch(/circular/i);
        } else {
          throw error;
        }
      }
    });

    it('provides location information in errors', async () => {
      // Create a directive that will cause an error
      const node = context.factory.createTextDirective('error', '${nonexistent}', context.factory.createLocation(1, 1));
      node.directive.value = '${nonexistent}';

      try {
        await context.services.interpreter.interpret([node], { filePath: 'test.meld' });
        throw new Error('Should have thrown error');
      } catch (error: unknown) {
        if (error instanceof MeldInterpreterError) {
          expect(error).toBeInstanceOf(MeldInterpreterError);
          expect(error.location).toBeDefined();
          expect(error.location?.line).toBe(1);
          expect(error.location?.column).toBe(1);
        } else {
          throw error;
        }
      }
    });

    it('maintains state consistency after errors', async () => {
      // Create parent state with initial value
      const parentState = context.services.state.createChildState();
      parentState.setTextVar('original', 'value');

      // Create nodes - one valid, one invalid
      const nodes = [
        context.factory.createTextDirective('valid', 'value', context.factory.createLocation(1, 1)),
        context.factory.createTextDirective('error', '${nonexistent}', context.factory.createLocation(2, 1))
      ];

      try {
        await context.services.interpreter.interpret(nodes, {
          initialState: parentState,
          filePath: 'test.meld'
        });
        throw new Error('Should have thrown error');
      } catch (error: unknown) {
        if (error instanceof MeldInterpreterError) {
          // Verify state was rolled back
          expect(parentState.getTextVar('original')).toBe('value');
          expect(parentState.getTextVar('valid')).toBeUndefined();
          expect(parentState.getTextVar('error')).toBeUndefined();
        } else {
          throw error;
        }
      }
    });

    it('includes state context in interpreter errors', async () => {
      // Create a directive that will cause an error
      const node = context.factory.createTextDirective('error', '${nonexistent}', context.factory.createLocation(1, 1));
      node.directive.value = '${nonexistent}';

      try {
        await context.services.interpreter.interpret([node], { filePath: 'test.meld' });
        throw new Error('Should have thrown error');
      } catch (error: unknown) {
        if (error instanceof MeldInterpreterError) {
          expect(error).toBeInstanceOf(MeldInterpreterError);
          expect(error.context).toBeDefined();
          if (error.context) {
            expect(error.context.nodeType).toBe('Directive');
            expect(error.context.state?.filePath).toBe('test.meld');
          }
        } else {
          throw error;
        }
      }
    });

    it('rolls back state on directive errors', async () => {
      // Create parent state with initial value
      const parentState = context.services.state.createChildState();
      parentState.setTextVar('original', 'value');

      // Create nodes that will cause an error
      const nodes = [
        context.factory.createTextDirective('before', 'valid', context.factory.createLocation(1, 1)),
        context.factory.createTextDirective('error', '${nonexistent}', context.factory.createLocation(2, 1)),
        context.factory.createTextDirective('after', 'valid', context.factory.createLocation(3, 1))
      ];

      try {
        await context.services.interpreter.interpret(nodes, {
          initialState: parentState,
          filePath: 'test.meld'
        });
        throw new Error('Should have thrown error');
      } catch (error: unknown) {
        if (error instanceof MeldInterpreterError) {
          // Verify state was rolled back
          expect(parentState.getTextVar('original')).toBe('value');
          expect(parentState.getTextVar('before')).toBeUndefined();
          expect(parentState.getTextVar('error')).toBeUndefined();
          expect(parentState.getTextVar('after')).toBeUndefined();
        } else {
          throw error;
        }
      }
    });

    it('handles cleanup on circular imports', async () => {
      // Create two files that import each other
      await context.writeFile('project/src/circular1.meld', '@import [project/src/circular2.meld]');
      await context.writeFile('project/src/circular2.meld', '@import [project/src/circular1.meld]');

      // Create import node for circular1
      const node = context.factory.createImportDirective('project/src/circular1.meld', context.factory.createLocation(1, 1));
      node.directive.path = 'project/src/circular1.meld';
      node.directive.value = '[project/src/circular1.meld]';

      try {
        await context.services.interpreter.interpret([node], {
          filePath: 'test.meld'
        });
        throw new Error('Should have thrown error');
      } catch (error: unknown) {
        if (error instanceof MeldInterpreterError) {
          expect(error).toBeInstanceOf(MeldInterpreterError);
          expect(error.message).toMatch(/circular/i);
        } else {
          throw error;
        }
      }
    });
  });

  describe('Complex scenarios', () => {
    it.todo('handles nested imports with state inheritance');
    // V2: Complex state inheritance in nested imports requires improved state management

    it.todo('maintains correct file paths during interpretation');
    // V2: Path resolution in nested imports needs enhanced tracking

    it.todo('maintains correct state after successful imports');
    // V2: State consistency across nested imports needs improved implementation
  });

  describe('AST structure handling', () => {
    it('handles text directives with correct format', async () => {
      const node = context.factory.createTextDirective('greeting', 'Hello');
      const result = await context.services.interpreter.interpret([node]);
      expect(result.getTextVar('greeting')).toBe('Hello');
    });

    it('handles data directives with correct format', async () => {
      const node = context.factory.createDataDirective('config', { key: 'value' });
      const result = await context.services.interpreter.interpret([node]);
      expect(result.getDataVar('config')).toEqual({ key: 'value' });
    });

    it('handles path directives with correct format', async () => {
      const node = context.factory.createPathDirective('test', 'project/src/main.meld');
      const result = await context.services.interpreter.interpret([node]);
      expect(result.getPathVar('test')).toBe('project/src/main.meld');
    });

    it('handles complex directives with schema validation', async () => {
      const node = context.factory.createDataDirective('user', { name: 'Alice', age: 30 });
      const result = await context.services.interpreter.interpret([node]);
      const user = result.getDataVar('user');
      expect(user).toEqual({ name: 'Alice', age: 30 });
    });

    it('maintains correct node order with mixed content', async () => {
      const nodes = [
        context.factory.createTextDirective('first', context.factory.createLocation(1, 1)),
        context.factory.createTextDirective('second', context.factory.createLocation(2, 1)),
        context.factory.createTextDirective('third', context.factory.createLocation(3, 1))
      ];
      nodes[0].directive.value = 'one';
      nodes[1].directive.value = 'two';
      nodes[2].directive.value = 'three';

      const result = await context.services.interpreter.interpret(nodes);
      const stateNodes = result.getNodes();
      expect(stateNodes).toHaveLength(3);
      expect(stateNodes[0].type).toBe('Directive');
      expect((stateNodes[0] as any).directive.identifier).toBe('first');
      expect(stateNodes[1].type).toBe('Directive');
      expect((stateNodes[1] as any).directive.identifier).toBe('second');
      expect(stateNodes[2].type).toBe('Directive');
      expect((stateNodes[2] as any).directive.identifier).toBe('third');
    });

    it.todo('handles nested directive values correctly');
    // V2: Complex nested directive resolution requires enhanced variable scope handling
  });
});
```

# InterpreterService.ts

```typescript
import type { MeldNode, SourceLocation, DirectiveNode } from 'meld-spec';
import { interpreterLogger as logger } from '@core/utils/logger.js';
import { IInterpreterService, type InterpreterOptions } from './IInterpreterService.js';
import type { IDirectiveService } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import { MeldInterpreterError, type InterpreterLocation } from '@core/errors/MeldInterpreterError.js';

const DEFAULT_OPTIONS: Required<Omit<InterpreterOptions, 'initialState'>> = {
  filePath: '',
  mergeState: true,
  importFilter: []
};

function convertLocation(loc?: SourceLocation): InterpreterLocation | undefined {
  if (!loc) return undefined;
  return {
    line: loc.start.line,
    column: loc.start.column,
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}

export class InterpreterService implements IInterpreterService {
  private directiveService?: IDirectiveService;
  private stateService?: IStateService;
  private initialized = false;

  initialize(
    directiveService: IDirectiveService,
    stateService: IStateService
  ): void {
    this.directiveService = directiveService;
    this.stateService = stateService;
    this.initialized = true;

    logger.debug('InterpreterService initialized');
  }

  async interpret(
    nodes: MeldNode[],
    options?: InterpreterOptions
  ): Promise<IStateService> {
    this.ensureInitialized();

    if (!nodes) {
      throw new MeldInterpreterError(
        'No nodes provided for interpretation',
        'interpretation'
      );
    }

    if (!Array.isArray(nodes)) {
      throw new MeldInterpreterError(
        'Invalid nodes provided for interpretation: expected array',
        'interpretation'
      );
    }

    const opts = { ...DEFAULT_OPTIONS, ...options };
    let currentState: IStateService;

    try {
      // Initialize state
      if (opts.initialState) {
        if (opts.mergeState) {
          // When mergeState is true, create child state from initial state
          currentState = opts.initialState.createChildState();
        } else {
          // When mergeState is false, create completely isolated state
          currentState = this.stateService!.createChildState();
        }
      } else {
        // No initial state, create fresh state
        currentState = this.stateService!.createChildState();
      }

      if (!currentState) {
        throw new MeldInterpreterError(
          'Failed to initialize state for interpretation',
          'initialization'
        );
      }

      if (opts.filePath) {
        currentState.setCurrentFilePath(opts.filePath);
      }

      // Take a snapshot of initial state for rollback
      const initialSnapshot = currentState.clone();
      let lastGoodState = initialSnapshot;

      logger.debug('Starting interpretation', {
        nodeCount: nodes?.length ?? 0,
        filePath: opts.filePath,
        mergeState: opts.mergeState
      });

      for (const node of nodes) {
        try {
          // Process the node with current state
          const updatedState = await this.interpretNode(node, currentState);

          // If successful, update the states
          currentState = updatedState;
          lastGoodState = currentState.clone();

          // Do not merge back to parent state here - wait until all nodes are processed
        } catch (error) {
          // Roll back to last good state
          currentState = lastGoodState.clone();

          // Preserve MeldInterpreterError or wrap other errors
          if (error instanceof MeldInterpreterError) {
            throw error;
          }
          throw new MeldInterpreterError(
            getErrorMessage(error),
            node.type,
            convertLocation(node.location),
            {
              cause: error instanceof Error ? error : undefined,
              context: {
                nodeType: node.type,
                location: convertLocation(node.location),
                state: {
                  filePath: currentState.getCurrentFilePath() ?? undefined
                }
              }
            }
          );
        }
      }

      // Only merge back to parent state after all nodes are processed successfully
      if (opts.mergeState && opts.initialState) {
        try {
          opts.initialState.mergeChildState(currentState);
          // Return the parent state after successful merge
          return opts.initialState;
        } catch (error) {
          logger.error('Failed to merge child state', {
            error,
            filePath: currentState.getCurrentFilePath()
          });
          // Roll back to last good state
          currentState = lastGoodState.clone();
          throw new MeldInterpreterError(
            'Failed to merge child state: ' + getErrorMessage(error),
            'state_merge',
            undefined,
            {
              cause: error instanceof Error ? error : undefined,
              context: {
                filePath: currentState.getCurrentFilePath() ?? undefined,
                state: {
                  filePath: currentState.getCurrentFilePath() ?? undefined
                }
              }
            }
          );
        }
      } else {
        // When mergeState is false, ensure we return a completely isolated state
        const isolatedState = this.stateService!.createChildState();
        isolatedState.mergeChildState(currentState);
        isolatedState.setImmutable(); // Prevent further modifications
        return isolatedState;
      }

      logger.debug('Interpretation completed successfully', {
        nodeCount: nodes?.length ?? 0,
        filePath: currentState.getCurrentFilePath(),
        finalStateNodes: currentState.getNodes()?.length ?? 0,
        mergedToParent: opts.mergeState && opts.initialState
      });

      return currentState;
    } catch (error) {
      logger.error('Interpretation failed', {
        nodeCount: nodes?.length ?? 0,
        filePath: opts.filePath,
        error
      });

      // Preserve MeldInterpreterError or wrap other errors
      if (error instanceof MeldInterpreterError) {
        throw error;
      }
      throw new MeldInterpreterError(
        getErrorMessage(error),
        'interpretation',
        undefined,
        {
          cause: error instanceof Error ? error : undefined,
          context: {
            filePath: opts.filePath
          }
        }
      );
    }
  }

  async interpretNode(
    node: MeldNode,
    state: IStateService
  ): Promise<IStateService> {
    if (!node) {
      throw new MeldInterpreterError(
        'No node provided for interpretation',
        'interpretation'
      );
    }

    if (!state) {
      throw new MeldInterpreterError(
        'No state provided for node interpretation',
        'interpretation'
      );
    }

    if (!node.type) {
      throw new MeldInterpreterError(
        'Unknown node type',
        'interpretation',
        convertLocation(node.location)
      );
    }

    logger.debug('Interpreting node', {
      type: node.type,
      location: node.location,
      filePath: state.getCurrentFilePath()
    });

    try {
      // Take a snapshot before processing
      const preNodeState = state.clone();
      let currentState = preNodeState;

      // Process based on node type
      switch (node.type) {
        case 'Text':
          // Create new state for text node
          const textState = currentState.clone();
          textState.addNode(node);
          currentState = textState;
          break;

        case 'Comment':
          // Comments are ignored during interpretation
          break;

        case 'Directive':
          if (!this.directiveService) {
            throw new MeldInterpreterError(
              'Directive service not initialized',
              'directive_service'
            );
          }
          // Process directive with cloned state to maintain immutability
          const directiveState = currentState.clone();
          // Add the node first to maintain order
          directiveState.addNode(node);
          if (node.type !== 'Directive' || !('directive' in node) || !node.directive) {
            throw new MeldInterpreterError(
              'Invalid directive node',
              'invalid_directive',
              convertLocation(node.location)
            );
          }
          const directiveNode = node as DirectiveNode;
          currentState = await this.directiveService.processDirective(directiveNode, {
            state: directiveState,
            currentFilePath: state.getCurrentFilePath() ?? undefined
          });
          break;

        default:
          throw new MeldInterpreterError(
            `Unknown node type: ${node.type}`,
            'unknown_node',
            convertLocation(node.location)
          );
      }

      return currentState;
    } catch (error) {
      // Preserve MeldInterpreterError or wrap other errors
      if (error instanceof MeldInterpreterError) {
        throw error;
      }
      throw new MeldInterpreterError(
        getErrorMessage(error),
        node.type,
        convertLocation(node.location),
        {
          cause: error instanceof Error ? error : undefined,
          context: {
            nodeType: node.type,
            location: convertLocation(node.location),
            state: {
              filePath: state.getCurrentFilePath() ?? undefined
            }
          }
        }
      );
    }
  }

  async createChildContext(
    parentState: IStateService,
    filePath?: string
  ): Promise<IStateService> {
    this.ensureInitialized();

    if (!parentState) {
      throw new MeldInterpreterError(
        'No parent state provided for child context creation',
        'context_creation'
      );
    }

    try {
      // Create child state from parent
      const childState = parentState.createChildState();

      if (!childState) {
        throw new MeldInterpreterError(
          'Failed to create child state',
          'context_creation',
          undefined,
          {
            context: {
              parentFilePath: parentState.getCurrentFilePath() ?? undefined
            }
          }
        );
      }

      // Set file path if provided
      if (filePath) {
        childState.setCurrentFilePath(filePath);
      }

      logger.debug('Created child context', {
        parentFilePath: parentState.getCurrentFilePath(),
        childFilePath: filePath,
        hasParent: true
      });

      return childState;
    } catch (error) {
      logger.error('Failed to create child context', {
        parentFilePath: parentState.getCurrentFilePath(),
        childFilePath: filePath,
        error
      });

      // Preserve MeldInterpreterError or wrap other errors
      if (error instanceof MeldInterpreterError) {
        throw error;
      }
      throw new MeldInterpreterError(
        getErrorMessage(error),
        'context_creation',
        undefined,
        {
          cause: error instanceof Error ? error : undefined,
          context: {
            parentFilePath: parentState.getCurrentFilePath() ?? undefined,
            childFilePath: filePath,
            state: {
              filePath: parentState.getCurrentFilePath() ?? undefined
            }
          }
        }
      );
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.directiveService || !this.stateService) {
      throw new MeldInterpreterError(
        'InterpreterService must be initialized before use',
        'initialization'
      );
    }
  }
}
```

# InterpreterService.unit.test.ts

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mocked } from 'vitest';
import { InterpreterService } from './InterpreterService.js';
import { DirectiveService } from '@services/pipeline/DirectiveService/DirectiveService.js';
import { StateService } from '@services/state/StateService/StateService.js';
import { MeldInterpreterError } from '@core/errors/MeldInterpreterError.js';
import { MeldNode, DirectiveNode as MeldDirective, TextNode, SourceLocation } from 'meld-spec';

// Mock dependencies
vi.mock('../../DirectiveService/DirectiveService');
vi.mock('../../StateService/StateService');

describe('InterpreterService Unit', () => {
  let service: InterpreterService;
  let mockDirectiveService: Mocked<DirectiveService>;
  let mockStateService: Mocked<StateService>;
  let mockChildState: Mocked<StateService>;

  beforeEach((): void => {
    // Clear all mocks
    vi.clearAllMocks();

    // Create mock child state with immutable state support
    mockChildState = {
      setCurrentFilePath: vi.fn(),
      getCurrentFilePath: vi.fn(),
      addNode: vi.fn(),
      mergeChildState: vi.fn(),
      clone: vi.fn().mockReturnThis(),
      getTextVar: vi.fn(),
      getDataVar: vi.fn(),
      getNodes: vi.fn().mockReturnValue([]),
      setImmutable: vi.fn(),
      setTextVar: vi.fn(),
      createChildState: vi.fn().mockReturnThis(),
      variables: {
        text: new Map(),
        data: new Map(),
        path: new Map()
      },
      commands: new Map(),
      imports: new Set(),
      nodes: [],
      filePath: undefined,
      parentState: undefined
    } as unknown as Mocked<StateService>;

    // Create mock instances
    mockDirectiveService = {
      initialize: vi.fn(),
      processDirective: vi.fn().mockResolvedValue(mockChildState),
      handleDirective: vi.fn(),
      validateDirective: vi.fn(),
      createChildContext: vi.fn(),
      processDirectives: vi.fn(),
      supportsDirective: vi.fn(),
      getSupportedDirectives: vi.fn(),
      updateInterpreterService: vi.fn(),
      registerHandler: vi.fn(),
      hasHandler: vi.fn()
    } as unknown as Mocked<DirectiveService>;

    mockStateService = {
      createChildState: vi.fn().mockReturnValue(mockChildState),
      addNode: vi.fn(),
      mergeStates: vi.fn(),
      setCurrentFilePath: vi.fn(),
      getCurrentFilePath: vi.fn(),
      getTextVar: vi.fn(),
      getDataVar: vi.fn(),
      getNodes: vi.fn().mockReturnValue([]),
      setImmutable: vi.fn(),
      setTextVar: vi.fn(),
      clone: vi.fn().mockReturnThis(),
      mergeChildState: vi.fn(),
      variables: {
        text: new Map(),
        data: new Map(),
        path: new Map()
      },
      commands: new Map(),
      imports: new Set(),
      nodes: [],
      filePath: undefined,
      parentState: undefined
    } as unknown as Mocked<StateService>;

    // Initialize service
    service = new InterpreterService();
    service.initialize(mockDirectiveService, mockStateService);
  });

  describe('initialization', () => {
    it('initializes with required services', (): void => {
      expect(service).toBeDefined();
      expect(service['directiveService']).toBe(mockDirectiveService);
      expect(service['stateService']).toBe(mockStateService);
    });

    it('throws if initialized without required services', async (): Promise<void> => {
      const uninitializedService = new InterpreterService();
      await expect(() => uninitializedService.interpret([])).rejects.toThrow('InterpreterService must be initialized before use');
    });
  });

  describe('node interpretation', () => {
    it('processes text nodes directly', async (): Promise<void> => {
      const textNode: TextNode = {
        type: 'Text',
        content: 'Hello world',
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 12 }
        }
      } as TextNode;

      await service.interpret([textNode]);
      expect(mockChildState.addNode).toHaveBeenCalledWith(textNode);
    });

    it('delegates directive nodes to directive service', async (): Promise<void> => {
      const directiveNode: MeldDirective = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'test',
          value: 'value'
        },
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 30 } }
      };

      mockChildState.getCurrentFilePath.mockReturnValue('test.meld');
      await service.interpret([directiveNode]);
      expect(mockDirectiveService.processDirective).toHaveBeenCalledWith(
        directiveNode,
        expect.objectContaining({
          state: expect.any(Object),
          currentFilePath: 'test.meld'
        })
      );

      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.directive.kind).toBe('text');
    });

    it('throws on unknown node types', async (): Promise<void> => {
      const unknownNode = {
        type: 'Unknown',
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 30 } }
      } as unknown as MeldNode;

      await expect(service.interpret([unknownNode])).rejects.toThrow(/unknown node type/i);
    });
  });

  describe('state management', () => {
    it('creates new state for each interpretation', async (): Promise<void> => {
      const nodes: MeldNode[] = [];
      await service.interpret(nodes);
      expect(mockStateService.createChildState).toHaveBeenCalled();
    });

    it('uses provided initial state when specified', async (): Promise<void> => {
      const nodes: MeldNode[] = [];
      const initialState = mockStateService;
      await service.interpret(nodes, { initialState });
      expect(mockStateService.createChildState).toHaveBeenCalled();
    });

    it('merges state when specified', async (): Promise<void> => {
      const nodes: MeldNode[] = [];
      const initialState = mockStateService;
      await service.interpret(nodes, {
        initialState,
        mergeState: true
      });
      expect(mockStateService.mergeChildState).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('wraps non-interpreter errors', async (): Promise<void> => {
      const error = new Error('Test error');
      mockDirectiveService.processDirective.mockRejectedValue(error);

      const directiveNode: MeldDirective = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'test',
          value: 'value'
        },
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 30 } }
      };

      await expect(service.interpret([directiveNode])).rejects.toBeInstanceOf(MeldInterpreterError);
    });

    it('preserves interpreter errors', async (): Promise<void> => {
      const error = new MeldInterpreterError('Test error', 'test');
      mockDirectiveService.processDirective.mockRejectedValue(error);

      const directiveNode: MeldDirective = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'test',
          value: 'value'
        },
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 30 } }
      };

      await expect(service.interpret([directiveNode])).rejects.toEqual(error);
    });

    it('includes node location in errors', async (): Promise<void> => {
      const error = new Error('Test error');
      mockDirectiveService.processDirective.mockRejectedValue(error);

      const directiveNode: MeldDirective = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'test',
          value: 'value'
        },
        location: { start: { line: 42, column: 10 }, end: { line: 42, column: 30 } }
      };

      try {
        await service.interpret([directiveNode]);
        expect.fail('Should have thrown error');
      } catch (e) {
        expect(e).toBeInstanceOf(MeldInterpreterError);
        if (e instanceof MeldInterpreterError && directiveNode.location) {
          expect(e.location).toEqual({
            line: directiveNode.location.start.line,
            column: directiveNode.location.start.column
          });
        }
      }
    });
  });

  describe('options handling', () => {
    it('sets file path in state when provided', async (): Promise<void> => {
      const nodes: MeldNode[] = [];
      await service.interpret(nodes, {
        filePath: 'test.meld'
      });
      expect(mockChildState.setCurrentFilePath).toHaveBeenCalledWith('test.meld');
    });

    it('passes options to directive service', async (): Promise<void> => {
      const directiveNode: MeldDirective = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'test',
          value: 'value'
        },
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 30 } }
      };

      const options = {
        filePath: 'test.meld'
      };

      mockChildState.getCurrentFilePath.mockReturnValue('test.meld');
      await service.interpret([directiveNode], options);
      expect(mockDirectiveService.processDirective).toHaveBeenCalledWith(
        directiveNode,
        expect.objectContaining({
          state: expect.any(Object),
          currentFilePath: 'test.meld'
        })
      );
    });
  });

  describe('child context creation', () => {
    it('creates child context with parent state', async () => {
      const parentState = mockStateService;
      const childState = await service.createChildContext(parentState);
      expect(mockStateService.createChildState).toHaveBeenCalled();
      expect(childState).toBeDefined();
    });

    it('sets file path in child context when provided', async () => {
      const parentState = mockStateService;
      const filePath = 'test.meld';
      const childState = await service.createChildContext(parentState, filePath);
      expect(mockChildState.setCurrentFilePath).toHaveBeenCalledWith(filePath);
    });

    it('handles errors in child context creation', async () => {
      const error = new Error('Test error');
      mockStateService.createChildState.mockImplementation(() => {
        throw error;
      });

      await expect(service.createChildContext(mockStateService))
        .rejects.toBeInstanceOf(MeldInterpreterError);
    });
  });

  describe('edge cases', () => {
    it('handles empty node arrays', async () => {
      const result = await service.interpret([]);
      expect(result).toBeDefined();
      expect(result.getNodes()).toHaveLength(0);
    });

    it('handles null/undefined nodes', async () => {
      await expect(service.interpret(null as unknown as MeldNode[]))
        .rejects.toThrow('No nodes provided for interpretation');
    });

    it('handles state initialization failures', async () => {
      mockStateService.createChildState.mockReturnValue(null as unknown as StateService);
      await expect(service.interpret([]))
        .rejects.toThrow('Failed to initialize state for interpretation');
    });

    it('handles directive service initialization failures', async () => {
      const directiveNode: MeldDirective = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'test',
          value: 'value'
        },
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 30 } }
      };

      // Initialize with state service but no directive service
      service = new InterpreterService();
      service.initialize(mockDirectiveService, mockStateService);
      service['directiveService'] = undefined;

      await expect(service.interpret([directiveNode]))
        .rejects.toThrow('InterpreterService must be initialized before use');
    });

    it('preserves node order in state', async () => {
      const nodes: MeldNode[] = [
        {
          type: 'Text',
          content: 'first',
          location: {
            start: { line: 1, column: 1 },
            end: { line: 1, column: 6 }
          }
        } as TextNode,
        {
          type: 'Text',
          content: 'second',
          location: {
            start: { line: 2, column: 1 },
            end: { line: 2, column: 7 }
          }
        } as TextNode
      ];

      mockChildState.getNodes.mockReturnValue(nodes);
      const result = await service.interpret(nodes);
      const resultNodes = result.getNodes();
      expect(resultNodes).toHaveLength(2);
      expect(resultNodes[0].type).toBe('Text');
      expect((resultNodes[0] as TextNode).content).toBe('first');
      expect(resultNodes[1].type).toBe('Text');
      expect((resultNodes[1] as TextNode).content).toBe('second');
    });

    it('handles state rollback on partial failures', async () => {
      const nodes: MeldNode[] = [
        {
          type: 'Text',
          content: 'first',
          location: {
            start: { line: 1, column: 1 },
            end: { line: 1, column: 6 }
          }
        } as TextNode,
        {
          type: 'Directive',
          directive: {
            kind: 'text',
            identifier: 'test',
            value: 'value'
          },
          location: { start: { line: 2, column: 1 }, end: { line: 2, column: 30 } }
        } as MeldDirective,
        {
          type: 'Text',
          content: 'third',
          location: {
            start: { line: 3, column: 1 },
            end: { line: 3, column: 6 }
          }
        } as TextNode
      ];

      mockDirectiveService.processDirective.mockRejectedValue(new Error('Test error'));

      try {
        await service.interpret(nodes);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(MeldInterpreterError);
        const state = mockStateService.createChildState();
        expect(state.getNodes()).toHaveLength(0);
      }
    });
  });
});
```

# IOutputService.ts

```typescript
import type { MeldNode } from 'meld-spec';
import type { IStateService } from '@services/state/StateService/IStateService.js';

export type OutputFormat = 'markdown' | 'llm';

export interface OutputOptions {
  /**
   * Whether to include state variables in the output
   * @default false
   */
  includeState?: boolean;

  /**
   * Whether to preserve original formatting (whitespace, newlines)
   * @default true
   */
  preserveFormatting?: boolean;

  /**
   * Custom format-specific options
   */
  formatOptions?: Record<string, unknown>;
}

export interface IOutputService {
  /**
   * Convert Meld nodes and state to the specified output format.
   * If state.isTransformationEnabled() is true and state.getTransformedNodes() is available,
   * the transformed nodes will be used instead of the input nodes.
   *
   * In non-transformation mode:
   * - Definition directives (@text, @data, @path, @import, @define) are omitted
   * - Execution directives (@run, @embed) show placeholders
   *
   * In transformation mode:
   * - All directives are replaced with their transformed results
   * - Plain text and code fences are preserved as-is
   *
   * @throws {MeldOutputError} If conversion fails
   */
  convert(
    nodes: MeldNode[],
    state: IStateService,
    format: OutputFormat,
    options?: OutputOptions
  ): Promise<string>;

  /**
   * Register a custom format converter
   */
  registerFormat(
    format: string,
    converter: (nodes: MeldNode[], state: IStateService, options?: OutputOptions) => Promise<string>
  ): void;

  /**
   * Check if a format is supported
   */
  supportsFormat(format: string): boolean;

  /**
   * Get a list of all supported formats
   */
  getSupportedFormats(): string[];
}
```

# OutputService.test.ts

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OutputService } from './OutputService.js';
import { MeldOutputError } from '@core/errors/MeldOutputError.js';
import type { MeldNode } from 'meld-spec';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService, ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import {
  createTextNode,
  createDirectiveNode,
  createCodeFenceNode,
  createLocation
} from '../../../tests/utils/testFactories.js';

// Mock StateService
class MockStateService implements IStateService {
  private textVars = new Map<string, string>();
  private dataVars = new Map<string, unknown>();
  private pathVars = new Map<string, string>();
  private commands = new Map<string, { command: string; options?: Record<string, unknown> }>();
  private nodes: MeldNode[] = [];
  private transformationEnabled = false;
  private transformedNodes: MeldNode[] = [];
  private imports = new Set<string>();
  private filePath: string | null = null;
  private _isImmutable = false;

  getAllTextVars(): Map<string, string> {
    return new Map(this.textVars);
  }

  getAllDataVars(): Map<string, unknown> {
    return new Map(this.dataVars);
  }

  getAllPathVars(): Map<string, string> {
    return new Map(this.pathVars);
  }

  getAllCommands(): Map<string, { command: string; options?: Record<string, unknown> }> {
    return new Map(this.commands);
  }

  setTextVar(name: string, value: string): void {
    this.textVars.set(name, value);
  }

  setDataVar(name: string, value: unknown): void {
    this.dataVars.set(name, value);
  }

  setPathVar(name: string, value: string): void {
    this.pathVars.set(name, value);
  }

  setCommand(name: string, command: string | { command: string; options?: Record<string, unknown> }): void {
    const cmdDef = typeof command === 'string' ? { command } : command;
    this.commands.set(name, cmdDef);
  }

  isTransformationEnabled(): boolean {
    return this.transformationEnabled;
  }

  enableTransformation(enable: boolean = true): void {
    this.transformationEnabled = enable;
  }

  getTransformedNodes(): MeldNode[] {
    if (this.transformationEnabled) {
      return this.transformedNodes.length > 0 ? [...this.transformedNodes] : [...this.nodes];
    }
    return [...this.nodes];
  }

  transformNode(original: MeldNode, transformed: MeldNode): void {
    const index = this.transformedNodes.indexOf(original);
    if (index >= 0) {
      this.transformedNodes[index] = transformed;
    }
  }

  setTransformedNodes(nodes: MeldNode[]): void {
    this.transformedNodes = [...nodes];
  }

  getNodes(): MeldNode[] {
    return [...this.nodes];
  }

  addNode(node: MeldNode): void {
    this.nodes.push(node);
  }

  appendContent(content: string): void {
    this.nodes.push({ type: 'Text', content } as TextNode);
  }

  addImport(path: string): void {
    this.imports.add(path);
  }

  removeImport(path: string): void {
    this.imports.delete(path);
  }

  hasImport(path: string): boolean {
    return this.imports.has(path);
  }

  getImports(): Set<string> {
    return new Set(this.imports);
  }

  getCurrentFilePath(): string | null {
    return this.filePath;
  }

  setCurrentFilePath(path: string): void {
    this.filePath = path;
  }

  hasLocalChanges(): boolean {
    return true;
  }

  getLocalChanges(): string[] {
    return ['state'];
  }

  setImmutable(): void {
    this._isImmutable = true;
  }

  get isImmutable(): boolean {
    return this._isImmutable;
  }

  createChildState(): IStateService {
    const child = new MockStateService();
    child.textVars = new Map(this.textVars);
    child.dataVars = new Map(this.dataVars);
    child.pathVars = new Map(this.pathVars);
    child.commands = new Map(this.commands);
    child.nodes = [...this.nodes];
    child.transformationEnabled = this.transformationEnabled;
    child.transformedNodes = [...this.transformedNodes];
    child.imports = new Set(this.imports);
    child.filePath = this.filePath;
    child._isImmutable = this._isImmutable;
    return child;
  }

  mergeChildState(childState: IStateService): void {
    const child = childState as MockStateService;
    // Merge all state
    for (const [key, value] of child.textVars) {
      this.textVars.set(key, value);
    }
    for (const [key, value] of child.dataVars) {
      this.dataVars.set(key, value);
    }
    for (const [key, value] of child.pathVars) {
      this.pathVars.set(key, value);
    }
    for (const [key, value] of child.commands) {
      this.commands.set(key, value);
    }
    this.nodes.push(...child.nodes);
    if (child.transformationEnabled) {
      this.transformationEnabled = true;
      this.transformedNodes.push(...child.transformedNodes);
    }
    for (const imp of child.imports) {
      this.imports.add(imp);
    }
  }

  clone(): IStateService {
    const cloned = new MockStateService();
    cloned.textVars = new Map(this.textVars);
    cloned.dataVars = new Map(this.dataVars);
    cloned.pathVars = new Map(this.pathVars);
    cloned.commands = new Map(this.commands);
    cloned.nodes = [...this.nodes];
    cloned.transformationEnabled = this.transformationEnabled;
    cloned.transformedNodes = [...this.transformedNodes];
    cloned.imports = new Set(this.imports);
    cloned.filePath = this.filePath;
    cloned._isImmutable = this._isImmutable;
    return cloned;
  }

  // Required interface methods
  getTextVar(name: string): string | undefined { return this.textVars.get(name); }
  getDataVar(name: string): unknown | undefined { return this.dataVars.get(name); }
  getCommand(name: string): { command: string; options?: Record<string, unknown> } | undefined { return this.commands.get(name); }
  getPathVar(name: string): string | undefined { return this.pathVars.get(name); }
  getLocalTextVars(): Map<string, string> { return new Map(this.textVars); }
  getLocalDataVars(): Map<string, unknown> { return new Map(this.dataVars); }
}

// Mock ResolutionService
class MockResolutionService implements IResolutionService {
  async resolveInContext(value: string, context: ResolutionContext): Promise<string> {
    // For testing, just return the value as is
    return value;
  }

  // Add other required methods with empty implementations
  resolveText(): Promise<string> { return Promise.resolve(''); }
  resolveData(): Promise<any> { return Promise.resolve(null); }
  resolvePath(): Promise<string> { return Promise.resolve(''); }
  resolveCommand(): Promise<string> { return Promise.resolve(''); }
  resolveFile(): Promise<string> { return Promise.resolve(''); }
  resolveContent(): Promise<string> { return Promise.resolve(''); }
  validateResolution(): Promise<void> { return Promise.resolve(); }
  extractSection(): Promise<string> { return Promise.resolve(''); }
  detectCircularReferences(): Promise<void> { return Promise.resolve(); }
}

describe('OutputService', () => {
  let service: OutputService;
  let state: IStateService;
  let resolutionService: IResolutionService;

  beforeEach(() => {
    state = new MockStateService();
    resolutionService = new MockResolutionService();
    service = new OutputService(resolutionService);
  });

  describe('Format Registration', () => {
    it('should have default formats registered', () => {
      expect(service.supportsFormat('markdown')).toBe(true);
      expect(service.supportsFormat('llm')).toBe(true);
    });

    it('should allow registering custom formats', async () => {
      const customConverter = async () => 'custom';
      service.registerFormat('custom', customConverter);
      expect(service.supportsFormat('custom')).toBe(true);
    });

    it('should throw on invalid format registration', () => {
      expect(() => service.registerFormat('', async () => '')).toThrow();
      expect(() => service.registerFormat('test', null as any)).toThrow();
    });

    it('should list supported formats', () => {
      const formats = service.getSupportedFormats();
      expect(formats).toContain('markdown');
      expect(formats).toContain('llm');
    });
  });

  describe('Markdown Output', () => {
    it('should convert text nodes to markdown', async () => {
      const nodes: MeldNode[] = [
        createTextNode('Hello world\n', createLocation(1, 1))
      ];

      const output = await service.convert(nodes, state, 'markdown');
      expect(output).toBe('Hello world\n');
    });

    it('should handle directive nodes according to type', async () => {
      // Definition directive
      const defNodes: MeldNode[] = [
        createDirectiveNode('text', { identifier: 'test', value: 'example' }, createLocation(1, 1))
      ];
      let output = await service.convert(defNodes, state, 'markdown');
      expect(output).toBe(''); // Definition directives are omitted

      // Execution directive
      const execNodes: MeldNode[] = [
        createDirectiveNode('run', { command: 'echo test' }, createLocation(1, 1))
      ];
      output = await service.convert(execNodes, state, 'markdown');
      expect(output).toBe('echo test\n');
    });

    it('should include state variables when requested', async () => {
      state.setTextVar('greeting', 'hello');
      state.setDataVar('count', 42);

      const nodes: MeldNode[] = [
        createTextNode('Content', createLocation(1, 1))
      ];

      const output = await service.convert(nodes, state, 'markdown', {
        includeState: true
      });

      expect(output).toContain('# Text Variables');
      expect(output).toContain('@text greeting = "hello"');
      expect(output).toContain('# Data Variables');
      expect(output).toContain('@data count = 42');
      expect(output).toContain('Content');
    });

    it('should respect preserveFormatting option', async () => {
      const nodes: MeldNode[] = [
        createTextNode('\n  Hello  \n  World  \n', createLocation(1, 1))
      ];

      const preserved = await service.convert(nodes, state, 'markdown', {
        preserveFormatting: true
      });
      expect(preserved).toBe('\n  Hello  \n  World  \n');

      const cleaned = await service.convert(nodes, state, 'markdown', {
        preserveFormatting: false
      });
      expect(cleaned).toBe('Hello  \n  World');
    });
  });

  describe('LLM XML Output', () => {
    it('should preserve text content', async () => {
      const nodes: MeldNode[] = [
        createTextNode('Hello world', createLocation(1, 1))
      ];

      const output = await service.convert(nodes, state, 'llm');
      expect(output).toContain('Hello world');
    });

    it('should preserve code fence content', async () => {
      const nodes: MeldNode[] = [
        createCodeFenceNode('const x = 1;', 'typescript', createLocation(1, 1))
      ];

      const output = await service.convert(nodes, state, 'llm');
      expect(output).toContain('const x = 1;');
      expect(output).toContain('typescript');
    });

    it('should handle directives according to type', async () => {
      // Definition directive
      const defNodes: MeldNode[] = [
        createDirectiveNode('text', { identifier: 'test', value: 'example' }, createLocation(1, 1))
      ];
      let output = await service.convert(defNodes, state, 'llm');
      expect(output).toBe(''); // Definition directives are omitted

      // Execution directive
      const execNodes: MeldNode[] = [
        createDirectiveNode('run', { command: 'echo test' }, createLocation(1, 1))
      ];
      output = await service.convert(execNodes, state, 'llm');
      expect(output).toContain('echo test');
    });

    it('should preserve state variables when requested', async () => {
      state.setTextVar('greeting', 'hello');
      state.setDataVar('count', 42);

      const nodes: MeldNode[] = [
        createTextNode('Content', createLocation(1, 1))
      ];

      const output = await service.convert(nodes, state, 'llm', {
        includeState: true
      });

      expect(output).toContain('greeting');
      expect(output).toContain('hello');
      expect(output).toContain('count');
      expect(output).toContain('42');
      expect(output).toContain('Content');
    });
  });

  describe('Transformation Mode', () => {
    it('should use transformed nodes when transformation is enabled', async () => {
      const originalNodes: MeldNode[] = [
        createDirectiveNode('run', { command: 'echo test' }, createLocation(1, 1))
      ];

      const transformedNodes: MeldNode[] = [
        createTextNode('test output\n', createLocation(1, 1))
      ];

      state.enableTransformation();
      state.setTransformedNodes(transformedNodes);

      const output = await service.convert(originalNodes, state, 'markdown');
      expect(output).toBe('test output\n');
    });

    it('should handle mixed content in transformation mode', async () => {
      const originalNodes: MeldNode[] = [
        createTextNode('Before\n', createLocation(1, 1)),
        createDirectiveNode('run', { command: 'echo test' }, createLocation(2, 1)),
        createTextNode('After\n', createLocation(3, 1))
      ];

      const transformedNodes: MeldNode[] = [
        createTextNode('Before\n', createLocation(1, 1)),
        createTextNode('test output\n', createLocation(2, 1)),
        createTextNode('After\n', createLocation(3, 1))
      ];

      state.enableTransformation();
      state.setTransformedNodes(transformedNodes);

      const output = await service.convert(originalNodes, state, 'markdown');
      expect(output).toBe('Before\ntest output\nAfter\n');
    });

    it('should handle definition directives in non-transformation mode', async () => {
      const nodes: MeldNode[] = [
        createTextNode('Before\n', createLocation(1, 1)),
        createDirectiveNode('text', { identifier: 'test', value: 'example' }, createLocation(2, 1)),
        createTextNode('After\n', createLocation(3, 1))
      ];

      const output = await service.convert(nodes, state, 'markdown');
      expect(output).toBe('Before\nAfter\n');
    });

    it('should show placeholders for execution directives in non-transformation mode', async () => {
      const nodes: MeldNode[] = [
        createTextNode('Before\n', createLocation(1, 1)),
        createDirectiveNode('run', { command: 'echo test' }, createLocation(2, 1)),
        createTextNode('After\n', createLocation(3, 1))
      ];

      const output = await service.convert(nodes, state, 'markdown');
      expect(output).toBe('Before\necho test\nAfter\n');
    });

    it('should preserve code fences in both modes', async () => {
      const codeFence = createCodeFenceNode('const x = 1;', 'typescript', createLocation(1, 1));

      // Non-transformation mode
      let output = await service.convert([codeFence], state, 'markdown');
      expect(output).toBe('```typescript\nconst x = 1;\n```\n');

      // Transformation mode
      state.enableTransformation();
      state.setTransformedNodes([codeFence]);
      output = await service.convert([codeFence], state, 'markdown');
      expect(output).toBe('```typescript\nconst x = 1;\n```\n');
    });

    it('should handle LLM output in both modes', async () => {
      const originalNodes: MeldNode[] = [
        createTextNode('Before\n', createLocation(1, 1)),
        createDirectiveNode('run', { command: 'echo test' }, createLocation(2, 1)),
        createTextNode('After\n', createLocation(3, 1))
      ];

      // Non-transformation mode
      let output = await service.convert(originalNodes, state, 'llm');
      expect(output).toContain('Before');
      expect(output).toContain('echo test');
      expect(output).toContain('After');

      // Transformation mode
      const transformedNodes: MeldNode[] = [
        createTextNode('Before\n', createLocation(1, 1)),
        createTextNode('test output\n', createLocation(2, 1)),
        createTextNode('After\n', createLocation(3, 1))
      ];

      state.enableTransformation();
      state.setTransformedNodes(transformedNodes);
      output = await service.convert(originalNodes, state, 'llm');
      expect(output).toContain('Before');
      expect(output).toContain('test output');
      expect(output).toContain('After');
    });
  });

  describe('Error Handling', () => {
    it('should throw MeldOutputError for unsupported formats', async () => {
      await expect(service.convert([], state, 'invalid' as any))
        .rejects
        .toThrow(MeldOutputError);
    });

    it('should throw MeldOutputError for unknown node types', async () => {
      const nodes = [{ type: 'unknown' }] as any[];
      await expect(service.convert(nodes, state, 'markdown'))
        .rejects
        .toThrow(MeldOutputError);
    });

    it('should wrap errors from format converters', async () => {
      service.registerFormat('error', async () => {
        throw new Error('Test error');
      });

      await expect(service.convert([], state, 'error'))
        .rejects
        .toThrow(MeldOutputError);
    });

    it('should preserve MeldOutputError when thrown from converters', async () => {
      service.registerFormat('error', async () => {
        throw new MeldOutputError('Test error', 'error');
      });

      await expect(service.convert([], state, 'error'))
        .rejects
        .toThrow(MeldOutputError);
    });
  });
});
```

# OutputService.ts

```typescript
import type { IStateService } from '@services/state/StateService/IStateService.js';
import { IOutputService, type OutputFormat, type OutputOptions } from './IOutputService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { MeldNode, TextNode, CodeFenceNode, DirectiveNode } from 'meld-spec';
import { outputLogger as logger } from '@core/utils/logger.js';
import { MeldOutputError } from '@core/errors/MeldOutputError.js';

type FormatConverter = (
  nodes: MeldNode[],
  state: IStateService,
  options?: OutputOptions
) => Promise<string>;

const DEFAULT_OPTIONS: Required<OutputOptions> = {
  includeState: false,
  preserveFormatting: true,
  formatOptions: {}
};

export class OutputService implements IOutputService {
  private formatters = new Map<string, FormatConverter>();

  constructor() {
    // Register default formatters
    this.registerFormat('markdown', this.convertToMarkdown.bind(this));
    this.registerFormat('md', this.convertToMarkdown.bind(this));
    this.registerFormat('llm', this.convertToLLMXML.bind(this));

    logger.debug('OutputService initialized with default formatters', {
      formats: Array.from(this.formatters.keys())
    });
  }

  async convert(
    nodes: MeldNode[],
    state: IStateService,
    format: OutputFormat,
    options?: OutputOptions
  ): Promise<string> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    logger.debug('Converting output', {
      format,
      nodeCount: nodes.length,
      options: opts
    });

    // Use transformed nodes if transformation is enabled
    const transformedNodes = state.getTransformedNodes();
    const nodesToProcess = state.isTransformationEnabled() && transformedNodes !== undefined
      ? transformedNodes
      : nodes;

    const formatter = this.formatters.get(format);
    if (!formatter) {
      throw new MeldOutputError(`Unsupported format: ${format}`, format);
    }

    try {
      const result = await formatter(nodesToProcess, state, opts);

      logger.debug('Successfully converted output', {
        format,
        resultLength: result.length
      });

      return result;
    } catch (error) {
      logger.error('Failed to convert output', {
        format,
        error
      });

      if (error instanceof MeldOutputError) {
        throw error;
      }

      throw new MeldOutputError(
        'Failed to convert output',
        format,
        error instanceof Error ? error : undefined
      );
    }
  }

  registerFormat(
    format: string,
    converter: FormatConverter
  ): void {
    if (!format || typeof format !== 'string') {
      throw new Error('Format must be a non-empty string');
    }
    if (typeof converter !== 'function') {
      throw new Error('Converter must be a function');
    }

    this.formatters.set(format, converter);
    logger.debug('Registered format converter', { format });
  }

  supportsFormat(format: string): boolean {
    return this.formatters.has(format);
  }

  getSupportedFormats(): string[] {
    return Array.from(this.formatters.keys());
  }

  private async convertToMarkdown(
    nodes: MeldNode[],
    state: IStateService,
    options?: OutputOptions
  ): Promise<string> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    try {
      let output = '';

      // Add state variables if requested
      if (opts.includeState) {
        output += this.formatStateVariables(state);
        if (nodes.length > 0) {
          output += '\n\n';
        }
      }

      // Process nodes
      for (const node of nodes) {
        output += await this.nodeToMarkdown(node, state);
      }

      // Clean up extra newlines if not preserving formatting
      if (!opts.preserveFormatting) {
        output = output.replace(/\n{3,}/g, '\n\n').trim();
      }

      return output;
    } catch (error) {
      throw new MeldOutputError(
        'Failed to convert to markdown',
        'markdown',
        error instanceof Error ? error : undefined
      );
    }
  }

  private async convertToLLMXML(
    nodes: MeldNode[],
    state: IStateService,
    options?: OutputOptions
  ): Promise<string> {
    try {
      // First convert to markdown since LLM XML is based on markdown
      const markdown = await this.convertToMarkdown(nodes, state, options);

      // Convert markdown to LLM XML
      const { createLLMXML } = await import('llmxml');
      const llmxml = createLLMXML();
      return llmxml.toXML(markdown);
    } catch (error) {
      throw new MeldOutputError(
        'Failed to convert to LLM XML',
        'llm',
        error instanceof Error ? error : undefined
      );
    }
  }

  private formatStateVariables(state: IStateService): string {
    let output = '';

    // Format text variables
    const textVars = state.getAllTextVars();
    if (textVars.size > 0) {
      output += '# Text Variables\n\n';
      for (const [name, value] of textVars) {
        output += `@text ${name} = "${value}"\n`;
      }
    }

    // Format data variables
    const dataVars = state.getAllDataVars();
    if (dataVars.size > 0) {
      if (output) output += '\n';
      output += '# Data Variables\n\n';
      for (const [name, value] of dataVars) {
        output += `@data ${name} = ${JSON.stringify(value, null, 2)}\n`;
      }
    }

    return output;
  }

  private async nodeToMarkdown(node: MeldNode, state: IStateService): Promise<string> {
    switch (node.type) {
      case 'Text':
        return (node as TextNode).content;
      case 'CodeFence':
        const fence = node as CodeFenceNode;
        return `\`\`\`${fence.language || ''}\n${fence.content}\n\`\`\`\n`;
      case 'Directive':
        const directive = node as DirectiveNode;
        if (state.isTransformationEnabled()) {
          // In transformation mode, we should never see directives
          // They should have been transformed into Text or CodeFence nodes
          throw new MeldOutputError('Unexpected directive in transformation mode', 'markdown');
        } else {
          // In non-transformation mode:
          // - For run directives, show the command
          // - For definition directives, return empty string
          // - For other execution directives, show placeholder
          if (directive.directive.kind === 'run') {
            return directive.directive.command + '\n';
          } else if (['text', 'data', 'path', 'import', 'define'].includes(directive.directive.kind)) {
            return '';
          } else if (['embed'].includes(directive.directive.kind)) {
            return '[directive output placeholder]\n';
          }
        }
        return '';
      default:
        throw new MeldOutputError(`Unknown node type: ${node.type}`, 'markdown');
    }
  }

  private async nodeToLLM(node: MeldNode, state: IStateService): Promise<string> {
    switch (node.type) {
      case 'Text':
        return (node as TextNode).content;
      case 'CodeFence':
        const fence = node as CodeFenceNode;
        return `\`\`\`${fence.language || ''}\n${fence.content}\n\`\`\`\n`;
      case 'Directive':
        const directive = node as DirectiveNode;
        if (state.isTransformationEnabled()) {
          // In transformation mode, we should never see directives
          // They should have been transformed into Text or CodeFence nodes
          throw new MeldOutputError('Unexpected directive in transformation mode', 'llm');
        } else {
          // In non-transformation mode:
          // - For run directives, show the command
          // - For definition directives, return empty string
          // - For other execution directives, show placeholder
          if (directive.directive.kind === 'run') {
            return directive.directive.command + '\n';
          } else if (['text', 'data', 'path', 'import', 'define'].includes(directive.directive.kind)) {
            return '';
          } else if (['embed'].includes(directive.directive.kind)) {
            return '[directive output placeholder]\n';
          }
        }
        return '';
      default:
        throw new MeldOutputError(`Unknown node type: ${node.type}`, 'llm');
    }
  }

  private codeFenceToMarkdown(node: CodeFenceNode): string {
    return `\`\`\`${node.language || ''}\n${node.content}\n\`\`\`\n`;
  }

  private codeFenceToLLM(node: CodeFenceNode): string {
    // Implementation of codeFenceToLLM method
    throw new Error('Method not implemented');
  }

  private directiveToMarkdown(node: DirectiveNode): string {
    const kind = node.directive.kind;
    if (['text', 'data', 'path', 'import', 'define'].includes(kind)) {
      return '';
    }
    if (kind === 'run') {
      const command = node.directive.command;
      return `${command}\n`;
    }
    // For other execution directives, return empty string for now
    return '';
  }

  private directiveToLLM(node: DirectiveNode): string {
    // Implementation of directiveToLLM method
    throw new Error('Method not implemented');
  }
}
```

# IParserService.ts

```typescript
import type { MeldNode } from 'meld-spec';

export interface IParserService {
  /**
   * Parse Meld content into an AST using meld-ast.
   * @param content The Meld content to parse
   * @returns A promise that resolves to an array of MeldNodes representing the AST
   * @throws {MeldParseError} If the content cannot be parsed
   */
  parse(content: string): Promise<MeldNode[]>;

  /**
   * Parse Meld content and provide location information for each node.
   * This is useful for error reporting and source mapping.
   * @param content The Meld content to parse
   * @param filePath Optional file path for better error messages
   * @returns A promise that resolves to an array of MeldNodes with location information
   * @throws {MeldParseError} If the content cannot be parsed
   */
  parseWithLocations(content: string, filePath?: string): Promise<MeldNode[]>;
}
```

# ParserService.test.ts

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ParserService } from './ParserService.js';
import { MeldParseError } from '@core/errors/MeldParseError.js';
import type { MeldNode, DirectiveNode, TextNode, CodeFenceNode } from 'meld-spec';
import type { Location, Position } from '@core/types/index.js';

// Define a type that combines the meld-spec Location with our filePath
type LocationWithFilePath = {
  start: { line: number | undefined; column: number | undefined };
  end: { line: number | undefined; column: number | undefined };
  filePath?: string;
};

// Helper function to create test locations
function createTestLocation(startLine: number | undefined, startColumn: number | undefined, endLine: number | undefined, endColumn: number | undefined, filePath?: string): LocationWithFilePath {
  return {
    start: { line: startLine, column: startColumn },
    end: { line: endLine, column: endColumn },
    filePath
  };
}

// Type guard for Location
function isLocation(value: any): value is LocationWithFilePath {
  return (
    value &&
    typeof value === 'object' &&
    'start' in value &&
    'end' in value &&
    'filePath' in value
  );
}

// Type guard for checking if a location has a filePath
function hasFilePath(location: any): location is LocationWithFilePath {
  return (
    location &&
    typeof location === 'object' &&
    'start' in location &&
    'end' in location &&
    'filePath' in location
  );
}

describe('ParserService', () => {
  let service: ParserService;

  beforeEach(() => {
    service = new ParserService();
  });

  describe('parse', () => {
    it('should parse text content', async () => {
      const content = 'Hello world';
      const mockResult = [{
        type: 'Text',
        content: 'Hello world',
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 12 }
        }
      }];

      const result = await service.parse(content);
      expect(result).toEqual(mockResult);
    });

    it('should parse directive content', async () => {
      const content = '@text greeting = "Hello"';
      const mockResult = [{
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'greeting',
          source: 'literal',
          value: 'Hello'
        },
        location: {
          start: { line: 1, column: 2 },
          end: { line: 1, column: 25 }
        }
      }];

      const result = await service.parse(content);
      expect(result).toEqual(mockResult);
    });

    it('should parse code fence content', async () => {
      const content = '```typescript\nconst x = 42;\nconsole.log(x);\n```';
      const result = await service.parse(content);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('CodeFence');
      expect((result[0] as CodeFenceNode).language).toBe('typescript');
      expect((result[0] as CodeFenceNode).content).toBe('```typescript\nconst x = 42;\nconsole.log(x);\n```');
    });

    it('should parse code fence without language', async () => {
      const content = '```\nplain text\n```';
      const result = await service.parse(content);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('CodeFence');
      expect((result[0] as CodeFenceNode).language).toBeUndefined();
      expect((result[0] as CodeFenceNode).content).toBe('```\nplain text\n```');
    });

    it('should preserve whitespace in code fences', async () => {
      const content = '```\n  indented\n    more indented\n```';
      const result = await service.parse(content);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('CodeFence');
      expect((result[0] as CodeFenceNode).content).toBe('```\n  indented\n    more indented\n```');
    });

    it('should treat directives as literal text in code fences', async () => {
      const content = '```\n@text greeting = "Hello"\n@run [echo test]\n```';
      const result = await service.parse(content);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('CodeFence');
      expect((result[0] as CodeFenceNode).content).toBe('```\n@text greeting = "Hello"\n@run [echo test]\n```');
    });

    it('should handle nested code fences', async () => {
      const content = '````\nouter\n```\ninner\n```\n````';
      const result = await service.parse(content);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('CodeFence');
      expect((result[0] as CodeFenceNode).content).toBe('````\nouter\n```\ninner\n```\n````');
    });

    it('should parse code fences with equal backtick counts', async () => {
      const content = '```\nouter\n```\ninner\n```\n```';
      const result = await service.parse(content);

      expect(result).toHaveLength(3);
      expect(result[0].type).toBe('CodeFence');
      expect((result[0] as CodeFenceNode).content).toBe('```\nouter\n```');
      expect(result[1].type).toBe('Text');
      expect((result[1] as TextNode).content).toBe('inner\n');
      expect(result[2].type).toBe('CodeFence');
      expect((result[2] as CodeFenceNode).content).toBe('```\n\n```');
    });

    it('should parse mixed content', async () => {
      const content = 'Hello world\n@text greeting = "Hi"\nMore text';
      const mockResult = [
        {
          type: 'Text',
          content: 'Hello world\n',
          location: {
            start: { line: 1, column: 1 },
            end: { line: 2, column: 1 }
          }
        },
        {
          type: 'Directive',
          directive: {
            kind: 'text',
            identifier: 'greeting',
            source: 'literal',
            value: 'Hi'
          },
          location: {
            start: { line: 2, column: 2 },
            end: { line: 2, column: 22 }
          }
        },
        {
          type: 'Text',
          content: '\nMore text',
          location: {
            start: { line: 2, column: 22 },
            end: { line: 3, column: 10 }
          }
        }
      ];

      const result = await service.parse(content);
      expect(result).toEqual(mockResult);
    });

    it('should handle empty content', async () => {
      const result = await service.parse('');
      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });

    it('should throw MeldParseError with location for invalid directive', async () => {
      const content = '@invalid xyz';

      await expect(service.parse(content)).rejects.toThrow(MeldParseError);
      await expect(service.parse(content)).rejects.toThrow('Parse error: Parse error: Expected "data", "define", "embed", "import", "path", "run", "text", or "var" but "i" found.');
    });

    it('should throw MeldParseError for malformed directive', async () => {
      const content = '@text greeting = "unclosed string';

      await expect(service.parse(content)).rejects.toThrow(MeldParseError);
      await expect(service.parse(content)).rejects.toThrow('Parse error: Parse error: Expected "\\"" or any character but end of input found.');
    });
  });

  describe('parseWithLocations', () => {
    it('should include file path in locations', async () => {
      const content = 'Hello\n@text greeting = "Hi"';
      const mockResult = [
        {
          type: 'Text',
          content: 'Hello\n',
          location: { start: { line: 1, column: 1 }, end: { line: 2, column: 1 }, filePath: 'test.meld' }
        } as unknown as TextNode,
        {
          type: 'Directive',
          directive: {
            kind: 'text',
            identifier: 'greeting',
            source: 'literal',
            value: 'Hi'
          },
          location: { start: { line: 2, column: 2 }, end: { line: 2, column: 22 }, filePath: 'test.meld' }
        } as unknown as DirectiveNode
      ];

      const filePath = 'test.meld';
      const resultWithFilePath = await service.parseWithLocations(content, filePath);
      expect(resultWithFilePath).toEqual(mockResult);
    });

    it('should preserve original locations when adding filePath', async () => {
      const content = '@text greeting = "Hi"';
      const filePath = 'test.meld';

      const result = await service.parseWithLocations(content, filePath);

      expect(result[0].location).toEqual({
        start: { line: 1, column: 2 },
        end: { line: 1, column: 22 },
        filePath
      });
    });

    it('should include filePath in error for invalid content', async () => {
      const content = '@invalid xyz';
      const filePath = 'test.meld';

      await expect(service.parseWithLocations(content, filePath)).rejects.toThrow(MeldParseError);
      await expect(service.parseWithLocations(content, filePath)).rejects.toThrow('Parse error: Parse error: Expected "data", "define", "embed", "import", "path", "run", "text", or "var" but "i" found.');
    });
  });

  describe('error handling', () => {
    it('should handle unknown errors gracefully', async () => {
      const content = 'content';
      const result = await service.parse(content);
      expect(result).toEqual([{
        type: 'Text',
        content: 'content',
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 8 }
        }
      }]);
    });

    it('should preserve MeldParseError instances', async () => {
      const content = '@invalid';
      await expect(service.parse(content)).rejects.toThrow(MeldParseError);
    });
  });
});
```

# ParserService.ts

```typescript
import { IParserService } from './IParserService.js';
import type { MeldNode, CodeFenceNode } from 'meld-spec';
import { parserLogger as logger } from '@core/utils/logger.js';
import { MeldParseError } from '@core/errors/MeldParseError.js';
import type { Location, Position } from '@core/types/index.js';

// Define our own ParseError type since it's not exported from meld-ast
interface ParseError {
  message: string;
  location: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
}

interface MeldAstError {
  message: string;
  location?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  toString(): string;
}

function isMeldAstError(error: unknown): error is MeldAstError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as any).toString === 'function'
  );
}

export class ParserService implements IParserService {
  private async parseContent(content: string): Promise<MeldNode[]> {
    try {
      const { parse } = await import('meld-ast');
      const options = {
        failFast: true,
        trackLocations: true,
        validateNodes: true,
        preserveCodeFences: true,
        validateCodeFences: true,
        onError: (error: unknown) => {
          if (isMeldAstError(error)) {
            logger.warn('Parse warning', { error: error.toString() });
          }
        }
      };

      const result = await parse(content, options);

      // Validate code fence nesting
      this.validateCodeFences(result.ast || []);

      // Log any non-fatal errors
      if (result.errors && result.errors.length > 0) {
        result.errors.forEach(error => {
          if (isMeldAstError(error)) {
            logger.warn('Parse warning', { error: error.toString() });
          }
        });
      }

      return result.ast || [];
    } catch (error) {
      if (isMeldAstError(error)) {
        // Preserve original error message and location
        throw new MeldParseError(
          error.message,
          error.location || { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }
        );
      }
      // For unknown errors, provide a generic message
      throw new MeldParseError(
        'Parse error: Unknown error occurred',
        { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }
      );
    }
  }

  public async parse(content: string): Promise<MeldNode[]> {
    return this.parseContent(content);
  }

  public async parseWithLocations(content: string, filePath?: string): Promise<MeldNode[]> {
    const nodes = await this.parseContent(content);
    if (!filePath) {
      return nodes;
    }

    return nodes.map(node => {
      if (node.location) {
        // Preserve exact column numbers from original location
        return {
          ...node,
          location: {
            ...node.location,  // Preserve all original location properties
            filePath          // Only add filePath
          }
        };
      }
      return node;
    });
  }

  private isParseError(error: unknown): error is ParseError {
    return (
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      'location' in error &&
      typeof error.location === 'object' &&
      error.location !== null &&
      'start' in error.location &&
      'end' in error.location
    );
  }

  private validateCodeFences(nodes: MeldNode[]): void {
    // Validate that code fences are closed with exactly the same number of backticks
    for (const node of nodes) {
      if (node.type === 'CodeFence') {
        const codeFence = node as CodeFenceNode;
        const content = codeFence.content;

        // Extract opening and closing backticks
        const openMatch = content.match(/^(`+)/);
        const closeMatch = content.match(/\n(`+)$/);

        if (!openMatch || !closeMatch) {
          throw new MeldParseError(
            'Invalid code fence: missing opening or closing backticks',
            node.location || { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }
          );
        }

        const openTicks = openMatch[1];
        const closeTicks = closeMatch[1];

        if (openTicks.length !== closeTicks.length) {
          throw new MeldParseError(
            `Code fence must be closed with exactly ${openTicks.length} backticks, got ${closeTicks.length}`,
            node.location || { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }
          );
        }
      }
    }
  }
}
```

# IStateEventService.ts

```typescript
/**
 * @package
 * Core event system for state tracking.
 *
 * @remarks
 * Provides event emission and handling for state operations.
 */

/**
 * Core state event types as defined in the instrumentation plan
 */
export type StateEventType = 'create' | 'clone' | 'transform' | 'merge' | 'error';

/**
 * Base state event interface
 */
export interface StateEvent {
  type: StateEventType;
  stateId: string;
  source: string;
  timestamp: number;
  location?: {
    file?: string;
    line?: number;
    column?: number;
  };
}

/**
 * Event handler function type
 */
export type StateEventHandler = (event: StateEvent) => void | Promise<void>;

/**
 * Event filter predicate
 */
export type StateEventFilter = (event: StateEvent) => boolean;

/**
 * Handler registration options
 */
export interface StateEventHandlerOptions {
  filter?: StateEventFilter;
}

/**
 * Core state event service interface
 */
export interface IStateEventService {
  /**
   * Register an event handler with optional filtering
   */
  on(type: StateEventType, handler: StateEventHandler, options?: StateEventHandlerOptions): void;

  /**
   * Remove an event handler
   */
  off(type: StateEventType, handler: StateEventHandler): void;

  /**
   * Emit a state event
   */
  emit(event: StateEvent): Promise<void>;

  /**
   * Get all registered handlers for an event type
   */
  getHandlers(type: StateEventType): Array<{
    handler: StateEventHandler;
    options?: StateEventHandlerOptions;
  }>;
}
```

# StateEventService.test.ts

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StateEventService } from './StateEventService.js';
import type { StateEvent, StateEventHandler } from './IStateEventService.js';

describe('StateEventService', () => {
  let service: StateEventService;

  beforeEach(() => {
    service = new StateEventService();
  });

  it('should register and emit events', async () => {
    const handler = vi.fn();
    const event: StateEvent = {
      type: 'create',
      stateId: 'test-state',
      source: 'test',
      timestamp: Date.now()
    };

    service.on('create', handler);
    await service.emit(event);

    expect(handler).toHaveBeenCalledWith(event);
  });

  it('should support multiple handlers for same event type', async () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    const event: StateEvent = {
      type: 'transform',
      stateId: 'test-state',
      source: 'test',
      timestamp: Date.now()
    };

    service.on('transform', handler1);
    service.on('transform', handler2);
    await service.emit(event);

    expect(handler1).toHaveBeenCalledWith(event);
    expect(handler2).toHaveBeenCalledWith(event);
  });

  it('should remove handlers correctly', async () => {
    const handler = vi.fn();
    const event: StateEvent = {
      type: 'clone',
      stateId: 'test-state',
      source: 'test',
      timestamp: Date.now()
    };

    service.on('clone', handler);
    service.off('clone', handler);
    await service.emit(event);

    expect(handler).not.toHaveBeenCalled();
  });

  it('should apply filters correctly', async () => {
    const handler = vi.fn();
    const event: StateEvent = {
      type: 'transform',
      stateId: 'test-state',
      source: 'test',
      timestamp: Date.now()
    };

    // Only handle events with stateId starting with 'test'
    service.on('transform', handler, {
      filter: (e) => e.stateId.startsWith('test')
    });

    await service.emit(event); // Should be handled
    expect(handler).toHaveBeenCalledWith(event);

    await service.emit({
      ...event,
      stateId: 'other-state'
    }); // Should be filtered out
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should handle async handlers', async () => {
    const result: string[] = [];
    const asyncHandler1: StateEventHandler = async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      result.push('handler1');
    };
    const asyncHandler2: StateEventHandler = async () => {
      await new Promise(resolve => setTimeout(resolve, 5));
      result.push('handler2');
    };

    service.on('merge', asyncHandler1);
    service.on('merge', asyncHandler2);

    await service.emit({
      type: 'merge',
      stateId: 'test-state',
      source: 'test',
      timestamp: Date.now()
    });

    expect(result).toEqual(['handler1', 'handler2']);
  });

  it('should continue processing handlers after error', async () => {
    const errorHandler = vi.fn().mockRejectedValue(new Error('test error'));
    const successHandler = vi.fn();
    const event: StateEvent = {
      type: 'error',
      stateId: 'test-state',
      source: 'test',
      timestamp: Date.now()
    };

    service.on('error', errorHandler);
    service.on('error', successHandler);

    await service.emit(event);

    expect(errorHandler).toHaveBeenCalled();
    expect(successHandler).toHaveBeenCalled();
  });

  it('should throw on invalid event type', () => {
    const handler = vi.fn();
    // @ts-expect-error Testing invalid event type
    expect(() => service.on('invalid' as any, handler)).toThrow('Invalid event type');
  });

  it('should return registered handlers', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    const options = { filter: (e: StateEvent) => e.stateId === 'test' };

    service.on('create', handler1);
    service.on('create', handler2, options);

    const handlers = service.getHandlers('create');
    expect(handlers).toHaveLength(2);
    expect(handlers[0].handler).toBe(handler1);
    expect(handlers[1].handler).toBe(handler2);
    expect(handlers[1].options).toBe(options);
  });
});
```

# StateEventService.ts

```typescript
import { IStateEventService, StateEvent, StateEventType, StateEventHandler, StateEventHandlerOptions } from './IStateEventService.js';
import { stateLogger as logger } from '@core/utils/logger.js';

/**
 * @package
 * Core event system implementation for state tracking.
 *
 * @remarks
 * Provides event emission and handling for state operations.
 * Implements filtering and async event handling.
 */
export class StateEventService implements IStateEventService {
  private handlers: Map<StateEventType, Array<{
    handler: StateEventHandler;
    options?: StateEventHandlerOptions;
  }>> = new Map();

  constructor() {
    // Initialize handler arrays for each event type
    const eventTypes: StateEventType[] = ['create', 'clone', 'transform', 'merge', 'error'];
    eventTypes.forEach(type => this.handlers.set(type, []));
  }

  /**
   * Register an event handler with optional filtering
   */
  on(type: StateEventType, handler: StateEventHandler, options?: StateEventHandlerOptions): void {
    const handlers = this.handlers.get(type);
    if (!handlers) {
      throw new Error(`Invalid event type: ${type}`);
    }

    handlers.push({ handler, options });
    logger.debug(`Registered handler for ${type} events`, {
      type,
      hasFilter: !!options?.filter
    });
  }

  /**
   * Remove an event handler
   */
  off(type: StateEventType, handler: StateEventHandler): void {
    const handlers = this.handlers.get(type);
    if (!handlers) {
      throw new Error(`Invalid event type: ${type}`);
    }

    const index = handlers.findIndex(h => h.handler === handler);
    if (index !== -1) {
      handlers.splice(index, 1);
      logger.debug(`Removed handler for ${type} events`);
    }
  }

  /**
   * Emit a state event
   */
  async emit(event: StateEvent): Promise<void> {
    const handlers = this.handlers.get(event.type);
    if (!handlers) {
      throw new Error(`Invalid event type: ${event.type}`);
    }

    logger.debug(`Emitting ${event.type} event`, {
      stateId: event.stateId,
      source: event.source
    });

    // Group handlers by their filter conditions to prevent duplicate processing
    const handlerGroups = new Map<string, Array<{ handler: StateEventHandler; options?: StateEventHandlerOptions }>>();

    for (const handlerEntry of handlers) {
      // Create a key based on the filter condition
      const filterKey = handlerEntry.options?.filter ?
        `${event.source}-${event.stateId}-${event.location?.file || ''}` :
        'no-filter';

      const group = handlerGroups.get(filterKey) || [];
      group.push(handlerEntry);
      handlerGroups.set(filterKey, group);
    }

    // Process each group once
    for (const [_, groupHandlers] of handlerGroups) {
      // Only execute if the first handler's filter passes
      const firstHandler = groupHandlers[0];
      if (firstHandler.options?.filter && !firstHandler.options.filter(event)) {
        continue;
      }

      // Execute all handlers in the group
      for (const { handler } of groupHandlers) {
        try {
          await Promise.resolve(handler(event));
        } catch (error) {
          // Log error but continue processing other handlers
          logger.error(`Error in ${event.type} event handler`, {
            error: error instanceof Error ? error.message : String(error),
            stateId: event.stateId
          });
        }
      }
    }
  }

  /**
   * Get all registered handlers for an event type
   */
  getHandlers(type: StateEventType): Array<{
    handler: StateEventHandler;
    options?: StateEventHandlerOptions;
  }> {
    const handlers = this.handlers.get(type);
    if (!handlers) {
      throw new Error(`Invalid event type: ${type}`);
    }
    return [...handlers];
  }
}
```

# StateInstrumentation.test.ts

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StateEventService } from './StateEventService.js';
import type { StateEvent, StateEventType } from './IStateEventService.js';

describe('State Instrumentation', () => {
  describe('Event Ordering', () => {
    it('should maintain event order during state lifecycle', async () => {
      const events: StateEvent[] = [];
      const service = new StateEventService();

      // Record all events in order
      service.on('create', e => events.push(e));
      service.on('transform', e => events.push(e));
      service.on('clone', e => events.push(e));
      service.on('merge', e => events.push(e));

      // Simulate a typical state lifecycle
      await service.emit({
        type: 'create',
        stateId: 'parent',
        source: 'test',
        timestamp: 1
      });

      await service.emit({
        type: 'transform',
        stateId: 'parent',
        source: 'test',
        timestamp: 2
      });

      await service.emit({
        type: 'clone',
        stateId: 'child',
        source: 'test',
        timestamp: 3
      });

      await service.emit({
        type: 'merge',
        stateId: 'parent',
        source: 'test',
        timestamp: 4
      });

      // Verify event order
      expect(events.map(e => e.type)).toEqual(['create', 'transform', 'clone', 'merge']);
      expect(events.map(e => e.timestamp)).toEqual([1, 2, 3, 4]);
    });
  });

  describe('Event Filtering', () => {
    it('should support complex filtering patterns', async () => {
      const service = new StateEventService();
      const results: string[] = [];

      // Filter for specific state transitions
      service.on('transform', e => {
        results.push(`transform:${e.stateId}`);
      }, {
        filter: e => e.stateId.startsWith('test-')
      });

      // Filter for specific sources
      service.on('transform', e => {
        results.push(`source:${e.source}`);
      }, {
        filter: e => e.source === 'variable-update'
      });

      // Filter based on location
      service.on('transform', e => {
        results.push(`file:${e.location?.file}`);
      }, {
        filter: e => e.location?.file === 'test.meld'
      });

      // Emit test events
      await service.emit({
        type: 'transform',
        stateId: 'test-1',
        source: 'variable-update',
        timestamp: Date.now(),
        location: { file: 'test.meld' }
      });

      await service.emit({
        type: 'transform',
        stateId: 'other',
        source: 'variable-update',
        timestamp: Date.now(),
        location: { file: 'other.meld' }
      });

      expect(results).toEqual([
        'transform:test-1',
        'source:variable-update',
        'file:test.meld'
      ]);
    });
  });

  describe('Error Handling', () => {
    it('should handle errors in event handlers without affecting others', async () => {
      const service = new StateEventService();
      const results: string[] = [];

      // Add a handler that will error
      service.on('error', () => {
        throw new Error('Handler error');
      });

      // Add handlers that should still execute
      service.on('error', () => {
        results.push('handler1');
      });
      service.on('error', () => {
        results.push('handler2');
      });

      await service.emit({
        type: 'error',
        stateId: 'test',
        source: 'test',
        timestamp: Date.now()
      });

      expect(results).toEqual(['handler1', 'handler2']);
    });
  });

  describe('Event Context', () => {
    it('should maintain complete event context through handlers', async () => {
      const service = new StateEventService();
      let capturedEvent: StateEvent | undefined;

      service.on('transform', event => {
        capturedEvent = event;
      });

      const testEvent: StateEvent = {
        type: 'transform',
        stateId: 'test',
        source: 'variable-update',
        timestamp: Date.now(),
        location: {
          file: 'test.meld',
          line: 42,
          column: 10
        }
      };

      await service.emit(testEvent);

      expect(capturedEvent).toEqual(testEvent);
      expect(capturedEvent?.location).toEqual(testEvent.location);
    });
  });

  describe('Event Type Safety', () => {
    it('should enforce valid event types', () => {
      const service = new StateEventService();
      const handler = vi.fn();

      // These should all be type-safe and not throw
      const validTypes: StateEventType[] = ['create', 'clone', 'transform', 'merge', 'error'];
      validTypes.forEach(type => {
        expect(() => service.on(type, handler)).not.toThrow();
      });

      // @ts-expect-error Testing invalid event type
      expect(() => service.on('invalid' as StateEventType, handler))
        .toThrow('Invalid event type');
    });
  });

  describe('Handler Management', () => {
    it('should properly manage handler lifecycle', () => {
      const service = new StateEventService();
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      // Add handlers
      service.on('create', handler1);
      service.on('create', handler2);

      // Verify both are registered
      expect(service.getHandlers('create')).toHaveLength(2);

      // Remove one handler
      service.off('create', handler1);

      // Verify only one remains
      const remainingHandlers = service.getHandlers('create');
      expect(remainingHandlers).toHaveLength(1);
      expect(remainingHandlers[0].handler).toBe(handler2);
    });
  });

  describe('Async Handler Execution', () => {
    it('should handle mixed sync/async handlers correctly', async () => {
      const service = new StateEventService();
      const results: string[] = [];

      // Add mix of sync and async handlers
      service.on('transform', () => {
        results.push('sync1');
      });

      service.on('transform', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        results.push('async1');
      });

      service.on('transform', () => {
        results.push('sync2');
      });

      service.on('transform', async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
        results.push('async2');
      });

      await service.emit({
        type: 'transform',
        stateId: 'test',
        source: 'test',
        timestamp: Date.now()
      });

      // Verify handlers executed in order
      expect(results).toEqual(['sync1', 'async1', 'sync2', 'async2']);
    });
  });
});
```

# IStateService.ts

```typescript
import type { MeldNode } from 'meld-spec';
import type { IStateEventService } from '../StateEventService/IStateEventService.js';
import type { IStateTrackingService } from '../../../tests/utils/debug/StateTrackingService/IStateTrackingService.js';

export interface IStateService {
  // Event system
  setEventService(eventService: IStateEventService): void;

  // State tracking
  setTrackingService(trackingService: IStateTrackingService): void;
  getStateId(): string | undefined;

  // Text variables
  getTextVar(name: string): string | undefined;
  setTextVar(name: string, value: string): void;
  getAllTextVars(): Map<string, string>;
  getLocalTextVars(): Map<string, string>;

  // Data variables
  getDataVar(name: string): unknown;
  setDataVar(name: string, value: unknown): void;
  getAllDataVars(): Map<string, unknown>;
  getLocalDataVars(): Map<string, unknown>;

  // Path variables
  getPathVar(name: string): string | undefined;
  setPathVar(name: string, value: string): void;
  getAllPathVars(): Map<string, string>;

  // Commands
  getCommand(name: string): { command: string; options?: Record<string, unknown> } | undefined;
  setCommand(name: string, command: string | { command: string; options?: Record<string, unknown> }): void;
  getAllCommands(): Map<string, { command: string; options?: Record<string, unknown> }>;

  // Nodes
  getNodes(): MeldNode[];
  addNode(node: MeldNode): void;
  appendContent(content: string): void;

  // Node transformation
  getTransformedNodes(): MeldNode[];
  setTransformedNodes(nodes: MeldNode[]): void;
  transformNode(original: MeldNode, transformed: MeldNode): void;
  isTransformationEnabled(): boolean;
  enableTransformation(enable: boolean): void;

  // Imports
  addImport(path: string): void;
  removeImport(path: string): void;
  hasImport(path: string): boolean;
  getImports(): Set<string>;

  // File path
  getCurrentFilePath(): string | null;
  setCurrentFilePath(path: string): void;

  // State management
  hasLocalChanges(): boolean;
  getLocalChanges(): string[];
  setImmutable(): void;
  readonly isImmutable: boolean;
  createChildState(): IStateService;
  mergeChildState(childState: IStateService): void;
  clone(): IStateService;
}
```

# StateFactory.test.ts

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { StateFactory } from './StateFactory.js';
import type { StateNode } from './types.js';

describe('StateFactory', () => {
  let factory: StateFactory;

  beforeEach(() => {
    factory = new StateFactory();
  });

  describe('createState', () => {
    it('should create an empty state', () => {
      const state = factory.createState();

      expect(state.variables.text.size).toBe(0);
      expect(state.variables.data.size).toBe(0);
      expect(state.variables.path.size).toBe(0);
      expect(state.imports.size).toBe(0);
      expect(state.nodes.length).toBe(0);
      expect(state.filePath).toBeUndefined();
      expect(state.parentState).toBeUndefined();
    });

    it('should create state with options', () => {
      const parent = factory.createState();
      const state = factory.createState({
        parentState: parent,
        filePath: '/test/file.md',
        source: 'test'
      });

      expect(state.parentState).toBe(parent);
      expect(state.filePath).toBe('/test/file.md');
    });

    it('should inherit parent state', () => {
      // Create parent with some state
      const parentBase = factory.createState();
      const parent = factory.updateState(parentBase, {
        variables: {
          text: new Map([['inherited', 'value']]),
          data: new Map([['config', { inherited: true }]]),
          path: new Map([['root', '/parent']])
        },
        imports: new Set(['parent.md']),
        nodes: [{ type: 'text', value: 'parent' } as any]
      });

      // Create child state
      const child = factory.createState({ parentState: parent });

      // Verify inheritance
      expect(child.variables.text.get('inherited')).toBe('value');
      expect(child.variables.data.get('config')).toEqual({ inherited: true });
      expect(child.variables.path.get('root')).toBe('/parent');
      expect(child.imports.has('parent.md')).toBe(true);
      expect(child.nodes[0].value).toBe('parent');
    });
  });

  describe('createChildState', () => {
    it('should create child state with parent reference', () => {
      const parent = factory.createState();
      const child = factory.createChildState(parent);

      expect(child.parentState).toBe(parent);
    });

    it('should create empty child state that inherits parent values', () => {
      // Create parent with some state
      const parentBase = factory.createState();
      const parent = factory.updateState(parentBase, {
        variables: {
          text: new Map([['text', 'parent']]),
          data: new Map([['data', { value: 'parent' }]]),
          path: new Map([['path', '/parent']])
        }
      });

      const child = factory.createChildState(parent);

      // Verify child inherits parent values
      expect(child.variables.text.get('text')).toBe('parent');
      expect(child.variables.data.get('data')).toEqual({ value: 'parent' });
      expect(child.variables.path.get('path')).toBe('/parent');
    });
  });

  describe('mergeStates', () => {
    it('should merge variables from child to parent', () => {
      // Create parent state
      const parentBase = factory.createState();
      const parent = factory.updateState(parentBase, {
        variables: {
          text: new Map([['parentText', 'parent']]),
          data: new Map([['parentData', { value: 'parent' }]]),
          path: new Map([['parentPath', '/parent']])
        }
      });

      // Create child state
      const childBase = factory.createState();
      const child = factory.updateState(childBase, {
        variables: {
          text: new Map([['childText', 'child']]),
          data: new Map([['childData', { value: 'child' }]]),
          path: new Map([['childPath', '/child']])
        }
      });

      const merged = factory.mergeStates(parent, child);

      // Check merged variables
      expect(merged.variables.text.get('parentText')).toBe('parent');
      expect(merged.variables.text.get('childText')).toBe('child');
      expect(merged.variables.data.get('parentData')).toEqual({ value: 'parent' });
      expect(merged.variables.data.get('childData')).toEqual({ value: 'child' });
      expect(merged.variables.path.get('parentPath')).toBe('/parent');
      expect(merged.variables.path.get('childPath')).toBe('/child');
    });

    it('should override parent variables with child values', () => {
      // Create parent state
      const parentBase = factory.createState();
      const parent = factory.updateState(parentBase, {
        variables: {
          text: new Map([['text', 'parent']])
        }
      });

      // Create child state
      const childBase = factory.createState();
      const child = factory.updateState(childBase, {
        variables: {
          text: new Map([['text', 'child']])
        }
      });

      const merged = factory.mergeStates(parent, child);

      expect(merged.variables.text.get('text')).toBe('child');
      // Verify parent state wasn't modified
      expect(parent.variables.text.get('text')).toBe('parent');
    });

    it('should merge imports and nodes', () => {
      // Create parent state
      const parentBase = factory.createState();
      const parent = factory.updateState(parentBase, {
        imports: new Set(['parent.md']),
        nodes: [{ type: 'text', value: 'parent' } as any]
      });

      // Create child state
      const childBase = factory.createState();
      const child = factory.updateState(childBase, {
        imports: new Set(['child.md']),
        nodes: [{ type: 'text', value: 'child' } as any]
      });

      const merged = factory.mergeStates(parent, child);

      expect(merged.imports.has('parent.md')).toBe(true);
      expect(merged.imports.has('child.md')).toBe(true);
      expect(merged.nodes).toHaveLength(2);
      expect(merged.nodes[0].value).toBe('parent');
      expect(merged.nodes[1].value).toBe('child');

      // Verify original states weren't modified
      expect(parent.imports.size).toBe(1);
      expect(child.imports.size).toBe(1);
      expect(parent.nodes).toHaveLength(1);
      expect(child.nodes).toHaveLength(1);
    });
  });

  describe('updateState', () => {
    it('should update state with new values', () => {
      const initial = factory.createState();
      const updates: Partial<StateNode> = {
        filePath: '/updated/file.md',
        variables: {
          text: new Map([['text', 'updated']]),
          data: new Map([['data', { value: 'updated' }]]),
          path: new Map([['path', '/updated']])
        }
      };

      const updated = factory.updateState(initial, updates);

      expect(updated.filePath).toBe('/updated/file.md');
      expect(updated.variables.text.get('text')).toBe('updated');
      expect(updated.variables.data.get('data')).toEqual({ value: 'updated' });
      expect(updated.variables.path.get('path')).toBe('/updated');

      // Verify original state wasn't modified
      expect(initial.variables.text.size).toBe(0);
      expect(initial.variables.data.size).toBe(0);
      expect(initial.variables.path.size).toBe(0);
    });

    it('should preserve unmodified values', () => {
      // Create initial state with some values
      const baseState = factory.createState();
      const initial = factory.updateState(baseState, {
        variables: {
          text: new Map([['preserved', 'value']])
        }
      });

      const updates: Partial<StateNode> = {
        filePath: '/updated/file.md'
      };

      const updated = factory.updateState(initial, updates);

      expect(updated.filePath).toBe('/updated/file.md');
      expect(updated.variables.text.get('preserved')).toBe('value');

      // Verify values are copied, not referenced
      expect(updated.variables.text).not.toBe(initial.variables.text);
    });
  });
});
```

# StateFactory.ts

```typescript
import type { StateNode, StateNodeOptions, IStateFactory, StateOperation } from './types.js';
import { stateLogger as logger } from '@core/utils/logger.js';
import { randomUUID } from 'crypto';

export class StateFactory implements IStateFactory {
  private operations: StateOperation[] = [];

  createState(options?: StateNodeOptions): StateNode {
    const state: StateNode = {
      stateId: randomUUID(),
      variables: {
        text: new Map(options?.parentState?.variables.text ?? []),
        data: new Map(options?.parentState?.variables.data ?? []),
        path: new Map(options?.parentState?.variables.path ?? [])
      },
      commands: new Map(options?.parentState?.commands ?? []),
      imports: new Set(options?.parentState?.imports ?? []),
      nodes: [...(options?.parentState?.nodes ?? [])],
      transformedNodes: options?.parentState?.transformedNodes ? [...options.parentState.transformedNodes] : undefined,
      filePath: options?.filePath ?? options?.parentState?.filePath,
      parentState: options?.parentState
    };

    this.logOperation({
      type: 'create',
      timestamp: Date.now(),
      source: options?.source ?? 'createState',
      details: {
        operation: 'createState',
        value: state
      }
    });

    return state;
  }

  createChildState(parent: StateNode, options?: StateNodeOptions): StateNode {
    const child = this.createState({
      ...options,
      parentState: parent,
      source: options?.source ?? 'createChildState'
    });

    this.logOperation({
      type: 'create',
      timestamp: Date.now(),
      source: options?.source ?? 'createChildState',
      details: {
        operation: 'createChildState',
        value: child
      }
    });

    return child;
  }

  mergeStates(parent: StateNode, child: StateNode): StateNode {
    // Create new maps with parent values as base
    const text = new Map(parent.variables.text);
    const data = new Map(parent.variables.data);
    const path = new Map(parent.variables.path);
    const commands = new Map(parent.commands);

    // Merge child variables - last write wins
    for (const [key, value] of child.variables.text) {
      text.set(key, value);
    }
    for (const [key, value] of child.variables.data) {
      data.set(key, value);
    }
    for (const [key, value] of child.variables.path) {
      path.set(key, value);
    }
    for (const [key, value] of child.commands) {
      commands.set(key, value);
    }

    // Create new state with merged values
    const merged: StateNode = {
      variables: {
        text,
        data,
        path
      },
      commands,
      imports: new Set([...parent.imports, ...child.imports]),
      // Preserve node order by appending all child nodes
      nodes: [...parent.nodes, ...child.nodes],
      // Merge transformed nodes if either parent or child has them
      transformedNodes: child.transformedNodes !== undefined ? [...child.transformedNodes] :
                       parent.transformedNodes !== undefined ? [...parent.transformedNodes] :
                       undefined,
      filePath: child.filePath ?? parent.filePath,
      parentState: parent.parentState,
      // Preserve parent's stateId to maintain identity
      stateId: parent.stateId,
      source: 'merge'
    };

    this.logOperation({
      type: 'merge',
      timestamp: Date.now(),
      source: 'mergeStates',
      details: {
        operation: 'mergeStates',
        value: merged
      }
    });

    return merged;
  }

  updateState(state: StateNode, updates: Partial<StateNode>): StateNode {
    const updated: StateNode = {
      stateId: state.stateId,
      variables: {
        text: updates.variables?.text ?? new Map(state.variables.text),
        data: updates.variables?.data ?? new Map(state.variables.data),
        path: updates.variables?.path ?? new Map(state.variables.path)
      },
      commands: updates.commands ?? new Map(state.commands),
      imports: new Set(updates.imports ?? state.imports),
      nodes: [...(updates.nodes ?? state.nodes)],
      transformedNodes: updates.transformedNodes !== undefined ? [...updates.transformedNodes] : state.transformedNodes,
      filePath: updates.filePath ?? state.filePath,
      parentState: updates.parentState ?? state.parentState
    };

    this.logOperation({
      type: 'update',
      timestamp: Date.now(),
      source: 'updateState',
      details: {
        operation: 'updateState',
        value: updated
      }
    });

    return updated;
  }

  private logOperation(operation: StateOperation): void {
    this.operations.push(operation);
    logger.debug('State operation', operation);
  }
}
```

# StateService.test.ts

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StateService } from './StateService.js';
import type { MeldNode } from 'meld-spec';
import type { IStateEventService, StateEvent } from '../StateEventService/IStateEventService.js';
import type { IStateTrackingService } from '@tests/utils/debug/StateTrackingService/IStateTrackingService.js';
import { StateTrackingService } from '@tests/utils/debug/StateTrackingService/StateTrackingService.js';
import { StateVisualizationService } from '@tests/utils/debug/StateVisualizationService/StateVisualizationService.js';
import { StateDebuggerService } from '@tests/utils/debug/StateDebuggerService/StateDebuggerService.js';
import { StateHistoryService } from '@tests/utils/debug/StateHistoryService/StateHistoryService.js';

class MockStateEventService implements IStateEventService {
  private handlers = new Map<string, Array<{
    handler: (event: StateEvent) => void | Promise<void>;
    options?: { filter?: (event: StateEvent) => boolean };
  }>>();

  constructor() {
    ['create', 'clone', 'transform', 'merge', 'error'].forEach(type => {
      this.handlers.set(type, []);
    });
  }

  on(type: string, handler: (event: StateEvent) => void | Promise<void>, options?: { filter?: (event: StateEvent) => boolean }): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      handlers.push({ handler, options });
    }
  }

  off(type: string, handler: (event: StateEvent) => void | Promise<void>): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      const index = handlers.findIndex(h => h.handler === handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  async emit(event: StateEvent): Promise<void> {
    const handlers = this.handlers.get(event.type) || [];
    for (const { handler, options } of handlers) {
      if (!options?.filter || options.filter(event)) {
        await Promise.resolve(handler(event));
      }
    }
  }

  getHandlers(type: string): Array<{
    handler: (event: StateEvent) => void | Promise<void>;
    options?: { filter?: (event: StateEvent) => boolean };
  }> {
    return this.handlers.get(type) || [];
  }
}

describe('StateService', () => {
  let state: StateService;
  let eventService: MockStateEventService;

  beforeEach(() => {
    eventService = new MockStateEventService();
    state = new StateService();
    state.setEventService(eventService);
  });

  describe('text variables', () => {
    it('should set and get text variables', () => {
      state.setTextVar('greeting', 'Hello');
      expect(state.getTextVar('greeting')).toBe('Hello');
    });

    it('should return undefined for non-existent text variables', () => {
      expect(state.getTextVar('nonexistent')).toBeUndefined();
    });

    it('should get all text variables', () => {
      state.setTextVar('greeting', 'Hello');
      state.setTextVar('farewell', 'Goodbye');

      const vars = state.getAllTextVars();
      expect(vars.size).toBe(2);
      expect(vars.get('greeting')).toBe('Hello');
      expect(vars.get('farewell')).toBe('Goodbye');
    });

    it('should get local text variables', () => {
      state.setTextVar('local', 'value');
      expect(state.getLocalTextVars().get('local')).toBe('value');
    });
  });

  describe('data variables', () => {
    it('should set and get data variables', () => {
      const data = { foo: 'bar' };
      state.setDataVar('config', data);
      expect(state.getDataVar('config')).toEqual(data);
    });

    it('should return undefined for non-existent data variables', () => {
      expect(state.getDataVar('nonexistent')).toBeUndefined();
    });

    it('should get all data variables', () => {
      state.setDataVar('config1', { foo: 'bar' });
      state.setDataVar('config2', { baz: 'qux' });

      const vars = state.getAllDataVars();
      expect(vars.size).toBe(2);
      expect(vars.get('config1')).toEqual({ foo: 'bar' });
      expect(vars.get('config2')).toEqual({ baz: 'qux' });
    });

    it('should get local data variables', () => {
      state.setDataVar('local', { value: true });
      expect(state.getLocalDataVars().get('local')).toEqual({ value: true });
    });
  });

  describe('path variables', () => {
    it('should set and get path variables', () => {
      state.setPathVar('root', '/path/to/root');
      expect(state.getPathVar('root')).toBe('/path/to/root');
    });

    it('should return undefined for non-existent path variables', () => {
      expect(state.getPathVar('nonexistent')).toBeUndefined();
    });

    it('should get all path variables', () => {
      state.setPathVar('root', '/root');
      state.setPathVar('temp', '/tmp');

      const vars = state.getAllPathVars();
      expect(vars.size).toBe(2);
      expect(vars.get('root')).toBe('/root');
      expect(vars.get('temp')).toBe('/tmp');
    });
  });

  describe('commands', () => {
    it('should set and get commands', () => {
      state.setCommand('test', 'echo test');
      expect(state.getCommand('test')).toEqual({ command: 'echo test' });
    });

    it('should set and get commands with options', () => {
      state.setCommand('test', { command: 'echo test', options: { silent: true } });
      expect(state.getCommand('test')).toEqual({ command: 'echo test', options: { silent: true } });
    });

    it('should get all commands', () => {
      state.setCommand('cmd1', 'echo 1');
      state.setCommand('cmd2', 'echo 2');

      const commands = state.getAllCommands();
      expect(commands.size).toBe(2);
      expect(commands.get('cmd1')).toEqual({ command: 'echo 1' });
      expect(commands.get('cmd2')).toEqual({ command: 'echo 2' });
    });
  });

  describe('nodes', () => {
    it('should add and get nodes', () => {
      const node: MeldNode = {
        type: 'text',
        value: 'test',
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 4 } }
      };
      state.addNode(node);
      expect(state.getNodes()).toEqual([node]);
    });

    it('should append content as text node', () => {
      state.appendContent('test content');
      const nodes = state.getNodes();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].type).toBe('Text');
      expect(nodes[0].content).toBe('test content');
    });
  });

  describe('imports', () => {
    it('should add and check imports', () => {
      state.addImport('test.md');
      expect(state.hasImport('test.md')).toBe(true);
    });

    it('should remove imports', () => {
      state.addImport('test.md');
      state.removeImport('test.md');
      expect(state.hasImport('test.md')).toBe(false);
    });

    it('should get all imports', () => {
      state.addImport('file1.md');
      state.addImport('file2.md');

      const imports = state.getImports();
      expect(imports.size).toBe(2);
      expect(imports.has('file1.md')).toBe(true);
      expect(imports.has('file2.md')).toBe(true);
    });
  });

  describe('file path', () => {
    it('should set and get current file path', () => {
      state.setCurrentFilePath('/test/file.md');
      expect(state.getCurrentFilePath()).toBe('/test/file.md');
    });

    it('should return null when no file path is set', () => {
      expect(state.getCurrentFilePath()).toBeNull();
    });
  });

  describe('event emission', () => {
    it('should emit create event when creating child state', () => {
      const handler = vi.fn();
      eventService.on('create', handler);

      state.setCurrentFilePath('test.meld');
      const child = state.createChildState();

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        type: 'create',
        source: 'createChildState',
        location: {
          file: 'test.meld'
        }
      }));
    });

    it('should emit clone event when cloning state', () => {
      const handler = vi.fn();
      eventService.on('clone', handler);

      state.setCurrentFilePath('test.meld');
      const cloned = state.clone();

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        type: 'clone',
        source: 'clone',
        location: {
          file: 'test.meld'
        }
      }));
    });

    it('should emit merge event when merging child state', () => {
      const handler = vi.fn();
      eventService.on('merge', handler);

      state.setCurrentFilePath('test.meld');
      const child = state.createChildState();
      state.mergeChildState(child);

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        type: 'merge',
        source: 'mergeChildState',
        location: {
          file: 'test.meld'
        }
      }));
    });

    it('should emit transform event for state updates', () => {
      const handler = vi.fn();
      eventService.on('transform', handler);

      state.setCurrentFilePath('test.meld');
      state.setTextVar('test', 'value');

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        type: 'transform',
        source: 'setTextVar:test',
        location: {
          file: 'test.meld'
        }
      }));
    });

    it('should inherit event service in child states', () => {
      const handler = vi.fn();
      eventService.on('transform', handler);

      const child = state.createChildState();
      child.setTextVar('test', 'value');

      expect(handler).toHaveBeenCalled();
    });

    it('should propagate event service to cloned states', () => {
      const handler = vi.fn();
      eventService.on('transform', handler);

      const cloned = state.clone();
      cloned.setTextVar('test', 'value');

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('state management', () => {
    it('should prevent modifications when immutable', () => {
      state.setImmutable();
      expect(() => state.setTextVar('test', 'value')).toThrow('Cannot modify immutable state');
    });

    it('should create child state', () => {
      state.setTextVar('parent', 'value');
      const child = state.createChildState();
      expect(child.getTextVar('parent')).toBe('value');
    });

    it('should merge child state', () => {
      const child = state.createChildState();
      child.setTextVar('child', 'value');
      state.mergeChildState(child);
      expect(state.getTextVar('child')).toBe('value');
    });

    it('should clone state', () => {
      state.setTextVar('original', 'value');
      const clone = state.clone();
      expect(clone.getTextVar('original')).toBe('value');

      // Verify modifications don't affect original
      clone.setTextVar('new', 'value');
      expect(state.getTextVar('new')).toBeUndefined();
    });

    it('should track local changes', () => {
      expect(state.hasLocalChanges()).toBe(true);
      expect(state.getLocalChanges()).toEqual(['state']);
    });
  });

  describe('State Tracking', () => {
    let service: StateService;
    let trackingService: IStateTrackingService;
    let eventService: MockStateEventService;
    let visualizationService: StateVisualizationService;
    let debuggerService: StateDebuggerService;
    let historyService: StateHistoryService;

    beforeEach(() => {
      service = new StateService();
      eventService = new MockStateEventService();
      trackingService = new StateTrackingService();
      historyService = new StateHistoryService(eventService);
      visualizationService = new StateVisualizationService(historyService, trackingService);
      debuggerService = new StateDebuggerService(visualizationService, historyService, trackingService);

      service.setEventService(eventService);
      service.setTrackingService(trackingService);

      // Add services to the service instance for visualization and debugging
      (service as any).services = {
        visualization: visualizationService,
        debugger: debuggerService,
        history: historyService,
        tracking: trackingService,
        events: eventService
      };
    });

    it('should register state with tracking service', () => {
      const stateId = service.getStateId();
      expect(stateId).toBeDefined();
      expect(trackingService.hasState(stateId!)).toBe(true);

      const metadata = trackingService.getStateMetadata(stateId!);
      expect(metadata).toBeDefined();
      expect(metadata?.source).toBe('new');
      expect(metadata?.transformationEnabled).toBe(false);
    });

    it('should track parent-child relationships', () => {
      const parentId = service.getStateId()!;
      const child = service.createChildState();
      const childId = child.getStateId()!;

      expect(trackingService.getParentState(childId)).toBe(parentId);
      expect(trackingService.getChildStates(parentId)).toContain(childId);

      const relationships = trackingService.getRelationships(parentId);
      expect(relationships).toHaveLength(1);
      expect(relationships[0].type).toBe('parent-child');
      expect(relationships[0].targetId).toBe(childId);
    });

    it('should track clone relationships', () => {
      const originalId = service.getStateId()!;
      const cloned = service.clone();
      const clonedId = cloned.getStateId()!;

      expect(trackingService.getRelationships(originalId)).toHaveLength(1);
      expect(trackingService.getRelationships(originalId)[0].type).toBe('parent-child');
      expect(trackingService.getRelationships(originalId)[0].targetId).toBe(clonedId);
    });

    it('should track merge relationships', () => {
      const parentId = service.getStateId()!;
      const child = service.createChildState();
      const childId = child.getStateId()!;

      service.mergeChildState(child);

      const relationships = trackingService.getRelationships(parentId);
      expect(relationships).toHaveLength(2); // parent-child + merge-source
      expect(relationships.some(r => r.type === 'merge-source')).toBe(true);
      expect(relationships.some(r => r.type === 'parent-child')).toBe(true);
      expect(relationships.find(r => r.type === 'merge-source')?.targetId).toBe(childId);
    });

    it('should inherit tracking service from parent', () => {
      const parent = service;
      const child = parent.createChildState();

      expect(child.getStateId()).toBeDefined();
      expect(trackingService.hasState(child.getStateId()!)).toBe(true);
    });

    it('should track state lineage', async () => {
      // Start debug session with enhanced configuration
      const debugSessionId = await debuggerService.startSession({
        captureConfig: {
          capturePoints: ['pre-transform', 'post-transform', 'error'],
          includeFields: ['nodes', 'transformedNodes', 'variables', 'metadata'],
          format: 'full'
        },
        visualization: {
          format: 'mermaid',
          includeMetadata: true,
          includeTimestamps: true
        }
      });

      try {
        // Get initial state ID and visualize it
        const rootId = service.getStateId()!;
        console.log('Initial State:');
        console.log(await visualizationService.generateHierarchyView(rootId, {
          format: 'mermaid',
          includeMetadata: true
        }));

        // Create child state
        const child = service.createChildState();
        const childId = child.getStateId()!;
        console.log('\nAfter Creating Child:');
        console.log(await visualizationService.generateHierarchyView(rootId, {
          format: 'mermaid',
          includeMetadata: true
        }));

        // Create grandchild state
        const grandchild = child.createChildState();
        const grandchildId = grandchild.getStateId()!;
        console.log('\nAfter Creating Grandchild:');
        console.log(await visualizationService.generateHierarchyView(rootId, {
          format: 'mermaid',
          includeMetadata: true
        }));

        // Get and verify lineage
        const lineage = trackingService.getStateLineage(grandchildId);
        console.log('\nState Lineage:', lineage);

        // Generate transition diagram
        console.log('\nState Transitions:');
        console.log(await visualizationService.generateTransitionDiagram(grandchildId, {
          format: 'mermaid',
          includeTimestamps: true
        }));

        // Verify lineage
        expect(lineage).toHaveLength(3); // Root -> Child -> Grandchild
        expect(lineage[0]).toBe(rootId); // Root first
        expect(lineage[1]).toBe(childId); // Then child
        expect(lineage[2]).toBe(grandchildId); // Then grandchild

        // Get and log complete debug report
        const report = await debuggerService.generateDebugReport(debugSessionId);
        console.log('\nComplete Debug Report:', report);
      } catch (error) {
        // Log error diagnostics
        const errorReport = await debuggerService.generateDebugReport(debugSessionId);
        console.error('Error Debug Report:', errorReport);
        throw error;
      } finally {
        await service.services.debugger.endSession(debugSessionId);
      }
    });

    it('should track state descendants', () => {
      const rootId = service.getStateId()!;
      const child1 = service.createChildState();
      const child1Id = child1.getStateId()!;
      const child2 = service.createChildState();
      const child2Id = child2.getStateId()!;
      const grandchild = child1.createChildState();
      const grandchildId = grandchild.getStateId()!;

      const descendants = trackingService.getStateDescendants(rootId);
      expect(descendants).toHaveLength(3);
      expect(descendants).toContain(child1Id);
      expect(descendants).toContain(child2Id);
      expect(descendants).toContain(grandchildId);
    });
  });
});
```

# StateService.transformation.test.ts

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { StateService } from './StateService.js';
import type { MeldNode } from 'meld-spec';

describe('StateService node transformation', () => {
  let service: StateService;

  beforeEach(() => {
    service = new StateService();
  });

  it('should have transformation disabled by default', () => {
    expect(service.isTransformationEnabled()).toBe(false);
  });

  it('should return original nodes when transformation is disabled', () => {
    const node: MeldNode = {
      type: 'Text',
      content: 'test',
      location: { start: { line: 1, column: 1 }, end: { line: 1, column: 4 } }
    };
    service.addNode(node);
    expect(service.getTransformedNodes()).toEqual([node]);
  });

  it('should initialize transformed nodes when enabling transformation', () => {
    const node: MeldNode = {
      type: 'Text',
      content: 'test',
      location: { start: { line: 1, column: 1 }, end: { line: 1, column: 4 } }
    };
    service.addNode(node);
    service.enableTransformation(true);
    expect(service.getTransformedNodes()).toEqual([node]);
  });

  it('should add nodes to both arrays when transformation is enabled', () => {
    service.enableTransformation(true);
    const node: MeldNode = {
      type: 'Text',
      content: 'test',
      location: { start: { line: 1, column: 1 }, end: { line: 1, column: 4 } }
    };
    service.addNode(node);
    expect(service.getNodes()).toEqual([node]);
    expect(service.getTransformedNodes()).toEqual([node]);
  });

  it('should transform nodes only when enabled', () => {
    const original: MeldNode = {
      type: 'Text',
      content: 'original',
      location: { start: { line: 1, column: 1 }, end: { line: 1, column: 8 } }
    };
    const transformed: MeldNode = {
      type: 'Text',
      content: 'transformed',
      location: { start: { line: 1, column: 1 }, end: { line: 1, column: 11 } }
    };

    service.addNode(original);
    service.transformNode(original, transformed); // Should be ignored
    expect(service.getTransformedNodes()).toEqual([original]);

    service.enableTransformation(true);
    service.transformNode(original, transformed);
    expect(service.getNodes()).toEqual([original]); // Original unchanged
    expect(service.getTransformedNodes()).toEqual([transformed]); // Transformed updated
  });

  it('should throw when transforming non-existent node', () => {
    service.enableTransformation(true);
    const nonExistent: MeldNode = {
      type: 'Text',
      content: 'missing',
      location: { start: { line: 1, column: 1 }, end: { line: 1, column: 7 } }
    };
    const transformed: MeldNode = {
      type: 'Text',
      content: 'transformed',
      location: { start: { line: 1, column: 1 }, end: { line: 1, column: 11 } }
    };
    expect(() => service.transformNode(nonExistent, transformed))
      .toThrow('Cannot transform node: original node not found');
  });

  it('should preserve transformation state when cloning', () => {
    service.enableTransformation(true);
    const node: MeldNode = {
      type: 'Text',
      content: 'test',
      location: { start: { line: 1, column: 1 }, end: { line: 1, column: 4 } }
    };
    service.addNode(node);

    const cloned = service.clone();
    expect(cloned.isTransformationEnabled()).toBe(true);
    expect(cloned.getTransformedNodes()).toEqual([node]);
  });

  it('should handle immutability correctly with transformations', () => {
    service.enableTransformation(true);
    const original: MeldNode = {
      type: 'Text',
      content: 'original',
      location: { start: { line: 1, column: 1 }, end: { line: 1, column: 8 } }
    };
    service.addNode(original);
    service.setImmutable();

    const transformed: MeldNode = {
      type: 'Text',
      content: 'transformed',
      location: { start: { line: 1, column: 1 }, end: { line: 1, column: 11 } }
    };
    expect(() => service.transformNode(original, transformed))
      .toThrow('Cannot modify immutable state');
  });
});
```

# StateService.ts

```typescript
import type { MeldNode, TextNode } from 'meld-spec';
import { stateLogger as logger } from '@core/utils/logger.js';
import type { IStateService } from './IStateService.js';
import type { StateNode, CommandDefinition } from './types.js';
import { StateFactory } from './StateFactory.js';
import type { IStateEventService, StateEvent } from '../StateEventService/IStateEventService.js';
import type { IStateTrackingService } from '@tests/utils/debug/StateTrackingService/IStateTrackingService.js';

export class StateService implements IStateService {
  private stateFactory: StateFactory;
  private currentState: StateNode;
  private _isImmutable: boolean = false;
  private _transformationEnabled: boolean = false;
  private eventService?: IStateEventService;
  private trackingService?: IStateTrackingService;

  constructor(parentState?: IStateService) {
    this.stateFactory = new StateFactory();
    this.currentState = this.stateFactory.createState({
      source: 'new',
      parentState: parentState ? (parentState as StateService).currentState : undefined
    });

    // If parent has services, inherit them
    if (parentState) {
      const parent = parentState as StateService;
      if (parent.eventService) {
        this.eventService = parent.eventService;
      }
      if (parent.trackingService) {
        this.trackingService = parent.trackingService;
      }
    }

    // Register state with tracking service if available
    if (this.trackingService) {
      const parentId = parentState ? (parentState as StateService).currentState.stateId : undefined;

      // Register the state with the pre-generated ID
      this.trackingService.registerState({
        id: this.currentState.stateId,
        source: 'new',
        parentId,
        filePath: this.currentState.filePath,
        transformationEnabled: this._transformationEnabled
      });

      // Add parent-child relationship if there is a parent
      if (parentId) {
        this.trackingService.addRelationship(
          parentId,
          this.currentState.stateId!,
          'parent-child'
        );
      }
    }
  }

  setEventService(eventService: IStateEventService): void {
    this.eventService = eventService;
  }

  private async emitEvent(event: StateEvent): Promise<void> {
    if (this.eventService) {
      await this.eventService.emit(event);
    }
  }

  // Text variables
  getTextVar(name: string): string | undefined {
    return this.currentState.variables.text.get(name);
  }

  setTextVar(name: string, value: string): void {
    this.checkMutable();
    const text = new Map(this.currentState.variables.text);
    text.set(name, value);
    this.updateState({
      variables: {
        ...this.currentState.variables,
        text
      }
    }, `setTextVar:${name}`);
  }

  getAllTextVars(): Map<string, string> {
    return new Map(this.currentState.variables.text);
  }

  getLocalTextVars(): Map<string, string> {
    return new Map(this.currentState.variables.text);
  }

  // Data variables
  getDataVar(name: string): unknown {
    return this.currentState.variables.data.get(name);
  }

  setDataVar(name: string, value: unknown): void {
    this.checkMutable();
    const data = new Map(this.currentState.variables.data);
    data.set(name, value);
    this.updateState({
      variables: {
        ...this.currentState.variables,
        data
      }
    }, `setDataVar:${name}`);
  }

  getAllDataVars(): Map<string, unknown> {
    return new Map(this.currentState.variables.data);
  }

  getLocalDataVars(): Map<string, unknown> {
    return new Map(this.currentState.variables.data);
  }

  // Path variables
  getPathVar(name: string): string | undefined {
    return this.currentState.variables.path.get(name);
  }

  setPathVar(name: string, value: string): void {
    this.checkMutable();
    const path = new Map(this.currentState.variables.path);
    path.set(name, value);
    this.updateState({
      variables: {
        ...this.currentState.variables,
        path
      }
    }, `setPathVar:${name}`);
  }

  getAllPathVars(): Map<string, string> {
    return new Map(this.currentState.variables.path);
  }

  // Commands
  getCommand(name: string): CommandDefinition | undefined {
    return this.currentState.commands.get(name);
  }

  setCommand(name: string, command: string | CommandDefinition): void {
    this.checkMutable();
    const commands = new Map(this.currentState.commands);
    const commandDef = typeof command === 'string' ? { command } : command;
    commands.set(name, commandDef);
    this.updateState({ commands }, `setCommand:${name}`);
  }

  getAllCommands(): Map<string, CommandDefinition> {
    return new Map(this.currentState.commands);
  }

  // Nodes
  getNodes(): MeldNode[] {
    return [...this.currentState.nodes];
  }

  getTransformedNodes(): MeldNode[] {
    if (this._transformationEnabled) {
      return this.currentState.transformedNodes ? [...this.currentState.transformedNodes] : [...this.currentState.nodes];
    }
    return [...this.currentState.nodes];
  }

  setTransformedNodes(nodes: MeldNode[]): void {
    this.checkMutable();
    this.updateState({ transformedNodes: nodes }, 'setTransformedNodes');
  }

  addNode(node: MeldNode): void {
    this.checkMutable();
    const nodes = [...this.currentState.nodes, node];
    const transformedNodes = this._transformationEnabled ?
      (this.currentState.transformedNodes ? [...this.currentState.transformedNodes, node] : [...nodes]) :
      undefined;
    this.updateState({ nodes, transformedNodes }, 'addNode');
  }

  transformNode(original: MeldNode, transformed: MeldNode): void {
    this.checkMutable();
    if (!this._transformationEnabled) {
      return;
    }

    // Initialize transformed nodes if needed
    let transformedNodes = this.currentState.transformedNodes ?
      [...this.currentState.transformedNodes] :
      [...this.currentState.nodes];

    // First try direct reference comparison
    let index = transformedNodes.findIndex(node => node === original);

    // If not found by reference, try matching by properties
    if (index === -1) {
      index = transformedNodes.findIndex(node => {
        // Type guard to ensure we only compare nodes with content
        if (node.type !== original.type) return false;
        if (!('content' in node) || !('content' in original)) return false;
        if (!node.location || !original.location) return false;

        return (
          (node as TextNode).content === (original as TextNode).content &&
          node.location.start.line === original.location.start.line &&
          node.location.start.column === original.location.start.column &&
          node.location.end.line === original.location.end.line &&
          node.location.end.column === original.location.end.column
        );
      });
    }

    if (index !== -1) {
      transformedNodes[index] = transformed;
    } else {
      // If not found, check if it's in the original nodes array
      const originalIndex = this.currentState.nodes.findIndex(node => node === original);

      if (originalIndex === -1) {
        throw new Error('Cannot transform node: original node not found');
      }

      transformedNodes.push(transformed);
    }

    this.updateState({ transformedNodes }, 'transformNode');
  }

  isTransformationEnabled(): boolean {
    return this._transformationEnabled;
  }

  enableTransformation(enable: boolean): void {
    this._transformationEnabled = enable;
    if (enable && !this.currentState.transformedNodes) {
      // Initialize transformed nodes with current nodes when enabling transformation
      this.updateState({ transformedNodes: [...this.currentState.nodes] }, 'enableTransformation');
    }
  }

  appendContent(content: string): void {
    this.checkMutable();
    // Create a text node and add it
    const textNode: TextNode = {
      type: 'Text',
      content,
      location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } }
    };
    this.addNode(textNode);
  }

  // Imports
  addImport(path: string): void {
    this.checkMutable();
    const imports = new Set(this.currentState.imports);
    imports.add(path);
    this.updateState({ imports }, `addImport:${path}`);
  }

  removeImport(path: string): void {
    this.checkMutable();
    const imports = new Set(this.currentState.imports);
    imports.delete(path);
    this.updateState({ imports }, `removeImport:${path}`);
  }

  hasImport(path: string): boolean {
    return this.currentState.imports.has(path);
  }

  getImports(): Set<string> {
    return new Set(this.currentState.imports);
  }

  // File path
  getCurrentFilePath(): string | null {
    return this.currentState.filePath ?? null;
  }

  setCurrentFilePath(path: string): void {
    this.checkMutable();
    this.updateState({ filePath: path }, 'setCurrentFilePath');
  }

  // State management
  /**
   * In the immutable state model, any non-empty state is considered to have local changes.
   * This is a deliberate design choice - each state represents a complete snapshot,
   * so the entire state is considered "changed" from its creation.
   *
   * @returns Always returns true to indicate the state has changes
   */
  hasLocalChanges(): boolean {
    return true; // In immutable model, any non-empty state has local changes
  }

  /**
   * Returns a list of changed elements in the state. In the immutable state model,
   * the entire state is considered changed from creation, so this always returns
   * ['state'] to indicate the complete state has changed.
   *
   * This is a deliberate design choice that aligns with the immutable state model
   * where each state is a complete snapshot.
   *
   * @returns Always returns ['state'] to indicate the entire state has changed
   */
  getLocalChanges(): string[] {
    return ['state']; // In immutable model, the entire state is considered changed
  }

  setImmutable(): void {
    this._isImmutable = true;
  }

  get isImmutable(): boolean {
    return this._isImmutable;
  }

  createChildState(): IStateService {
    const child = new StateService(this);
    logger.debug('Created child state', {
      parentPath: this.getCurrentFilePath(),
      childPath: child.getCurrentFilePath()
    });

    // Emit create event
    this.emitEvent({
      type: 'create',
      stateId: child.currentState.filePath || 'unknown',
      source: 'createChildState',
      timestamp: Date.now(),
      location: {
        file: this.getCurrentFilePath() || undefined
      }
    });

    return child;
  }

  mergeChildState(childState: IStateService): void {
    this.checkMutable();
    const child = childState as StateService;
    this.currentState = this.stateFactory.mergeStates(this.currentState, child.currentState);

    // Add merge relationship if tracking enabled
    if (this.trackingService && child.currentState.stateId) {
      // Add merge-source relationship without removing the existing parent-child relationship
      this.trackingService.addRelationship(
        this.currentState.stateId!,
        child.currentState.stateId,
        'merge-source'
      );
    }

    // Emit merge event
    this.emitEvent({
      type: 'merge',
      stateId: this.currentState.stateId || 'unknown',
      source: 'mergeChildState',
      timestamp: Date.now(),
      location: {
        file: this.getCurrentFilePath() || undefined
      }
    });
  }

  clone(): IStateService {
    const cloned = new StateService();

    // Create a completely new state without parent reference
    cloned.currentState = this.stateFactory.createState({
      source: 'clone',
      filePath: this.currentState.filePath
    });

    // Deep clone all state using our helper
    cloned.updateState({
      variables: {
        text: this.deepCloneValue(this.currentState.variables.text),
        data: this.deepCloneValue(this.currentState.variables.data),
        path: this.deepCloneValue(this.currentState.variables.path)
      },
      commands: this.deepCloneValue(this.currentState.commands),
      nodes: this.deepCloneValue(this.currentState.nodes),
      transformedNodes: this.currentState.transformedNodes ?
        this.deepCloneValue(this.currentState.transformedNodes) : undefined,
      imports: this.deepCloneValue(this.currentState.imports)
    }, 'clone');

    // Copy flags
    cloned._isImmutable = this._isImmutable;
    cloned._transformationEnabled = this._transformationEnabled;

    // Copy service references
    if (this.eventService) {
      cloned.setEventService(this.eventService);
    }
    if (this.trackingService) {
      cloned.setTrackingService(this.trackingService);

      // Register the cloned state with tracking service
      this.trackingService.registerState({
        id: cloned.currentState.stateId!,
        source: 'clone',
        parentId: this.currentState.stateId,
        filePath: cloned.currentState.filePath,
        transformationEnabled: cloned._transformationEnabled
      });

      // Add clone relationship as parent-child since 'clone' is not a valid relationship type
      this.trackingService.addRelationship(
        this.currentState.stateId!,
        cloned.currentState.stateId!,
        'parent-child' // Changed from 'clone' to 'parent-child'
      );
    }

    // Emit clone event
    this.emitEvent({
      type: 'clone',
      stateId: cloned.currentState.stateId || 'unknown',
      source: 'clone',
      timestamp: Date.now(),
      location: {
        file: this.getCurrentFilePath() || undefined
      }
    });

    return cloned;
  }

  private checkMutable(): void {
    if (this._isImmutable) {
      throw new Error('Cannot modify immutable state');
    }
  }

  /**
   * Deep clones a value, handling objects, arrays, Maps, Sets, and circular references.
   * @param value The value to clone
   * @param seen A WeakMap to track circular references
   * @returns A deep clone of the value
   */
  private deepCloneValue<T>(value: T, seen: WeakMap<any, any> = new WeakMap()): T {
    // Handle null, undefined, and primitive types
    if (value === null || value === undefined || typeof value !== 'object') {
      return value;
    }

    // Handle circular references
    if (seen.has(value)) {
      return seen.get(value);
    }

    // Handle Date objects
    if (value instanceof Date) {
      return new Date(value.getTime()) as unknown as T;
    }

    // Handle Arrays
    if (Array.isArray(value)) {
      const clone = [] as unknown as T;
      seen.set(value, clone);
      (value as unknown as any[]).forEach((item, index) => {
        (clone as unknown as any[])[index] = this.deepCloneValue(item, seen);
      });
      return clone;
    }

    // Handle Maps
    if (value instanceof Map) {
      const clone = new Map() as unknown as T;
      seen.set(value, clone);
      (value as Map<any, any>).forEach((val, key) => {
        (clone as unknown as Map<any, any>).set(
          this.deepCloneValue(key, seen),
          this.deepCloneValue(val, seen)
        );
      });
      return clone;
    }

    // Handle Sets
    if (value instanceof Set) {
      const clone = new Set() as unknown as T;
      seen.set(value, clone);
      (value as Set<any>).forEach(item => {
        (clone as unknown as Set<any>).add(this.deepCloneValue(item, seen));
      });
      return clone;
    }

    // Handle plain objects (including MeldNodes and CommandDefinitions)
    const clone = Object.create(Object.getPrototypeOf(value));
    seen.set(value, clone);

    Object.entries(value as object).forEach(([key, val]) => {
      clone[key] = this.deepCloneValue(val, seen);
    });

    return clone;
  }

  private updateState(updates: Partial<StateNode>, source: string): void {
    this.currentState = this.stateFactory.updateState(this.currentState, updates);

    // Emit transform event for state updates
    this.emitEvent({
      type: 'transform',
      stateId: this.currentState.stateId || 'unknown',
      source,
      timestamp: Date.now(),
      location: {
        file: this.getCurrentFilePath() || undefined
      }
    });
  }

  // Add new methods for state tracking
  setTrackingService(trackingService: IStateTrackingService): void {
    this.trackingService = trackingService;

    // Register existing state if not already registered
    if (this.currentState.stateId) {
      try {
        this.trackingService.registerState({
          id: this.currentState.stateId,
          source: this.currentState.source || 'new',  // Use original source or default to 'new'
          filePath: this.getCurrentFilePath() || undefined,
          transformationEnabled: this._transformationEnabled
        });
      } catch (error) {
        logger.warn('Failed to register existing state with tracking service', { error, stateId: this.currentState.stateId });
      }
    }
  }

  getStateId(): string | undefined {
    return this.currentState.stateId;
  }
}
```

# migration.test.ts

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { StateService } from './StateService.js';
import { migrateState, validateMigration } from './migration.js';
import type { MeldNode } from 'meld-spec';
import type { StateNode } from './types.js';

describe('State Migration', () => {
  let oldState: StateService;

  beforeEach(() => {
    oldState = new StateService();
  });

  describe('basic migration', () => {
    it('should migrate empty state', () => {
      const result = migrateState(oldState, { validate: false });
      expect(result.success).toBe(true);
      expect(result.warnings).toHaveLength(0);
      expect(result.state.variables.text.size).toBe(0);
      expect(result.state.variables.data.size).toBe(0);
      expect(result.state.variables.path.size).toBe(0);
      expect(result.state.commands.size).toBe(0);
      expect(result.state.imports.size).toBe(0);
      expect(result.state.nodes.length).toBe(0);
    });

    it('should migrate state with variables', () => {
      // Set up old state
      oldState.setTextVar('text', 'value');
      oldState.setDataVar('data', { key: 'value' });
      oldState.setPathVar('path', '/test/path');

      const result = migrateState(oldState, { validate: false });
      expect(result.success).toBe(true);
      expect(result.warnings).toHaveLength(0);

      // Verify text variables
      expect(result.state.variables.text.get('text')).toBe('value');

      // Verify data variables
      expect(result.state.variables.data.get('data')).toEqual({ key: 'value' });

      // Verify path variables
      expect(result.state.variables.path.get('path')).toBe('/test/path');
    });

    it('should migrate state with commands', () => {
      // Set up old state
      oldState.setCommand('test', 'echo test');
      oldState.setCommand('complex', { command: 'test', options: { silent: true } });

      const result = migrateState(oldState, { validate: false });
      expect(result.success).toBe(true);
      expect(result.warnings).toHaveLength(0);

      // Verify commands
      expect(result.state.commands.get('test')).toEqual({ command: 'echo test' });
      expect(result.state.commands.get('complex')).toEqual({
        command: 'test',
        options: { silent: true }
      });
    });

    it('should migrate state with imports', () => {
      // Set up old state
      oldState.addImport('test1.md');
      oldState.addImport('test2.md');

      const result = migrateState(oldState, { validate: false });
      expect(result.success).toBe(true);
      expect(result.warnings).toHaveLength(0);

      // Verify imports
      expect(result.state.imports.has('test1.md')).toBe(true);
      expect(result.state.imports.has('test2.md')).toBe(true);
    });

    it('should migrate state with nodes', () => {
      // Set up old state
      const node: MeldNode = {
        type: 'text',
        value: 'test',
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 4 } }
      };
      oldState.addNode(node);

      const result = migrateState(oldState, { validate: false });
      expect(result.success).toBe(true);
      expect(result.warnings).toHaveLength(0);

      // Verify nodes
      expect(result.state.nodes).toHaveLength(1);
      expect(result.state.nodes[0]).toEqual(node);
    });
  });

  describe('validation', () => {
    it('should detect mismatched text variables', () => {
      // Create a state that will be different after migration
      oldState.setTextVar('test', 'value');

      // Create a mismatched state manually
      const mismatchedState: StateNode = {
        variables: {
          text: new Map([['test', 'different']]),
          data: new Map(),
          path: new Map()
        },
        commands: new Map(),
        imports: new Set(),
        nodes: [],
      };

      // Validate the mismatched state
      const warnings: string[] = [];
      validateMigration(oldState, mismatchedState, warnings);
      expect(warnings).toContain('Text variable mismatch: test');
    });

    it('should fail strictly with validation errors', () => {
      oldState.setTextVar('test', 'value');

      // Create a mismatched state to force validation error
      const mismatchedState: StateNode = {
        variables: {
          text: new Map([['test', 'different']]),
          data: new Map(),
          path: new Map()
        },
        commands: new Map(),
        imports: new Set(),
        nodes: [],
      };

      expect(() => {
        const warnings: string[] = [];
        validateMigration(oldState, mismatchedState, warnings);
        if (warnings.length > 0) {
          throw new Error('Migration validation failed:\n' + warnings.join('\n'));
        }
      }).toThrow('Migration validation failed');
    });
  });

  describe('error handling', () => {
    it('should handle migration errors gracefully', () => {
      // Create an invalid state that will cause migration to fail
      const invalidState = {
        getAllTextVars: () => { throw new Error('Test error'); },
        getAllDataVars: () => new Map(),
        getAllPathVars: () => new Map(),
        getAllCommands: () => new Map(),
        getImports: () => new Set(),
        getNodes: () => [],
        getCurrentFilePath: () => null
      } as unknown as StateService;

      const result = migrateState(invalidState);
      expect(result.success).toBe(false);
      expect(result.warnings).toContain('Error: Test error');
      expect(result.state.variables.text.size).toBe(0);
    });
  });
});
```

# migration.ts

```typescript
import type { IStateService } from './IStateService.js';
import type { StateNode } from './types.js';
import { StateFactory } from './StateFactory.js';
import { stateLogger as logger } from '@core/utils/logger.js';

/**
 * Options for migrating state
 */
export interface MigrationOptions {
  /**
   * Whether to preserve immutability status
   * @default true
   */
  preserveImmutability?: boolean;

  /**
   * Whether to validate the migrated state
   * @default true
   */
  validate?: boolean;

  /**
   * Whether to throw on validation errors
   * @default false
   */
  strict?: boolean;
}

/**
 * Result of state migration
 */
export interface MigrationResult {
  /**
   * The migrated state node
   */
  state: StateNode;

  /**
   * Any validation warnings that occurred during migration
   */
  warnings: string[];

  /**
   * Whether the migration was successful
   */
  success: boolean;
}

/**
 * Migrates an old state service instance to a new immutable state node
 */
export function migrateState(oldState: IStateService, options: MigrationOptions = {}): MigrationResult {
  const {
    preserveImmutability = true,
    validate = true,
    strict = false
  } = options;

  const warnings: string[] = [];
  const factory = new StateFactory();

  try {
    // Create base state
    const state = factory.createState({
      source: 'migration',
      filePath: oldState.getCurrentFilePath() ?? undefined
    });

    // Migrate variables
    const text = new Map(oldState.getAllTextVars());
    const data = new Map(oldState.getAllDataVars());
    const path = new Map(oldState.getAllPathVars());

    // Migrate commands
    const commands = new Map(oldState.getAllCommands());

    // Migrate imports
    const imports = oldState.getImports();

    // Migrate nodes
    const nodes = oldState.getNodes();

    // Create migrated state
    const migrated = factory.updateState(state, {
      variables: { text, data, path },
      commands,
      imports,
      nodes
    });

    // Validate migrated state
    if (validate) {
      validateMigration(oldState, migrated, warnings);
      if (strict && warnings.length > 0) {
        throw new Error('Migration validation failed:\n' + warnings.join('\n'));
      }
    }

    logger.debug('Migrated state', {
      textVars: text.size,
      dataVars: data.size,
      pathVars: path.size,
      commands: commands.size,
      imports: imports.size,
      nodes: nodes.length,
      warnings: warnings.length
    });

    return {
      state: migrated,
      warnings,
      success: true
    };
  } catch (error) {
    logger.error('State migration failed', { error });
    return {
      state: factory.createState(),
      warnings: [...warnings, String(error)],
      success: false
    };
  }
}

/**
 * Validates that the migrated state matches the original
 */
export function validateMigration(oldState: IStateService, newState: StateNode, warnings: string[]): void {
  // Validate text variables
  for (const [key, value] of oldState.getAllTextVars()) {
    const newValue = newState.variables.text.get(key);
    if (newValue !== value) {
      warnings.push(`Text variable mismatch: ${key}`);
    }
  }

  // Validate data variables
  for (const [key, value] of oldState.getAllDataVars()) {
    const newValue = newState.variables.data.get(key);
    if (JSON.stringify(newValue) !== JSON.stringify(value)) {
      warnings.push(`Data variable mismatch: ${key}`);
    }
  }

  // Validate path variables
  for (const [key, value] of oldState.getAllPathVars()) {
    const newValue = newState.variables.path.get(key);
    if (newValue !== value) {
      warnings.push(`Path variable mismatch: ${key}`);
    }
  }

  // Validate commands
  for (const [key, value] of oldState.getAllCommands()) {
    const newValue = newState.commands.get(key);
    if (!newValue || JSON.stringify(newValue) !== JSON.stringify(value)) {
      warnings.push(`Command mismatch: ${key}`);
    }
  }

  // Validate imports
  for (const importPath of oldState.getImports()) {
    if (!newState.imports.has(importPath)) {
      warnings.push(`Missing import: ${importPath}`);
    }
  }

  // Validate nodes
  const oldNodes = oldState.getNodes();
  if (oldNodes.length !== newState.nodes.length) {
    warnings.push(`Node count mismatch: ${oldNodes.length} vs ${newState.nodes.length}`);
  } else {
    for (let i = 0; i < oldNodes.length; i++) {
      if (JSON.stringify(oldNodes[i]) !== JSON.stringify(newState.nodes[i])) {
        warnings.push(`Node mismatch at index ${i}`);
      }
    }
  }

  // Validate file path
  const oldPath = oldState.getCurrentFilePath();
  const newPath = newState.filePath;
  if (oldPath !== (newPath ?? null)) {
    warnings.push(`File path mismatch: ${oldPath} vs ${newPath}`);
  }
}
```

# FileSystemService.test.ts

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestContext } from '@tests/utils/TestContext.js';
import { FileSystemService } from './FileSystemService.js';
import { PathOperationsService } from './PathOperationsService.js';
import { MeldError } from '@core/errors/MeldError.js';
import path from 'path';

describe('FileSystemService', () => {
  let context: TestContext;
  let service: FileSystemService;
  let pathOps: PathOperationsService;

  beforeEach(async () => {
    // Initialize test context
    context = new TestContext();
    await context.initialize();

    // Load test fixture
    await context.fixtures.load('fileSystemProject');

    // Initialize services
    pathOps = new PathOperationsService();
    service = new FileSystemService(pathOps, context.fs);

    // Set up test files and directories
    await service.ensureDir('project/list-dir');
    await service.writeFile('project/list-dir/file1.txt', 'content1');
    await service.writeFile('project/list-dir/file2.txt', 'content2');
    await service.writeFile('project/test.txt', 'Hello, World!');
    await service.writeFile('project/exists.txt', 'exists');
    await service.writeFile('project/stats.txt', 'stats');
    await service.ensureDir('project/stats-dir');
    await service.ensureDir('project/empty-dir');
  });

  afterEach(async () => {
    await context.cleanup();
  });

  describe('File operations', () => {
    it('writes and reads a file', async () => {
      const filePath = 'project/write-test.txt';
      const content = 'New content';

      await service.writeFile(filePath, content);
      const result = await service.readFile(filePath);

      expect(result).toBe(content);
    });

    it('reads an existing file', async () => {
      const content = await service.readFile('project/test.txt');
      expect(content).toBe('Hello, World!');
    });

    it('checks if a file exists', async () => {
      expect(await service.exists('project/exists.txt')).toBe(true);
      expect(await service.exists('project/nonexistent.txt')).toBe(false);
    });

    it('gets file stats', async () => {
      const stats = await service.stat('project/stats.txt');
      expect(stats.isFile()).toBe(true);
      expect(stats.isDirectory()).toBe(false);
    });

    it('throws MeldError when reading non-existent file', async () => {
      await expect(service.readFile('project/nonexistent.txt'))
        .rejects.toThrow(MeldError);
    });

    it('creates parent directories when writing files', async () => {
      await service.writeFile('project/new/nested/file.txt', 'content');
      expect(await service.exists('project/new/nested/file.txt')).toBe(true);
      expect(await service.isDirectory('project/new/nested')).toBe(true);
    });
  });

  describe('Directory operations', () => {
    it('creates and verifies directory', async () => {
      const dirPath = 'project/new-dir';
      await service.ensureDir(dirPath);

      const exists = await service.exists(dirPath);
      const isDir = await service.isDirectory(dirPath);

      expect(exists).toBe(true);
      expect(isDir).toBe(true);
    });

    it('lists directory contents', async () => {
      const files = await service.readDir('project/list-dir');
      expect(files).toHaveLength(2);
      expect(files).toContain('file1.txt');
      expect(files).toContain('file2.txt');
    });

    it('creates nested directories', async () => {
      const dirPath = 'project/a/b/c/d';
      await service.ensureDir(dirPath);
      expect(await service.isDirectory(dirPath)).toBe(true);
    });

    it('verifies empty directory', async () => {
      expect(await service.readDir('project/empty-dir')).toHaveLength(0);
    });

    it('throws MeldError when reading non-existent directory', async () => {
      await expect(service.readDir('project/nonexistent'))
        .rejects.toThrow(MeldError);
    });
  });

  describe('File type checking', () => {
    it('identifies directories', async () => {
      expect(await service.isDirectory('project/stats-dir')).toBe(true);
      expect(await service.isDirectory('project/stats.txt')).toBe(false);
    });

    it('identifies files', async () => {
      expect(await service.isFile('project/stats.txt')).toBe(true);
      expect(await service.isFile('project/stats-dir')).toBe(false);
    });

    it('handles non-existent paths', async () => {
      expect(await service.isFile('project/nonexistent')).toBe(false);
      expect(await service.isDirectory('project/nonexistent')).toBe(false);
    });
  });

  describe('Filesystem changes', () => {
    it('detects file modifications', async () => {
      // Take initial snapshot
      const before = await context.snapshot.takeSnapshot();

      // Modify a file
      await service.writeFile('project/test.txt', 'Modified content');

      // Take after snapshot and compare
      const after = await context.snapshot.takeSnapshot();
      const diff = context.snapshot.compare(before, after);

      expect(diff.modified).toContain('project/test.txt');
    });

    it('detects new files', async () => {
      const before = await context.snapshot.takeSnapshot();
      await service.writeFile('project/new-file.txt', 'New content');
      const after = await context.snapshot.takeSnapshot();
      const diff = context.snapshot.compare(before, after);

      expect(diff.added).toContain('project/new-file.txt');
    });

    it('detects removed files', async () => {
      // Note: We don't have a remove method in our interface yet
      // This test is a placeholder for when we add file removal support
      expect(true).toBe(true);
    });
  });
});
```

# FileSystemService.ts

```typescript
import * as fs from 'fs-extra';
import { filesystemLogger as logger } from '@core/utils/logger.js';
import { IFileSystemService } from './IFileSystemService.js';
import { IPathOperationsService } from './IPathOperationsService.js';
import { IFileSystem } from './IFileSystem.js';
import { NodeFileSystem } from './NodeFileSystem.js';
import { MeldError } from '@core/errors/MeldError.js';
import { MeldFileNotFoundError } from '@core/errors/MeldFileNotFoundError.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface FileOperationContext {
  operation: string;
  path: string;
  details?: Record<string, unknown>;
  [key: string]: unknown;
}

export class FileSystemService implements IFileSystemService {
  private fs: IFileSystem;

  constructor(
    private readonly pathOps: IPathOperationsService,
    fileSystem?: IFileSystem
  ) {
    this.fs = fileSystem || new NodeFileSystem();
  }

  setFileSystem(fileSystem: IFileSystem): void {
    this.fs = fileSystem;
  }

  // File operations
  async readFile(filePath: string): Promise<string> {
    const context: FileOperationContext = {
      operation: 'readFile',
      path: filePath
    };

    try {
      logger.debug('Reading file', context);
      const content = await this.fs.readFile(filePath);
      logger.debug('Successfully read file', { ...context, contentLength: content.length });
      return content;
    } catch (error) {
      const err = error as Error;
      if (err.message.includes('ENOENT')) {
        logger.error('File not found', { ...context, error: err });
        throw new MeldFileNotFoundError(filePath, err);
      }
      logger.error('Error reading file', { ...context, error: err });
      throw new MeldError(`Error reading file: ${filePath}`, {
        cause: err,
        filePath
      });
    }
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const context: FileOperationContext = {
      operation: 'writeFile',
      path: filePath,
      details: { contentLength: content.length }
    };

    try {
      logger.debug('Writing file', context);
      await this.ensureDir(this.pathOps.dirname(filePath));
      await this.fs.writeFile(filePath, content);
      logger.debug('Successfully wrote file', context);
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to write file', { ...context, error: err });
      throw new MeldError(`Failed to write file: ${filePath}`, {
        cause: err,
        filePath
      });
    }
  }

  async exists(filePath: string): Promise<boolean> {
    const context: FileOperationContext = {
      operation: 'exists',
      path: filePath
    };

    try {
      logger.debug('Checking if path exists', context);
      const exists = await this.fs.exists(filePath);
      logger.debug('Path existence check complete', { ...context, exists });
      return exists;
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to check path existence', { ...context, error: err });
      throw new MeldError(`Failed to check if path exists: ${filePath}`, {
        cause: err,
        filePath
      });
    }
  }

  async stat(filePath: string): Promise<fs.Stats> {
    const context: FileOperationContext = {
      operation: 'stat',
      path: filePath
    };

    try {
      logger.debug('Getting file stats', context);
      const stats = await this.fs.stat(filePath);
      logger.debug('Successfully got file stats', { ...context, isDirectory: stats.isDirectory() });
      return stats;
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to get file stats', { ...context, error: err });
      throw new MeldError(`Failed to get file stats: ${filePath}`, {
        cause: err,
        filePath
      });
    }
  }

  // Directory operations
  async readDir(dirPath: string): Promise<string[]> {
    const context: FileOperationContext = {
      operation: 'readDir',
      path: dirPath
    };

    try {
      logger.debug('Reading directory', context);
      const files = await this.fs.readDir(dirPath);
      logger.debug('Successfully read directory', { ...context, fileCount: files.length });
      return files;
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to read directory', { ...context, error: err });
      throw new MeldError(`Failed to read directory: ${dirPath}`, {
        cause: err,
        filePath: dirPath
      });
    }
  }

  async ensureDir(dirPath: string): Promise<void> {
    const context: FileOperationContext = {
      operation: 'ensureDir',
      path: dirPath
    };

    try {
      logger.debug('Ensuring directory exists', context);
      await this.fs.mkdir(dirPath);
      logger.debug('Successfully ensured directory exists', context);
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to ensure directory exists', { ...context, error: err });
      throw new MeldError(`Failed to ensure directory exists: ${dirPath}`, {
        cause: err,
        filePath: dirPath
      });
    }
  }

  async isDirectory(filePath: string): Promise<boolean> {
    const context: FileOperationContext = {
      operation: 'isDirectory',
      path: filePath
    };

    try {
      logger.debug('Checking if path is directory', context);
      const isDir = await this.fs.isDirectory(filePath);
      logger.debug('Path directory check complete', { ...context, isDirectory: isDir });
      return isDir;
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to check if path is directory', { ...context, error: err });
      throw new MeldError(`Failed to check if path is directory: ${filePath}`, {
        cause: err,
        filePath
      });
    }
  }

  async isFile(filePath: string): Promise<boolean> {
    const context: FileOperationContext = {
      operation: 'isFile',
      path: filePath
    };

    try {
      logger.debug('Checking if path is file', context);
      const isFile = await this.fs.isFile(filePath);
      logger.debug('Path file check complete', { ...context, isFile });
      return isFile;
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to check if path is file', { ...context, error: err });
      throw new MeldError(`Failed to check if path is file: ${filePath}`, {
        cause: err,
        filePath
      });
    }
  }

  getCwd(): string {
    return process.cwd();
  }

  watch(path: string, options?: { recursive?: boolean }): AsyncIterableIterator<{ filename: string; eventType: string }> {
    const context: FileOperationContext = {
      operation: 'watch',
      path,
      details: { options }
    };

    try {
      logger.debug('Starting file watch', context);
      return this.fs.watch(path, options);
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to watch file', { ...context, error: err });
      throw new MeldError(`Failed to watch file: ${path}`, {
        cause: err,
        filePath: path
      });
    }
  }

  async executeCommand(command: string, options?: { cwd?: string }): Promise<{ stdout: string; stderr: string }> {
    const context: FileOperationContext = {
      operation: 'executeCommand',
      command,
      options,
      path: options?.cwd || this.getCwd()
    };

    try {
      logger.debug('Executing command', context);
      const result = await execAsync(command, {
        cwd: options?.cwd || this.getCwd()
      });
      logger.debug('Command execution successful', {
        ...context,
        stdout: result.stdout,
        stderr: result.stderr
      });
      return result;
    } catch (error) {
      const err = error as Error;
      logger.error('Command execution failed', { ...context, error: err });
      throw new MeldError(`Failed to execute command: ${command}`, {
        cause: err,
        filePath: options?.cwd || this.getCwd()
      });
    }
  }
}
```

# IFileSystem.ts

```typescript
import { Stats } from 'fs-extra';

export interface IFileSystem {
  // File operations
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<Stats>;

  // Directory operations
  readDir(path: string): Promise<string[]>;
  mkdir(path: string): Promise<void>;
  isDirectory(path: string): Promise<boolean>;
  isFile(path: string): Promise<boolean>;

  // File watching
  watch(path: string, options?: { recursive?: boolean }): AsyncIterableIterator<{ filename: string; eventType: string }>;
}
```

# IFileSystemService.ts

```typescript
import type { Stats } from 'fs-extra';
import type { IFileSystem } from './IFileSystem.js';

export interface IFileSystemService {
  // File operations
  readFile(filePath: string): Promise<string>;
  writeFile(filePath: string, content: string): Promise<void>;
  exists(filePath: string): Promise<boolean>;
  stat(filePath: string): Promise<Stats>;
  isFile(filePath: string): Promise<boolean>;

  // Directory operations
  readDir(dirPath: string): Promise<string[]>;
  ensureDir(dirPath: string): Promise<void>;
  isDirectory(filePath: string): Promise<boolean>;

  // File watching
  watch(path: string, options?: { recursive?: boolean }): AsyncIterableIterator<{ filename: string; eventType: string }>;

  // Working directory
  getCwd(): string;

  // Command execution
  executeCommand(command: string, options?: { cwd?: string }): Promise<{ stdout: string; stderr: string }>;

  setFileSystem(fileSystem: IFileSystem): void;
}
```

# IPathOperationsService.ts

```typescript
import * as path from 'path';

export interface IPathOperationsService {
  /**
   * Join all arguments together and normalize the resulting path
   */
  join(...paths: string[]): string;

  /**
   * Resolves a sequence of paths or path segments into an absolute path
   */
  resolve(...paths: string[]): string;

  /**
   * Returns the directory name of a path
   */
  dirname(filePath: string): string;

  /**
   * Returns the last portion of a path
   */
  basename(filePath: string): string;

  /**
   * Normalize a string path, reducing '..' and '.' parts
   */
  normalize(filePath: string): string;

  /**
   * Determines if path is an absolute path
   */
  isAbsolute(filePath: string): boolean;

  /**
   * Returns the relative path from 'from' to 'to'
   */
  relative(from: string, to: string): string;

  /**
   * Returns an object whose properties represent significant elements of the path
   */
  parse(filePath: string): path.ParsedPath;
}
```

# NodeFileSystem.ts

```typescript
import * as fs from 'fs-extra';
import { watch } from 'fs/promises';
import type { IFileSystem } from './IFileSystem.js';
import type { Stats } from 'fs';

/**
 * Adapter to use Node's fs-extra as our IFileSystem implementation
 */
export class NodeFileSystem implements IFileSystem {
  async readFile(path: string): Promise<string> {
    return fs.readFile(path, 'utf-8');
  }

  async writeFile(path: string, content: string): Promise<void> {
    await fs.writeFile(path, content, 'utf-8');
  }

  async exists(path: string): Promise<boolean> {
    return fs.pathExists(path);
  }

  async stat(path: string): Promise<Stats> {
    return fs.stat(path);
  }

  async readDir(path: string): Promise<string[]> {
    return fs.readdir(path);
  }

  async mkdir(path: string): Promise<void> {
    await fs.mkdir(path, { recursive: true });
  }

  async isDirectory(path: string): Promise<boolean> {
    try {
      const stats = await fs.stat(path);
      return stats.isDirectory();
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  async isFile(path: string): Promise<boolean> {
    try {
      const stats = await fs.stat(path);
      return stats.isFile();
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  watch(path: string, options?: { recursive?: boolean }): AsyncIterableIterator<{ filename: string; eventType: string }> {
    return watch(path, options) as AsyncIterableIterator<{ filename: string; eventType: string }>;
  }
}
```

# PathOperationsService.test.ts

```typescript
import { describe, it, expect } from 'vitest';
import { PathOperationsService } from './PathOperationsService';
import path from 'path';

describe('PathOperationsService', () => {
  let service: PathOperationsService;

  beforeEach(() => {
    service = new PathOperationsService();
  });

  describe('Path operations', () => {
    it('joins paths', () => {
      expect(service.join('project', 'nested', 'file.txt'))
        .toBe('project/nested/file.txt');
    });

    it('resolves paths', () => {
      expect(service.resolve('project/nested', '../file.txt'))
        .toBe(path.resolve('project/file.txt'));
    });

    it('gets dirname', () => {
      expect(service.dirname('project/nested/file.txt'))
        .toBe('project/nested');
    });

    it('gets basename', () => {
      expect(service.basename('project/nested/file.txt'))
        .toBe('file.txt');
    });

    it('normalizes paths', () => {
      expect(service.normalize('project/./nested/../file.txt'))
        .toBe('project/file.txt');
    });

    it('checks if path is absolute', () => {
      expect(service.isAbsolute('/absolute/path')).toBe(true);
      expect(service.isAbsolute('relative/path')).toBe(false);
    });

    it('gets relative path', () => {
      expect(service.relative('/base/dir', '/base/dir/sub/file.txt'))
        .toBe('sub/file.txt');
      expect(service.relative('/base/dir', '/other/dir'))
        .toBe('../../other/dir');
    });

    it('parses paths', () => {
      const parsed = service.parse('/base/dir/file.txt');
      expect(parsed).toEqual({
        root: '/',
        dir: '/base/dir',
        base: 'file.txt',
        ext: '.txt',
        name: 'file'
      });
    });
  });
});
```

# PathOperationsService.ts

```typescript
import * as path from 'path';
import { IPathOperationsService } from './IPathOperationsService.js';

export class PathOperationsService implements IPathOperationsService {
  join(...paths: string[]): string {
    return path.join(...paths);
  }

  resolve(...paths: string[]): string {
    return path.resolve(...paths);
  }

  dirname(filePath: string): string {
    return path.dirname(filePath);
  }

  basename(filePath: string): string {
    return path.basename(filePath);
  }

  normalize(filePath: string): string {
    return path.normalize(filePath);
  }

  isAbsolute(filePath: string): boolean {
    return path.isAbsolute(filePath);
  }

  relative(from: string, to: string): string {
    return path.relative(from, to);
  }

  parse(filePath: string): path.ParsedPath {
    return path.parse(filePath);
  }
}
```

# IPathService.ts

```typescript
import { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { Location } from '@core/types/index.js';

/**
 * Options for path validation and operations
 */
export interface PathOptions {
  /**
   * Base directory to resolve relative paths against.
   * For paths without slashes, this is used as the base directory.
   * For paths with $. or $~, this is ignored.
   */
  baseDir?: string;

  /**
   * Whether to allow paths outside the base directory.
   * If false, paths must be within the base directory.
   * Default is true.
   */
  allowOutsideBaseDir?: boolean;

  /**
   * Whether the path must exist on disk.
   * @default true
   */
  mustExist?: boolean;

  /**
   * Whether the path must be a file (not a directory).
   * Only checked if mustExist is true.
   * @default false
   */
  mustBeFile?: boolean;

  /**
   * Whether the path must be a directory (not a file).
   * Only checked if mustExist is true.
   * @default false
   */
  mustBeDirectory?: boolean;

  location?: Location;
}

/**
 * Service for validating and normalizing paths according to Meld's strict rules:
 *
 * 1. Simple paths (no slashes):
 *    - Allowed only when path contains no slashes
 *    - Example: file.meld
 *
 * 2. Paths with slashes:
 *    - Must start with $. (alias for $PROJECTPATH) or $~ (alias for $HOMEPATH)
 *    - Example: $./path/to/file.meld or $~/path/to/file.meld
 *
 * 3. Forbidden:
 *    - Parent directory references (..)
 *    - Current directory references (.)
 *    - Raw absolute paths
 *    - Paths with slashes not using $. or $~
 */
export interface IPathService {
  /**
   * Initialize the path service with a file system service.
   * Must be called before using any other methods.
   */
  initialize(fileSystem: IFileSystemService): void;

  /**
   * Enable test mode for path operations.
   * In test mode, certain validations may be relaxed or mocked.
   */
  enableTestMode(): void;

  /**
   * Disable test mode for path operations.
   */
  disableTestMode(): void;

  /**
   * Check if test mode is enabled.
   */
  isTestMode(): boolean;

  /**
   * Resolve a path to its absolute form according to Meld's path rules:
   * - Simple paths are resolved relative to baseDir or cwd
   * - $. paths are resolved relative to project root
   * - $~ paths are resolved relative to home directory
   *
   * @param filePath The path to resolve
   * @param baseDir Optional base directory for simple paths
   * @returns The resolved absolute path
   * @throws PathValidationError if path format is invalid
   */
  resolvePath(filePath: string, baseDir?: string): string;

  /**
   * Validate a path according to Meld's rules and the specified options.
   *
   * @param filePath The path to validate
   * @param options Options for validation
   * @throws PathValidationError if validation fails
   */
  validatePath(filePath: string, options?: PathOptions): Promise<string>;

  /**
   * Join multiple path segments together.
   * Note: This is a low-level utility and does not enforce Meld path rules.
   *
   * @param paths The path segments to join
   * @returns The joined path
   */
  join(...paths: string[]): string;

  /**
   * Get the directory name of a path.
   * Note: This is a low-level utility and does not enforce Meld path rules.
   *
   * @param filePath The path to get the directory from
   * @returns The directory name
   */
  dirname(filePath: string): string;

  /**
   * Get the base name of a path.
   * Note: This is a low-level utility and does not enforce Meld path rules.
   *
   * @param filePath The path to get the base name from
   * @returns The base name
   */
  basename(filePath: string): string;
}
```

# PathService.test.ts

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestContext } from '@tests/utils/TestContext.js';
import { PathService } from './PathService.js';
import { PathValidationError, PathErrorCode } from './errors/PathValidationError.js';
import type { Location } from '@core/types/index.js';

describe('PathService', () => {
  let context: TestContext;
  let service: PathService;

  beforeEach(async () => {
    context = new TestContext();
    await context.initialize();
    service = context.services.path;
    service.setHomePath('/home/user');
    service.setProjectPath('/project/root');
  });

  afterEach(async () => {
    await context.cleanup();
  });

  describe('Path validation', () => {
    it('validates empty path', async () => {
      await expect(service.validatePath('')).rejects.toThrow(PathValidationError);
    });

    it('validates path with null bytes', async () => {
      await expect(service.validatePath('test\0.txt')).rejects.toThrow(PathValidationError);
    });

    it('validates path is within base directory', async () => {
      const filePath = '$./test.txt';
      const outsidePath = '$~/outside.txt';
      const location: Location = {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 10 }
      };

      // Create test files
      await context.fs.writeFile('/project/root/test.txt', 'test');
      await context.fs.writeFile('/home/user/outside.txt', 'test');

      // Test path within base dir
      await expect(service.validatePath(filePath, {
        allowOutsideBaseDir: false,
        location
      })).resolves.not.toThrow();

      // Test path outside base dir
      await expect(service.validatePath(outsidePath, {
        allowOutsideBaseDir: false,
        location
      })).rejects.toThrow(PathValidationError);
    });

    it('allows paths outside base directory when configured', async () => {
      const filePath = '$~/outside.txt';
      const location: Location = {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 10 }
      };

      // Create test file
      await context.fs.writeFile('/home/user/outside.txt', 'test');

      await expect(service.validatePath(filePath, {
        allowOutsideBaseDir: true,
        location
      })).resolves.not.toThrow();
    });

    it('validates file existence', async () => {
      const filePath = '$./test.txt';
      const location: Location = {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 10 }
      };

      // Create test file
      await context.fs.writeFile('/project/root/test.txt', 'test');

      // Should pass for existing file
      await expect(service.validatePath(filePath, {
        mustExist: true,
        location
      })).resolves.not.toThrow();

      // Should fail for non-existent file
      await expect(service.validatePath('$./nonexistent.txt', {
        mustExist: true,
        location
      })).rejects.toThrow(PathValidationError);
    });

    it('skips existence check when configured', async () => {
      const filePath = '$./nonexistent.txt';
      const location: Location = {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 10 }
      };

      await expect(service.validatePath(filePath, {
        mustExist: false,
        location
      })).resolves.not.toThrow();
    });

    it('validates file type', async () => {
      const filePath = '$./test.txt';
      const dirPath = '$./testdir';
      const location: Location = {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 10 }
      };

      // Create test file and directory
      await context.fs.writeFile('/project/root/test.txt', 'test');
      await context.fs.mkdir('/project/root/testdir');

      await expect(service.validatePath(filePath, {
        mustBeFile: true,
        location
      })).resolves.not.toThrow();

      await expect(service.validatePath(dirPath, {
        mustBeFile: true,
        location
      })).rejects.toThrow(PathValidationError);

      await expect(service.validatePath(dirPath, {
        mustBeDirectory: true,
        location
      })).resolves.not.toThrow();

      await expect(service.validatePath(filePath, {
        mustBeDirectory: true,
        location
      })).rejects.toThrow(PathValidationError);
    });
  });

  describe('Path normalization', () => {
    it('normalizes paths', () => {
      expect(service.normalizePath('path/./to/../file.txt'))
        .toBe('path/file.txt');
    });

    it('joins paths', () => {
      expect(service.join('path', 'to', 'file.txt'))
        .toBe('path/to/file.txt');
    });

    it('gets dirname', () => {
      expect(service.dirname('path/to/file.txt'))
        .toBe('path/to');
    });

    it('gets basename', () => {
      expect(service.basename('path/to/file.txt'))
        .toBe('file.txt');
    });
  });

  describe('Test mode', () => {
    it('toggles test mode', () => {
      service.enableTestMode();
      expect(service.isTestMode()).toBe(true);

      service.disableTestMode();
      expect(service.isTestMode()).toBe(false);
    });
  });
});
```

# PathService.tmp.test.ts

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestContext } from '@tests/utils/TestContext.js';
import { PathService } from './PathService.js';
import { PathValidationError, PathErrorCode } from './errors/PathValidationError.js';
import type { Location } from '@core/types/index.js';

describe('PathService Temporary Path Rules', () => {
  let context: TestContext;
  let service: PathService;

  beforeEach(async () => {
    // Initialize test context
    context = new TestContext();
    await context.initialize();

    // Get PathService from context
    service = context.services.path;

    // Set known paths for testing
    service.setHomePath('/home/user');
    service.setProjectPath('/project/root');
  });

  afterEach(async () => {
    await context.cleanup();
  });

  it.skip('should allow simple filenames in current directory', () => {
    const result = service.resolvePath('file.meld', '/current/dir');
    expect(result).toBe('/current/dir/file.meld');
  });

  describe.skip('Special path variables', () => {
    it('should resolve $HOMEPATH paths', () => {
      const result = service.resolvePath('$HOMEPATH/path/to/file.meld');
      expect(result).toBe('/home/user/path/to/file.meld');
    });

    it('should resolve $~ paths (alias for $HOMEPATH)', () => {
      const result = service.resolvePath('$~/path/to/file.meld');
      expect(result).toBe('/home/user/path/to/file.meld');
    });

    it('should resolve $PROJECTPATH paths', () => {
      const result = service.resolvePath('$PROJECTPATH/path/to/file.meld');
      expect(result).toBe('/project/root/path/to/file.meld');
    });

    it('should resolve $. paths (alias for $PROJECTPATH)', () => {
      const result = service.resolvePath('$./path/to/file.meld');
      expect(result).toBe('/project/root/path/to/file.meld');
    });
  });

  it.skip('should reject simple paths containing dots', () => {
    expect(() => service.resolvePath('./file.meld')).toThrow(PathValidationError);
    expect(() => service.resolvePath('../file.meld')).toThrow(PathValidationError);
  });

  describe('Path validation rules', () => {
    it('should reject paths with .. segments', () => {
      expect(() => service.resolvePath('$./path/../file.meld'))
        .toThrow(new PathValidationError(
          'Path cannot contain . or .. segments - use $. or $~ to reference project or home directory',
          PathErrorCode.CONTAINS_DOT_SEGMENTS
        ));
    });

    it('should reject paths with . segments', () => {
      expect(() => service.resolvePath('$./path/./file.meld'))
        .toThrow(new PathValidationError(
          'Path cannot contain . or .. segments - use $. or $~ to reference project or home directory',
          PathErrorCode.CONTAINS_DOT_SEGMENTS
        ));
    });

    it.skip('should reject raw absolute paths', () => {
      expect(() => service.resolvePath('/absolute/path/file.meld'))
        .toThrow(new PathValidationError(
          'Raw absolute paths are not allowed - use $. for project-relative paths and $~ for home-relative paths',
          PathErrorCode.RAW_ABSOLUTE_PATH
        ));
    });

    it('should reject paths with slashes but no path variable', () => {
      expect(() => service.resolvePath('path/to/file.meld'))
        .toThrow(new PathValidationError(
          'Paths with slashes must start with $. or $~ - use $. for project-relative paths and $~ for home-relative paths',
          PathErrorCode.INVALID_PATH_FORMAT
        ));
    });
  });

  describe('Error messages and codes', () => {
    it('should provide helpful error messages for dot segments', () => {
      try {
        service.resolvePath('$./path/../file.meld');
        fail('Should have thrown error');
      } catch (e) {
        const err = e as PathValidationError;
        expect(err.code).toBe(PathErrorCode.CONTAINS_DOT_SEGMENTS);
        expect(err.message).toContain('use $. or $~ to reference');
      }
    });

    it.skip('should provide helpful error messages for raw absolute paths', () => {
      try {
        service.resolvePath('/absolute/path.meld');
        fail('Should have thrown error');
      } catch (e) {
        const err = e as PathValidationError;
        expect(err.code).toBe(PathErrorCode.RAW_ABSOLUTE_PATH);
        expect(err.message).toContain('use $. for project-relative paths');
      }
    });

    it('should provide helpful error messages for invalid path formats', () => {
      try {
        service.resolvePath('path/to/file.meld');
        fail('Should have thrown error');
      } catch (e) {
        const err = e as PathValidationError;
        expect(err.code).toBe(PathErrorCode.INVALID_PATH_FORMAT);
        expect(err.message).toContain('must start with $. or $~');
      }
    });
  });

  describe('Location information in errors', () => {
    const testLocation: Location = {
      start: { line: 1, column: 1 },
      end: { line: 1, column: 20 },
      filePath: 'test.meld'
    };

    it('should include location information in errors when provided', () => {
      try {
        service.validateMeldPath('../invalid.meld', testLocation);
        fail('Should have thrown error');
      } catch (e) {
        const err = e as PathValidationError;
        expect(err.location).toBe(testLocation);
      }
    });
  });
});
```

# PathService.ts

```typescript
import { IPathService, PathOptions } from './IPathService.js';
import { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { PathValidationError, PathErrorCode } from './errors/PathValidationError.js';
import type { Location } from '@core/types/index.js';
import * as path from 'path';

const PATH_ALIAS_PATTERN = /^\$(\.\/|~\/)/;
const CONTAINS_SLASH = /\//;
const CONTAINS_DOT_SEGMENTS = /^\.\.?$|\/\.\.?(?:\/|$)/;

/**
 * Service for validating and normalizing paths
 */
export class PathService implements IPathService {
  private fs!: IFileSystemService;
  private testMode: boolean = false;
  private homePath: string;
  private projectPath: string;

  constructor() {
    this.homePath = process.env.HOME || process.env.USERPROFILE || '/';
    this.projectPath = process.cwd();
  }

  /**
   * Initialize the path service with a file system service
   */
  initialize(fileSystem: IFileSystemService): void {
    this.fs = fileSystem;
  }

  /**
   * Enable test mode for path operations
   */
  enableTestMode(): void {
    this.testMode = true;
  }

  /**
   * Disable test mode for path operations
   */
  disableTestMode(): void {
    this.testMode = false;
  }

  /**
   * Check if test mode is enabled
   */
  isTestMode(): boolean {
    return this.testMode;
  }

  /**
   * Set home path for testing
   */
  setHomePath(path: string): void {
    this.homePath = path;
  }

  /**
   * Set project path for testing
   */
  setProjectPath(path: string): void {
    this.projectPath = path;
  }

  /**
   * Validate a path according to Meld's strict path rules
   */
  private validateMeldPath(filePath: string, location?: Location): void {
    // Check for dot segments (. or ..)
    if (CONTAINS_DOT_SEGMENTS.test(filePath)) {
      throw new PathValidationError(
        'Path cannot contain . or .. segments - use $. or $~ to reference project or home directory',
        PathErrorCode.CONTAINS_DOT_SEGMENTS,
        location
      );
    }

    // If path contains slashes, it must start with a path variable
    if (CONTAINS_SLASH.test(filePath) && !PATH_ALIAS_PATTERN.test(filePath)) {
      throw new PathValidationError(
        'Paths with slashes must start with $. or $~ - use $. for project-relative paths and $~ for home-relative paths',
        PathErrorCode.INVALID_PATH_FORMAT,
        location
      );
    }

    // Check for raw absolute paths
    if (path.isAbsolute(filePath)) {
      throw new PathValidationError(
        'Raw absolute paths are not allowed - use $. for project-relative paths and $~ for home-relative paths',
        PathErrorCode.RAW_ABSOLUTE_PATH,
        location
      );
    }
  }

  /**
   * Resolve a path to its absolute form, handling special variables
   */
  resolvePath(filePath: string, baseDir?: string): string {
    // First validate the path according to Meld rules
    this.validateMeldPath(filePath);

    // Handle special path variables
    if (filePath.startsWith('$HOMEPATH/') || filePath.startsWith('$~/')) {
      return path.normalize(path.join(this.homePath, filePath.substring(filePath.indexOf('/') + 1)));
    }
    if (filePath.startsWith('$PROJECTPATH/') || filePath.startsWith('$./')) {
      return path.normalize(path.join(this.projectPath, filePath.substring(filePath.indexOf('/') + 1)));
    }

    // If path contains no slashes, treat as relative to current directory
    if (!CONTAINS_SLASH.test(filePath)) {
      return path.normalize(path.join(baseDir || process.cwd(), filePath));
    }

    // At this point, any other path format is invalid
    throw new PathValidationError(
      'Invalid path format - paths must either be simple filenames or start with $. or $~',
      PathErrorCode.INVALID_PATH_FORMAT
    );
  }

  /**
   * Validate a path according to the specified options
   */
  async validatePath(filePath: string, options: PathOptions = {}): Promise<string> {
    // Basic validation
    if (!filePath) {
      throw new PathValidationError(
        'Path cannot be empty',
        PathErrorCode.INVALID_PATH,
        options.location
      );
    }

    if (filePath.includes('\0')) {
      throw new PathValidationError(
        'Path cannot contain null bytes',
        PathErrorCode.NULL_BYTE,
        options.location
      );
    }

    // Skip validation in test mode unless explicitly required
    if (this.testMode && !options.mustExist) {
      return filePath;
    }

    // Handle special path variables and validate Meld path rules
    let resolvedPath = this.resolvePath(filePath, options.baseDir);

    // Check if path is within base directory when required
    if (options.allowOutsideBaseDir === false) {
      const baseDir = options.baseDir || this.projectPath;
      const normalizedPath = path.normalize(resolvedPath);
      const normalizedBase = path.normalize(baseDir);

      if (!normalizedPath.startsWith(normalizedBase)) {
        throw new PathValidationError(
          `Path must be within base directory: ${baseDir}`,
          PathErrorCode.OUTSIDE_BASE_DIR,
          options.location
        );
      }
    }

    // Check existence if required
    if (options.mustExist || options.mustBeFile || options.mustBeDirectory) {
      const exists = await this.fs.exists(resolvedPath);
      if (!exists) {
        throw new PathValidationError(
          `Path does not exist: ${resolvedPath}`,
          PathErrorCode.PATH_NOT_FOUND,
          options.location
        );
      }

      // Check file type if specified
      if (options.mustBeFile) {
        const isFile = await this.fs.isFile(resolvedPath);
        if (!isFile) {
          throw new PathValidationError(
            `Path must be a file: ${resolvedPath}`,
            PathErrorCode.NOT_A_FILE,
            options.location
          );
        }
      }

      if (options.mustBeDirectory) {
        const isDirectory = await this.fs.isDirectory(resolvedPath);
        if (!isDirectory) {
          throw new PathValidationError(
            `Path must be a directory: ${resolvedPath}`,
            PathErrorCode.NOT_A_DIRECTORY,
            options.location
          );
        }
      }
    }

    return resolvedPath;
  }

  /**
   * Normalize a path by resolving '..' and '.' segments
   */
  normalizePath(filePath: string): string {
    return path.normalize(filePath);
  }

  /**
   * Join multiple path segments together
   */
  join(...paths: string[]): string {
    return path.join(...paths);
  }

  /**
   * Get the directory name of a path
   */
  dirname(pathStr: string): string {
    return path.dirname(pathStr);
  }

  /**
   * Get the base name of a path
   */
  basename(pathStr: string): string {
    return path.basename(pathStr);
  }
}
```

# PathValidationError.ts

```typescript
import { PathOptions } from '../IPathService.js';
import type { Location } from '@core/types/index.js';

/**
 * Error codes for path validation failures
 */
export enum PathErrorCode {
  // Basic validation
  INVALID_PATH = 'INVALID_PATH',
  NULL_BYTE = 'NULL_BYTE',
  PATH_NOT_FOUND = 'PATH_NOT_FOUND',

  // File type validation
  NOT_A_FILE = 'NOT_A_FILE',
  NOT_A_DIRECTORY = 'NOT_A_DIRECTORY',

  // Meld-specific path rules
  CONTAINS_DOT_SEGMENTS = 'CONTAINS_DOT_SEGMENTS',     // Path contains . or .. segments
  INVALID_PATH_FORMAT = 'INVALID_PATH_FORMAT',         // Path with slashes doesn't use $. or $~
  RAW_ABSOLUTE_PATH = 'RAW_ABSOLUTE_PATH',            // Path is absolute but doesn't use $. or $~
  OUTSIDE_BASE_DIR = 'OUTSIDE_BASE_DIR'
}

/**
 * Error thrown when path validation fails
 */
export class PathValidationError extends Error {
  constructor(
    message: string,
    public code: PathErrorCode,
    public location?: Location
  ) {
    super(message);
    this.name = 'PathValidationError';
  }
}
```

# CircularityService.test.ts

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { CircularityService } from './CircularityService.js';
import { MeldImportError } from '@core/errors/MeldImportError.js';

describe('CircularityService', () => {
  let service: CircularityService;

  beforeEach(() => {
    service = new CircularityService();
  });

  describe('Basic import tracking', () => {
    it('should track imports in stack', () => {
      service.beginImport('fileA.meld');
      expect(service.isInStack('fileA.meld')).toBe(true);
      expect(service.getImportStack()).toEqual(['fileA.meld']);
    });

    it('should remove imports from stack', () => {
      service.beginImport('fileA.meld');
      service.endImport('fileA.meld');
      expect(service.isInStack('fileA.meld')).toBe(false);
      expect(service.getImportStack()).toEqual([]);
    });

    it('should handle multiple imports in LIFO order', () => {
      service.beginImport('fileA.meld');
      service.beginImport('fileB.meld');
      service.beginImport('fileC.meld');

      expect(service.getImportStack()).toEqual([
        'fileA.meld',
        'fileB.meld',
        'fileC.meld'
      ]);

      service.endImport('fileC.meld');
      expect(service.getImportStack()).toEqual([
        'fileA.meld',
        'fileB.meld'
      ]);
    });
  });

  describe('Circular import detection', () => {
    it('should detect direct circular imports', () => {
      service.beginImport('fileA.meld');

      expect(() => service.beginImport('fileA.meld'))
        .toThrow(MeldImportError);
    });

    it('should detect indirect circular imports', () => {
      service.beginImport('fileA.meld');
      service.beginImport('fileB.meld');

      expect(() => service.beginImport('fileA.meld'))
        .toThrow(MeldImportError);
    });

    it('should include import chain in error', () => {
      service.beginImport('fileA.meld');
      service.beginImport('fileB.meld');

      try {
        service.beginImport('fileA.meld');
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MeldImportError);
        if (error instanceof MeldImportError) {
          expect(error.details?.importChain).toEqual([
            'fileA.meld',
            'fileB.meld',
            'fileA.meld'
          ]);
        }
      }
    });

    it('should allow reimporting after file is removed from stack', () => {
      service.beginImport('fileA.meld');
      service.endImport('fileA.meld');

      expect(() => service.beginImport('fileA.meld'))
        .not.toThrow();
    });
  });

  describe('Stack management', () => {
    it('should reset the stack', () => {
      service.beginImport('fileA.meld');
      service.beginImport('fileB.meld');

      service.reset();

      expect(service.getImportStack()).toEqual([]);
      expect(service.isInStack('fileA.meld')).toBe(false);
      expect(service.isInStack('fileB.meld')).toBe(false);
    });

    it('should handle ending import for file not in stack', () => {
      expect(() => service.endImport('nonexistent.meld'))
        .not.toThrow();
    });

    it('should maintain stack order when ending imports out of order', () => {
      service.beginImport('fileA.meld');
      service.beginImport('fileB.meld');
      service.beginImport('fileC.meld');

      service.endImport('fileB.meld');

      expect(service.getImportStack()).toEqual([
        'fileA.meld',
        'fileC.meld'
      ]);
    });
  });
});
```

# CircularityService.ts

```typescript
import { ICircularityService } from './ICircularityService.js';
import { MeldImportError } from '@core/errors/MeldImportError.js';
import { importLogger as logger } from '@core/utils/logger.js';

export class CircularityService implements ICircularityService {
  private importStack: string[] = [];

  beginImport(filePath: string): void {
    logger.debug('Beginning import', {
      filePath,
      currentStack: this.importStack
    });

    if (this.isInStack(filePath)) {
      const importChain = [...this.importStack, filePath];
      logger.error('Circular import detected', {
        filePath,
        importChain
      });

      throw new MeldImportError(
        `Circular import detected for file: ${filePath}`,
        'circular_import',
        { importChain }
      );
    }

    this.importStack.push(filePath);
  }

  endImport(filePath: string): void {
    const idx = this.importStack.lastIndexOf(filePath);
    if (idx !== -1) {
      this.importStack.splice(idx, 1);
      logger.debug('Ended import', {
        filePath,
        remainingStack: this.importStack
      });
    } else {
      logger.warn('Attempted to end import for file not in stack', {
        filePath,
        currentStack: this.importStack
      });
    }
  }

  isInStack(filePath: string): boolean {
    return this.importStack.includes(filePath);
  }

  getImportStack(): string[] {
    return [...this.importStack];
  }

  reset(): void {
    logger.debug('Resetting import stack', {
      previousStack: this.importStack
    });
    this.importStack = [];
  }
}
```

# ICircularityService.ts

```typescript
/**
 * Service for tracking and detecting circular imports in Meld files.
 */
export interface ICircularityService {
  /**
   * Called at the start of an import operation.
   * @throws {MeldImportError} If a circular import is detected
   */
  beginImport(filePath: string): void;

  /**
   * Called after import is finished (success or failure).
   * Removes filePath from the import stack.
   */
  endImport(filePath: string): void;

  /**
   * Check if a file is currently in the import stack.
   */
  isInStack(filePath: string): boolean;

  /**
   * Get the current import stack.
   */
  getImportStack(): string[];

  /**
   * Clear the import stack.
   */
  reset(): void;
}
```

# IResolutionService.ts

```typescript
import type { MeldNode } from 'meld-spec';
import { IStateService } from '@services/state/StateService/IStateService.js';

/**
 * Context for variable resolution, specifying what types of variables and operations are allowed
 */
export interface ResolutionContext {
  /** Current file being processed, for error reporting */
  currentFilePath?: string;

  /** What types of variables are allowed in this context */
  allowedVariableTypes: {
    text: boolean;    // ${var}
    data: boolean;    // #{data}
    path: boolean;    // $path
    command: boolean; // $command
  };

  /** Path validation rules when resolving paths */
  pathValidation?: {
    requireAbsolute: boolean;
    allowedRoots: string[]; // e.g. [$HOMEPATH, $PROJECTPATH]
  };

  /** Whether field access is allowed for data variables */
  allowDataFields?: boolean;

  /** The state service to use for variable resolution */
  state: IStateService;
}

/**
 * Error codes for resolution failures
 */
export enum ResolutionErrorCode {
  UNDEFINED_VARIABLE = 'UNDEFINED_VARIABLE',
  CIRCULAR_REFERENCE = 'CIRCULAR_REFERENCE',
  INVALID_CONTEXT = 'INVALID_CONTEXT',
  INVALID_VARIABLE_TYPE = 'INVALID_VARIABLE_TYPE',
  INVALID_PATH = 'INVALID_PATH',
  MAX_ITERATIONS_EXCEEDED = 'MAX_ITERATIONS_EXCEEDED',
  SYNTAX_ERROR = 'SYNTAX_ERROR',
  FIELD_ACCESS_ERROR = 'FIELD_ACCESS_ERROR',
  MAX_DEPTH_EXCEEDED = 'MAX_DEPTH_EXCEEDED',
  RESOLUTION_FAILED = 'RESOLUTION_FAILED',
  INVALID_NODE_TYPE = 'INVALID_NODE_TYPE',
  INVALID_COMMAND = 'INVALID_COMMAND',
  VARIABLE_NOT_FOUND = 'VARIABLE_NOT_FOUND',
  INVALID_FIELD = 'INVALID_FIELD',
  COMMAND_NOT_FOUND = 'COMMAND_NOT_FOUND',
  SECTION_NOT_FOUND = 'SECTION_NOT_FOUND'
}

/**
 * Service responsible for resolving variables, commands, and paths in different contexts
 */
export interface IResolutionService {
  /**
   * Resolve text variables (${var}) in a string
   */
  resolveText(text: string, context: ResolutionContext): Promise<string>;

  /**
   * Resolve data variables and fields (#{data.field}) to their values
   */
  resolveData(ref: string, context: ResolutionContext): Promise<any>;

  /**
   * Resolve path variables ($path) to absolute paths.
   * This includes $HOMEPATH/$~ and $PROJECTPATH/$. resolution.
   */
  resolvePath(path: string, context: ResolutionContext): Promise<string>;

  /**
   * Resolve command references ($command(args)) to their results
   */
  resolveCommand(cmd: string, args: string[], context: ResolutionContext): Promise<string>;

  /**
   * Resolve content from a file path
   */
  resolveFile(path: string): Promise<string>;

  /**
   * Resolve raw content nodes, preserving formatting but skipping comments
   */
  resolveContent(nodes: MeldNode[], context: ResolutionContext): Promise<string>;

  /**
   * Resolve any value based on the provided context rules
   */
  resolveInContext(value: string, context: ResolutionContext): Promise<string>;

  /**
   * Validate that resolution is allowed in the given context
   */
  validateResolution(value: string, context: ResolutionContext): Promise<void>;

  /**
   * Extract a section from content by its heading
   */
  extractSection(content: string, section: string): Promise<string>;

  /**
   * Check for circular variable references
   */
  detectCircularReferences(value: string): Promise<void>;
}
```

# ResolutionContextFactory.ts

```typescript
import { ResolutionContext } from './IResolutionService.js';

/**
 * Factory for creating resolution contexts appropriate for different directives
 */
export class ResolutionContextFactory {
  // Special path variables as defined by meld-ast
  private static readonly SPECIAL_PATH_VARS = ['HOMEPATH', 'PROJECTPATH'];

  /**
   * Create context for @text directives
   * Allows all variable types and nested interpolation
   */
  static forTextDirective(filePath?: string): ResolutionContext {
    return {
      currentFilePath: filePath,
      allowedVariableTypes: {
        text: true,
        data: true,
        path: true,
        command: true
      },
      allowNested: true
    };
  }

  /**
   * Create context for @run directives
   * Allows path and text variables, but no data fields
   */
  static forRunDirective(filePath?: string): ResolutionContext {
    return {
      currentFilePath: filePath,
      allowedVariableTypes: {
        text: true,
        data: false,
        path: true,
        command: true
      },
      allowNested: false
    };
  }

  /**
   * Create context for @path directives
   * Only allows path variables, requires absolute paths
   */
  static forPathDirective(filePath?: string): ResolutionContext {
    return {
      currentFilePath: filePath,
      allowedVariableTypes: {
        text: false,
        data: false,
        path: true,
        command: false
      },
      allowNested: false,
      pathValidation: {
        requireAbsolute: true,
        allowedRoots: ResolutionContextFactory.SPECIAL_PATH_VARS
      }
    };
  }

  /**
   * Create context for @data directives
   * Allows all variable types for flexible data definition
   */
  static forDataDirective(filePath?: string): ResolutionContext {
    return {
      currentFilePath: filePath,
      allowedVariableTypes: {
        text: true,
        data: true,
        path: true,
        command: true
      },
      allowNested: true
    };
  }

  /**
   * Create context for @import directives
   * Only allows path variables for security
   */
  static forImportDirective(filePath?: string): ResolutionContext {
    return {
      currentFilePath: filePath,
      allowedVariableTypes: {
        text: false,
        data: false,
        path: true,
        command: false
      },
      allowNested: false,
      pathValidation: {
        requireAbsolute: true,
        allowedRoots: ResolutionContextFactory.SPECIAL_PATH_VARS
      }
    };
  }

  /**
   * Create context for command parameters
   * Only allows text variables
   */
  static forCommandParameters(filePath?: string): ResolutionContext {
    return {
      currentFilePath: filePath,
      allowedVariableTypes: {
        text: true,
        data: false,
        path: false,
        command: false
      },
      allowNested: false
    };
  }

  /**
   * Create context for path resolution
   * Only allows path variables and requires absolute paths
   */
  static forPathResolution(filePath?: string): ResolutionContext {
    return {
      currentFilePath: filePath,
      allowedVariableTypes: {
        text: false,
        data: false,
        path: true,
        command: false
      },
      allowNested: false,
      pathValidation: {
        requireAbsolute: true,
        allowedRoots: ResolutionContextFactory.SPECIAL_PATH_VARS
      }
    };
  }
}
```

# ResolutionService.test.ts

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ResolutionService } from './ResolutionService.js';
import { IStateService } from '@services/state/StateService/IStateService.js';
import { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import { ResolutionContext } from './IResolutionService.js';
import { ResolutionError } from './errors/ResolutionError.js';
import type { MeldNode, DirectiveNode, TextNode } from 'meld-spec';

// Mock the logger
vi.mock('@core/utils/logger', () => ({
  resolutionLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('ResolutionService', () => {
  let service: ResolutionService;
  let stateService: IStateService;
  let fileSystemService: IFileSystemService;
  let parserService: IParserService;
  let context: ResolutionContext;

  beforeEach(() => {
    stateService = {
      getTextVar: vi.fn(),
      getDataVar: vi.fn(),
      getPathVar: vi.fn(),
      getCommand: vi.fn(),
    } as unknown as IStateService;

    fileSystemService = {
      exists: vi.fn(),
      readFile: vi.fn(),
    } as unknown as IFileSystemService;

    parserService = {
      parse: vi.fn(),
    } as unknown as IParserService;

    service = new ResolutionService(
      stateService,
      fileSystemService,
      parserService
    );

    context = {
      currentFilePath: 'test.meld',
      allowedVariableTypes: {
        text: true,
        data: true,
        path: true,
        command: true
      },
      state: stateService
    };
  });

  describe('resolveInContext', () => {
    it('should handle text nodes', async () => {
      const textNode: TextNode = {
        type: 'Text',
        content: 'simple text'
      };
      vi.mocked(parserService.parse).mockResolvedValue([textNode]);

      const result = await service.resolveInContext('simple text', context);
      expect(result).toBe('simple text');
    });

    it('should resolve text variables', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'greeting',
          value: 'Hello'
        }
      };
      vi.mocked(parserService.parse).mockResolvedValue([node]);
      vi.mocked(stateService.getTextVar).mockReturnValue('Hello World');

      const result = await service.resolveInContext('${greeting}', context);
      expect(result).toBe('Hello World');
    });

    it('should resolve data variables', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'data',
          identifier: 'config',
          value: '{ "key": "value" }'
        }
      };
      vi.mocked(parserService.parse).mockResolvedValue([node]);
      vi.mocked(stateService.getDataVar).mockReturnValue({ key: 'value' });

      const result = await service.resolveInContext('#{config}', context);
      expect(result).toBe('{"key":"value"}');
    });

    it('should resolve path variables', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'path',
          identifier: 'HOMEPATH'
        }
      };
      vi.mocked(parserService.parse).mockResolvedValue([node]);
      vi.mocked(stateService.getPathVar).mockReturnValue('/home/user');

      const result = await service.resolveInContext('$HOMEPATH', context);
      expect(result).toBe('/home/user');
    });

    it('should resolve command references', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'run',
          identifier: 'echo',
          value: '$echo(hello)',
          args: ['hello']
        }
      };
      vi.mocked(parserService.parse).mockResolvedValue([node]);
      vi.mocked(stateService.getCommand).mockReturnValue({
        command: '@run [echo ${text}]'
      });

      const result = await service.resolveInContext('$echo(hello)', context);
      expect(result).toBe('echo hello');
    });

    it('should handle parsing failures by treating value as text', async () => {
      vi.mocked(parserService.parse).mockRejectedValue(new Error('Parse error'));

      const result = await service.resolveInContext('unparseable content', context);
      expect(result).toBe('unparseable content');
    });

    it('should concatenate multiple nodes', async () => {
      const nodes: MeldNode[] = [
        {
          type: 'Text',
          content: 'Hello '
        },
        {
          type: 'Directive',
          directive: {
            kind: 'text',
            identifier: 'name',
            value: 'World'
          }
        }
      ];
      vi.mocked(parserService.parse).mockResolvedValue(nodes);
      vi.mocked(stateService.getTextVar).mockReturnValue('World');

      const result = await service.resolveInContext('Hello ${name}', context);
      expect(result).toBe('Hello World');
    });
  });

  describe('resolveContent', () => {
    it('should read file content', async () => {
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue('file content');

      const result = await service.resolveContent('/path/to/file');
      expect(result).toBe('file content');
      expect(fileSystemService.readFile).toHaveBeenCalledWith('/path/to/file');
    });

    it('should throw when file does not exist', async () => {
      vi.mocked(fileSystemService.exists).mockResolvedValue(false);

      await expect(service.resolveContent('/missing/file'))
        .rejects
        .toThrow('File not found: /missing/file');
    });
  });

  describe('extractSection', () => {
    it('should extract section by heading', async () => {
      const content = `# Title
Some content

## Section 1
Content 1

## Section 2
Content 2`;

      const result = await service.extractSection(content, 'Section 1');
      expect(result).toBe('## Section 1\n\nContent 1');
    });

    it('should include content until next heading of same or higher level', async () => {
      const content = `# Title
Some content

## Section 1
Content 1
### Subsection
Subcontent

## Section 2
Content 2`;

      const result = await service.extractSection(content, 'Section 1');
      expect(result).toBe('## Section 1\n\nContent 1\n\n### Subsection\n\nSubcontent');
    });

    it('should throw when section is not found', async () => {
      const content = '# Title\nContent';

      await expect(service.extractSection(content, 'Missing Section'))
        .rejects
        .toThrow('Section not found: Missing Section');
    });
  });

  describe('validateResolution', () => {
    it('should validate text variables are allowed', async () => {
      context.allowedVariableTypes.text = false;
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'var',
          value: 'value'
        }
      };
      vi.mocked(parserService.parse).mockResolvedValue([node]);

      await expect(service.validateResolution('${var}', context))
        .rejects
        .toThrow('Text variables are not allowed in this context');
    });

    it('should validate data variables are allowed', async () => {
      context.allowedVariableTypes.data = false;
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'data',
          identifier: 'var',
          value: 'value'
        }
      };
      vi.mocked(parserService.parse).mockResolvedValue([node]);

      await expect(service.validateResolution('#{var}', context))
        .rejects
        .toThrow('Data variables are not allowed in this context');
    });

    it('should validate path variables are allowed', async () => {
      context.allowedVariableTypes.path = false;
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'path',
          identifier: 'var'
        }
      };
      vi.mocked(parserService.parse).mockResolvedValue([node]);

      await expect(service.validateResolution('$var', context))
        .rejects
        .toThrow('Path variables are not allowed in this context');
    });

    it('should validate command references are allowed', async () => {
      context.allowedVariableTypes.command = false;
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'run',
          identifier: 'cmd',
          value: '$cmd()',
          args: []
        }
      };
      vi.mocked(parserService.parse).mockResolvedValue([node]);

      await expect(service.validateResolution('$cmd()', context))
        .rejects
        .toThrow('Command references are not allowed in this context');
    });
  });

  describe('detectCircularReferences', () => {
    it('should detect direct circular references', async () => {
      const nodeA: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'a',
          value: '${b}'
        }
      };
      const nodeB: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'b',
          value: '${a}'
        }
      };

      vi.mocked(parserService.parse)
        .mockImplementation((text) => {
          if (text === '${a}') return [nodeA];
          if (text === '${b}') return [nodeB];
          return [];
        });

      vi.mocked(stateService.getTextVar)
        .mockImplementation((name) => {
          if (name === 'a') return '${b}';
          if (name === 'b') return '${a}';
          return undefined;
        });

      await expect(service.detectCircularReferences('${a}'))
        .rejects
        .toThrow('Circular reference detected: a -> b -> a');
    });

    it('should handle non-circular references', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'greeting',
          value: 'Hello ${name}'
        }
      };
      vi.mocked(parserService.parse).mockResolvedValue([node]);
      vi.mocked(stateService.getTextVar)
        .mockReturnValueOnce('Hello ${name}')
        .mockReturnValueOnce('World');

      await expect(service.detectCircularReferences('${greeting}'))
        .resolves
        .not.toThrow();
    });
  });
});
```

# ResolutionService.ts

```typescript
import { IStateService } from '@services/state/StateService/IStateService.js';
import { IResolutionService, ResolutionContext, ResolutionErrorCode } from './IResolutionService.js';
import { ResolutionError } from './errors/ResolutionError.js';
import { TextResolver } from './resolvers/TextResolver.js';
import { DataResolver } from './resolvers/DataResolver.js';
import { PathResolver } from './resolvers/PathResolver.js';
import { CommandResolver } from './resolvers/CommandResolver.js';
import { ContentResolver } from './resolvers/ContentResolver.js';
import { resolutionLogger as logger } from '@core/utils/logger.js';
import { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { MeldNode, DirectiveNode, TextNode, DirectiveKind, CodeFenceNode } from 'meld-spec';
import { MeldFileNotFoundError } from '@core/errors/MeldFileNotFoundError.js';

/**
 * Internal type for heading nodes in the ResolutionService
 * This is converted from TextNode when we detect a heading pattern
 */
interface InternalHeadingNode {
  content: string;
  level: number;
}

/**
 * Convert a TextNode to an InternalHeadingNode if it matches heading pattern
 * Returns null if the node is not a heading
 */
function parseHeadingNode(node: TextNode): InternalHeadingNode | null {
  const headingMatch = node.content.match(/^(#{1,6})\s+(.+)$/);
  if (!headingMatch) {
    return null;
  }
  return {
    level: headingMatch[1].length,
    content: headingMatch[2].trim()
  };
}

/**
 * Check if a node is a text node that represents a heading
 */
function isHeadingTextNode(node: MeldNode): node is TextNode {
  return node.type === 'Text' && (node as TextNode).content.match(/^#{1,6}\s+.+$/) !== null;
}

/**
 * Service responsible for resolving variables, commands, and paths in different contexts
 */
export class ResolutionService implements IResolutionService {
  private textResolver: TextResolver;
  private dataResolver: DataResolver;
  private pathResolver: PathResolver;
  private commandResolver: CommandResolver;
  private contentResolver: ContentResolver;
  private readonly variablePattern = /\${([^}]+)}/g;

  constructor(
    private stateService: IStateService,
    private fileSystemService: IFileSystemService,
    private parserService: IParserService
  ) {
    this.textResolver = new TextResolver(stateService);
    this.dataResolver = new DataResolver(stateService);
    this.pathResolver = new PathResolver(stateService);
    this.commandResolver = new CommandResolver(stateService);
    this.contentResolver = new ContentResolver(stateService);
  }

  /**
   * Parse a string into AST nodes for resolution
   */
  private async parseForResolution(value: string): Promise<MeldNode[]> {
    try {
      const nodes = await this.parserService.parse(value);
      return nodes || [];
    } catch (error) {
      // If parsing fails, treat the value as literal text
      return [{
        type: 'Text',
        content: value
      } as TextNode];
    }
  }

  /**
   * Resolve text variables in a string
   */
  async resolveText(text: string, context: ResolutionContext): Promise<string> {
    const nodes = await this.parseForResolution(text);
    return this.textResolver.resolve(nodes[0] as DirectiveNode, context);
  }

  /**
   * Resolve data variables and fields
   */
  async resolveData(ref: string, context: ResolutionContext): Promise<any> {
    const nodes = await this.parseForResolution(ref);
    return this.dataResolver.resolve(nodes[0] as DirectiveNode, context);
  }

  /**
   * Resolve path variables
   */
  async resolvePath(path: string, context: ResolutionContext): Promise<string> {
    logger.debug('Resolving path', { path, context });
    const nodes = await this.parseForResolution(path);
    return this.pathResolver.resolve(nodes[0] as DirectiveNode, context);
  }

  /**
   * Resolve command references
   */
  async resolveCommand(cmd: string, args: string[], context: ResolutionContext): Promise<string> {
    const node: DirectiveNode = {
      type: 'Directive',
      directive: {
        kind: 'run',
        name: cmd,
        identifier: cmd,
        args
      }
    };
    return this.commandResolver.resolve(node, context);
  }

  /**
   * Resolve content from a file path
   */
  async resolveFile(path: string): Promise<string> {
    if (!await this.fileSystemService.exists(path)) {
      throw new MeldFileNotFoundError(path);
    }
    return this.fileSystemService.readFile(path);
  }

  /**
   * Resolve raw content nodes, preserving formatting but skipping comments
   */
  async resolveContent(nodes: MeldNode[], context: ResolutionContext): Promise<string> {
    if (!Array.isArray(nodes)) {
      // If a string path is provided, read the file
      const path = String(nodes);
      if (!await this.fileSystemService.exists(path)) {
        throw new ResolutionError(
          `File not found: ${path}`,
          ResolutionErrorCode.INVALID_PATH,
          { value: path }
        );
      }
      return this.fileSystemService.readFile(path);
    }

    // Otherwise, process the nodes
    return this.contentResolver.resolve(nodes, context);
  }

  /**
   * Resolve any value based on the provided context rules
   */
  async resolveInContext(value: string, context: ResolutionContext): Promise<string> {
    // 1. Validate resolution is allowed in this context
    await this.validateResolution(value, context);

    // 2. Initialize resolution tracking
    const resolutionPath: string[] = [];

    // 3. First pass: resolve nested variables
    let result = value;
    let hasNested = true;
    let iterations = 0;
    const MAX_ITERATIONS = 100;

    // Handle text variables (${...}) first since they may contain other variable types
    const textVarRegex = /\${([^}]+)}/g;
    let match: RegExpExecArray | null;

    while ((match = textVarRegex.exec(result)) !== null) {
      const [fullMatch, varName] = match;

      // Check for circular references
      if (resolutionPath.includes(varName)) {
        const path = [...resolutionPath, varName].join(' -> ');
        throw new ResolutionError(
          `Circular reference detected: ${path}`,
          ResolutionErrorCode.CIRCULAR_REFERENCE,
          { value, context }
        );
      }

      resolutionPath.push(varName);

      try {
        const varValue = context.state.getTextVar(varName);
        if (varValue === undefined) {
          throw new ResolutionError(
            `Undefined variable: ${varName}`,
            ResolutionErrorCode.UNDEFINED_VARIABLE,
            { value: varName, context }
          );
        }
        result = result.replace(fullMatch, varValue);
      } finally {
        resolutionPath.pop();
      }
    }

    // Handle data variables (#{...})
    const dataVarRegex = /#{([^}]+)}/g;
    while ((match = dataVarRegex.exec(result)) !== null) {
      const [fullMatch, varName] = match;

      // Check for circular references
      if (resolutionPath.includes(varName)) {
        const path = [...resolutionPath, varName].join(' -> ');
        throw new ResolutionError(
          `Circular reference detected: ${path}`,
          ResolutionErrorCode.CIRCULAR_REFERENCE,
          { value, context }
        );
      }

      resolutionPath.push(varName);

      try {
        const varValue = context.state.getDataVar(varName);
        if (varValue === undefined) {
          throw new ResolutionError(
            `Undefined data variable: ${varName}`,
            ResolutionErrorCode.UNDEFINED_VARIABLE,
            { value: varName, context }
          );
        }
        result = result.replace(fullMatch, JSON.stringify(varValue));
      } finally {
        resolutionPath.pop();
      }
    }

    // Handle command references ($command(args)) first
    const commandVarRegex = /\$([A-Za-z0-9_]+)\((.*?)\)/g;
    while ((match = commandVarRegex.exec(result)) !== null) {
      const [fullMatch, commandName, argsStr] = match;

      // Check for circular references
      if (resolutionPath.includes(commandName)) {
        const path = [...resolutionPath, commandName].join(' -> ');
        throw new ResolutionError(
          `Circular reference detected: ${path}`,
          ResolutionErrorCode.CIRCULAR_REFERENCE,
          { value, context }
        );
      }

      resolutionPath.push(commandName);

      try {
        const command = context.state.getCommand(commandName);
        if (command === undefined) {
          throw new ResolutionError(
            `Undefined command: ${commandName}`,
            ResolutionErrorCode.UNDEFINED_VARIABLE,
            { value: commandName, context }
          );
        }
        const args = argsStr.split(',').map(arg => arg.trim());
        result = result.replace(fullMatch, await this.resolveCommand(commandName, args, context));
      } finally {
        resolutionPath.pop();
      }
    }

    // Handle path variables ($path)
    const pathVarRegex = /\$([A-Za-z0-9_]+)/g;
    while ((match = pathVarRegex.exec(result)) !== null) {
      const [fullMatch, varName] = match;

      // Check for circular references
      if (resolutionPath.includes(varName)) {
        const path = [...resolutionPath, varName].join(' -> ');
        throw new ResolutionError(
          `Circular reference detected: ${path}`,
          ResolutionErrorCode.CIRCULAR_REFERENCE,
          { value, context }
        );
      }

      resolutionPath.push(varName);

      try {
        const varValue = context.state.getPathVar(varName);
        if (varValue === undefined) {
          throw new ResolutionError(
            `Undefined path variable: ${varName}`,
            ResolutionErrorCode.UNDEFINED_VARIABLE,
            { value: varName, context }
          );
        }
        result = result.replace(fullMatch, varValue);
      } finally {
        resolutionPath.pop();
      }
    }

    return result;
  }

  /**
   * Validate that resolution is allowed in the given context
   */
  async validateResolution(value: string, context: ResolutionContext): Promise<void> {
    // Parse the value to check for variable types
    const nodes = await this.parseForResolution(value);

    for (const node of nodes) {
      if (node.type !== 'Directive') continue;

      const directiveNode = node as DirectiveNode;
      // Check if the directive type is allowed
      switch (directiveNode.directive.kind) {
        case 'text':
          if (!context.allowedVariableTypes.text) {
            throw new ResolutionError(
              'Text variables are not allowed in this context',
              ResolutionErrorCode.INVALID_CONTEXT,
              { value, context }
            );
          }
          break;

        case 'data':
          if (!context.allowedVariableTypes.data) {
            throw new ResolutionError(
              'Data variables are not allowed in this context',
              ResolutionErrorCode.INVALID_CONTEXT,
              { value, context }
            );
          }
          break;

        case 'path':
          if (!context.allowedVariableTypes.path) {
            throw new ResolutionError(
              'Path variables are not allowed in this context',
              ResolutionErrorCode.INVALID_CONTEXT,
              { value, context }
            );
          }
          break;

        case 'run':
          if (!context.allowedVariableTypes.command) {
            throw new ResolutionError(
              'Command references are not allowed in this context',
              ResolutionErrorCode.INVALID_CONTEXT,
              { value, context }
            );
          }
          break;
      }
    }
  }

  /**
   * Check for circular variable references
   */
  async detectCircularReferences(value: string): Promise<void> {
    const visited = new Set<string>();
    const stack = new Set<string>();

    const checkReferences = async (text: string, currentRef?: string) => {
      // Parse the text to get variable references
      const nodes = await this.parseForResolution(text);
      if (!nodes || !Array.isArray(nodes)) {
        throw new ResolutionError(
          'Invalid parse result',
          ResolutionErrorCode.SYNTAX_ERROR,
          { value: text }
        );
      }

      for (const node of nodes) {
        if (node.type !== 'Directive') continue;

        const directiveNode = node as DirectiveNode;
        const ref = directiveNode.directive.identifier;
        if (!ref) continue;

        // Skip if this is a direct reference to the current variable
        if (ref === currentRef) continue;

        if (stack.has(ref)) {
          const path = Array.from(stack).join(' -> ');
          throw new ResolutionError(
            `Circular reference detected: ${path} -> ${ref}`,
            ResolutionErrorCode.CIRCULAR_REFERENCE,
            { value: text }
          );
        }

        if (!visited.has(ref)) {
          visited.add(ref);
          stack.add(ref);

          let refValue: string | undefined;

          switch (directiveNode.directive.kind) {
            case 'text':
              refValue = this.stateService.getTextVar(ref);
              break;
            case 'data':
              const dataValue = this.stateService.getDataVar(ref);
              if (dataValue && typeof dataValue === 'string') {
                refValue = dataValue;
              }
              break;
            case 'path':
              refValue = this.stateService.getPathVar(ref);
              break;
            case 'run':
              const cmdValue = this.stateService.getCommand(ref);
              if (cmdValue) {
                refValue = cmdValue.command;
              }
              break;
          }

          if (refValue) {
            await checkReferences(refValue, ref);
          }

          stack.delete(ref);
        }
      }
    };

    await checkReferences(value);
  }

  /**
   * Extract a section from content by its heading
   */
  async extractSection(content: string, heading: string, fuzzy?: number): Promise<string> {
    try {
      // Use llmxml for section extraction
      const { createLLMXML } = await import('llmxml');
      const llmxml = createLLMXML({
        defaultFuzzyThreshold: fuzzy || 0.7,
        warningLevel: 'none'
      });

      // Extract the section directly from markdown
      const section = await llmxml.getSection(content, heading, {
        exact: !fuzzy,
        includeNested: true,
        fuzzyThreshold: fuzzy
      });

      if (!section) {
        throw new ResolutionError(
          'Section not found: ' + heading,
          ResolutionErrorCode.SECTION_NOT_FOUND
        );
      }

      return section;
    } catch (error) {
      if (error instanceof ResolutionError) {
        throw error;
      }
      throw new ResolutionError(
        'Section not found: ' + heading,
        ResolutionErrorCode.SECTION_NOT_FOUND
      );
    }
  }

  private calculateSimilarity(str1: string, str2: string): number {
    // Convert strings to lowercase for case-insensitive comparison
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();

    // If either string is empty, return 0
    if (!s1 || !s2) {
      return 0;
    }

    // If strings are equal, return 1
    if (s1 === s2) {
      return 1;
    }

    // Calculate Levenshtein distance
    const m = s1.length;
    const n = s2.length;
    const d: number[][] = Array(m + 1).fill(0).map(() => Array(n + 1).fill(0));

    // Initialize first row and column
    for (let i = 0; i <= m; i++) {
      d[i][0] = i;
    }
    for (let j = 0; j <= n; j++) {
      d[0][j] = j;
    }

    // Fill in the rest of the matrix
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        d[i][j] = Math.min(
          d[i - 1][j] + 1,      // deletion
          d[i][j - 1] + 1,      // insertion
          d[i - 1][j - 1] + cost // substitution
        );
      }
    }

    // Convert distance to similarity score between 0 and 1
    const maxLength = Math.max(m, n);
    const distance = d[m][n];
    return 1 - (distance / maxLength);
  }

  private nodesToString(nodes: MeldNode[]): string {
    return nodes.map(node => {
      switch (node.type) {
        case 'Text':
          return (node as TextNode).content;
        case 'CodeFence':
          const codeFence = node as CodeFenceNode;
          return '```' + (codeFence.language || '') + '\n' + codeFence.content + '\n```';
        case 'Directive':
          const directive = node as DirectiveNode;
          return `@${directive.directive.kind} ${directive.directive.value || ''}`;
        default:
          return '';
      }
    }).join('\n');
  }
}
```

# ResolutionError.ts

```typescript
import { ResolutionContext, ResolutionErrorCode } from '@services/resolution/ResolutionService/IResolutionService.js';

/**
 * Error thrown when variable resolution fails
 */
export class ResolutionError extends Error {
  constructor(
    message: string,
    public readonly code: ResolutionErrorCode,
    public readonly details?: {
      value?: string;
      context?: ResolutionContext;
      cause?: Error;
      location?: {
        filePath?: string;
        line?: number;
        column?: number;
      };
    }
  ) {
    super(`Resolution error (${code}): ${message}`);
    this.name = 'ResolutionError';
  }
}
```

# CommandResolver.test.ts

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CommandResolver } from './CommandResolver.js';
import { IStateService } from '@services/state/StateService/IStateService.js';
import { ResolutionContext, ResolutionErrorCode } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';
import { TestContext } from '@tests/utils/TestContext.js';
import { MeldNode, DirectiveNode, TextNode } from 'meld-spec';

describe('CommandResolver', () => {
  let resolver: CommandResolver;
  let stateService: IStateService;
  let context: ResolutionContext;
  let testContext: TestContext;

  beforeEach(async () => {
    testContext = new TestContext();
    await testContext.initialize();

    stateService = testContext.factory.createMockStateService();
    resolver = new CommandResolver(stateService);

    context = {
      currentFilePath: 'test.meld',
      allowedVariableTypes: {
        text: true,
        data: true,
        path: true,
        command: true
      }
    };
  });

  afterEach(async () => {
    await testContext.cleanup();
  });

  describe('resolve', () => {
    it('should return content of text node unchanged', async () => {
      const node: TextNode = {
        type: 'Text',
        content: 'no commands here'
      };
      const result = await resolver.resolve(node, context);
      expect(result).toBe('no commands here');
    });

    it('should resolve command without parameters', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'run',
          identifier: 'simple',
          args: []
        }
      };
      vi.mocked(stateService.getCommand).mockReturnValue({
        command: '@run [echo test]'
      });

      const result = await resolver.resolve(node, context);
      expect(result).toBe('echo test');
      expect(stateService.getCommand).toHaveBeenCalledWith('simple');
    });

    it('should resolve command with parameters', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'run',
          identifier: 'echo',
          args: ['hello', 'world']
        }
      };
      vi.mocked(stateService.getCommand).mockReturnValue({
        command: '@run [echo ${param1} ${param2}]'
      });

      const result = await resolver.resolve(node, context);
      expect(result).toBe('echo hello world');
      expect(stateService.getCommand).toHaveBeenCalledWith('echo');
    });

    it('should handle commands with options', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'run',
          identifier: 'echo',
          args: ['test']
        }
      };
      vi.mocked(stateService.getCommand).mockReturnValue({
        command: '@run [echo ${text}]',
        options: { background: true }
      });

      const result = await resolver.resolve(node, context);
      expect(result).toBe('echo test');
    });
  });

  describe('error handling', () => {
    it('should throw when commands are not allowed', async () => {
      context.allowedVariableTypes.command = false;
      const node = {
        type: 'Directive',
        directive: {
          kind: 'run',
          identifier: 'test',
          value: 'value'
        }
      } as DirectiveNode;

      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow('Command references are not allowed in this context');
    });

    it.todo('should handle undefined commands appropriately (pending new error system)');

    it('should throw on invalid command format', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'run',
          identifier: 'invalid',
          args: []
        }
      };
      vi.mocked(stateService.getCommand).mockReturnValue({
        command: 'invalid format'
      });

      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow('Invalid command definition: must start with @run [');
    });

    it.todo('should handle parameter count mismatches appropriately (pending new error system)');
  });

  describe('extractReferences', () => {
    it('should extract command identifier from command directive', async () => {
      const node = {
        type: 'Directive',
        directive: {
          kind: 'run',
          identifier: 'test',
          value: ''
        }
      } as DirectiveNode;
      const refs = resolver.extractReferences(node);
      expect(refs).toEqual(['test']);
    });

    it('should return empty array for non-command directive', async () => {
      const node = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'test',
          value: ''
        }
      } as DirectiveNode;
      const refs = resolver.extractReferences(node);
      expect(refs).toEqual([]);
    });

    it('should return empty array for text node', async () => {
      const node = {
        type: 'Text',
        content: 'no references here'
      } as TextNode;
      const refs = resolver.extractReferences(node);
      expect(refs).toEqual([]);
    });
  });
});
```

# CommandResolver.ts

```typescript
import { IStateService } from '@services/state/StateService/IStateService.js';
import { ResolutionContext, ResolutionErrorCode } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';
import type { MeldNode, DirectiveNode, TextNode } from 'meld-spec';

/**
 * Handles resolution of command references ($run)
 */
export class CommandResolver {
  constructor(private stateService: IStateService) {}

  /**
   * Resolve command references in a node
   */
  async resolve(node: MeldNode, context: ResolutionContext): Promise<string> {
    // Early return if not a directive node
    if (node.type !== 'Directive') {
      return node.type === 'Text' ? (node as TextNode).content : '';
    }

    const directiveNode = node as DirectiveNode;

    // Validate command type first
    if (directiveNode.directive.kind !== 'run') {
      throw new ResolutionError(
        'Invalid node type for command resolution',
        ResolutionErrorCode.SYNTAX_ERROR,
        { value: JSON.stringify(node) }
      );
    }

    // Validate commands are allowed
    if (!context.allowedVariableTypes.command) {
      throw new ResolutionError(
        'Command references are not allowed in this context',
        ResolutionErrorCode.INVALID_CONTEXT,
        { value: directiveNode.directive.value, context }
      );
    }

    // Validate command identifier
    if (!directiveNode.directive.identifier) {
      throw new ResolutionError(
        'Command identifier is required',
        ResolutionErrorCode.SYNTAX_ERROR,
        { value: JSON.stringify(node) }
      );
    }

    // Get command definition
    const command = this.stateService.getCommand(directiveNode.directive.identifier);
    if (!command) {
      throw new ResolutionError(
        `Undefined command: ${directiveNode.directive.identifier}`,
        ResolutionErrorCode.UNDEFINED_VARIABLE,
        { value: directiveNode.directive.identifier, context }
      );
    }

    // Extract the actual command from the @run format
    const match = command.command.match(/^@run\s*\[(.*)\]$/);
    if (!match) {
      throw new ResolutionError(
        'Invalid command definition: must start with @run [',
        ResolutionErrorCode.INVALID_COMMAND,
        { value: command.command }
      );
    }

    // Get the command template and args
    const template = match[1];
    const args = directiveNode.directive.args || [];

    // Count required parameters in template
    const paramCount = (template.match(/\${[^}]+}/g) || []).length;
    if (args.length !== paramCount) {
      throw new ResolutionError(
        `Command ${directiveNode.directive.identifier} expects ${paramCount} parameters but got ${args.length}`,
        ResolutionErrorCode.SYNTAX_ERROR,
        { value: directiveNode.directive.identifier }
      );
    }

    // Replace parameters in template
    let result = template;
    const params = template.match(/\${([^}]+)}/g) || [];
    for (let i = 0; i < params.length; i++) {
      const param = params[i];
      const value = args[i];
      result = result.replace(param, value);
    }

    return result;
  }

  /**
   * Extract references from a node
   */
  extractReferences(node: MeldNode): string[] {
    if (node.type !== 'Directive' || (node as DirectiveNode).directive.kind !== 'run') {
      return [];
    }

    return [(node as DirectiveNode).directive.identifier];
  }
}
```

# ContentResolver.test.ts

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ContentResolver } from './ContentResolver.js';
import type { MeldNode, TextNode, CodeFenceNode, CommentNode, DirectiveNode } from 'meld-spec';
import { createMockStateService } from '@tests/utils/testFactories.js';
import { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';

describe('ContentResolver', () => {
  let resolver: ContentResolver;
  let stateService: ReturnType<typeof createMockStateService>;
  let context: ResolutionContext;

  beforeEach(() => {
    stateService = createMockStateService();
    resolver = new ContentResolver(stateService);
    context = {
      allowedVariableTypes: {
        text: true,
        data: true,
        path: true,
        command: true
      },
      currentFilePath: '',
      state: stateService
    };
  });

  it('should preserve text content exactly as is', async () => {
    const nodes: MeldNode[] = [{
      type: 'Text',
      content: '  Hello world  \n  with spaces  ',
      location: { start: { line: 1, column: 1 }, end: { line: 2, column: 13 } }
    } as TextNode];

    const result = await resolver.resolve(nodes, context);

    expect(result).toBe('  Hello world  \n  with spaces  ');
  });

  it('should preserve code blocks exactly as is', async () => {
    const nodes: MeldNode[] = [{
      type: 'CodeFence',
      content: '\n  const x = 42;\n  console.log(x);\n',
      language: 'typescript',
      location: { start: { line: 1, column: 1 }, end: { line: 4, column: 1 } }
    } as CodeFenceNode];

    const result = await resolver.resolve(nodes, context);

    expect(result).toBe('```typescript\n  const x = 42;\n  console.log(x);\n```');
  });

  it('should preserve nested code fences with different backtick counts', async () => {
    const nodes: MeldNode[] = [
      {
        type: 'Text',
        content: 'Before nested fences:\n\n',
        location: { start: { line: 1, column: 1 }, end: { line: 3, column: 1 } }
      } as TextNode,
      {
        type: 'CodeFence',
        content: '```\nBasic fence\n```',
        language: '',
        location: { start: { line: 3, column: 1 }, end: { line: 5, column: 1 } }
      } as CodeFenceNode,
      {
        type: 'Text',
        content: '\n',
        location: { start: { line: 5, column: 1 }, end: { line: 6, column: 1 } }
      } as TextNode,
      {
        type: 'CodeFence',
        content: '````\nNested fence with\n```\ninner fence\n```\n````',
        language: '',
        location: { start: { line: 6, column: 1 }, end: { line: 11, column: 1 } }
      } as CodeFenceNode
    ];

    const result = await resolver.resolve(nodes, context);

    // Each part should be preserved exactly as is, with no extra whitespace added
    expect(result).toBe('Before nested fences:\n\n```\nBasic fence\n```\n````\nNested fence with\n```\ninner fence\n```\n````');
  });

  it('should skip comments while preserving surrounding whitespace', async () => {
    const nodes: MeldNode[] = [
      {
        type: 'Text',
        content: 'Before  ',
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 8 } }
      } as TextNode,
      {
        type: 'Comment',
        content: 'This is a comment',
        location: { start: { line: 1, column: 9 }, end: { line: 1, column: 25 } }
      } as CommentNode,
      {
        type: 'Text',
        content: '  After',
        location: { start: { line: 1, column: 26 }, end: { line: 1, column: 33 } }
      } as TextNode
    ];

    const result = await resolver.resolve(nodes, context);

    expect(result).toBe('Before    After');
  });

  it('should preserve whitespace in mixed content', async () => {
    const nodes: MeldNode[] = [
      {
        type: 'Text',
        content: 'Text before\n\n',
        location: { start: { line: 1, column: 1 }, end: { line: 3, column: 1 } }
      } as TextNode,
      {
        type: 'CodeFence',
        content: '\nconsole.log("test");\n',
        language: 'typescript',
        location: { start: { line: 3, column: 1 }, end: { line: 5, column: 1 } }
      } as CodeFenceNode,
      {
        type: 'Comment',
        content: 'Skip this comment',
        location: { start: { line: 5, column: 1 }, end: { line: 5, column: 17 } }
      } as CommentNode,
      {
        type: 'Text',
        content: '\n\nText after',
        location: { start: { line: 5, column: 18 }, end: { line: 7, column: 10 } }
      } as TextNode
    ];

    const result = await resolver.resolve(nodes, context);

    expect(result).toBe('Text before\n\n```typescript\nconsole.log("test");\n```\n\nText after');
  });

  it('should skip directive nodes while preserving surrounding whitespace', async () => {
    const nodes: MeldNode[] = [
      {
        type: 'Text',
        content: 'Before  ',
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 8 } }
      } as TextNode,
      {
        type: 'Directive',
        directive: {
          kind: 'text' as const,
          identifier: 'test',
          value: 'value'
        },
        location: { start: { line: 1, column: 9 }, end: { line: 1, column: 28 } }
      } as DirectiveNode,
      {
        type: 'Text',
        content: '  After',
        location: { start: { line: 1, column: 29 }, end: { line: 1, column: 36 } }
      } as TextNode
    ];

    const result = await resolver.resolve(nodes, context);

    expect(result).toBe('Before    After');
  });
});
```

# ContentResolver.ts

```typescript
import { IStateService } from '@services/state/StateService/IStateService.js';
import { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { MeldNode, TextNode, CodeFenceNode, CommentNode } from 'meld-spec';

/**
 * Handles resolution of raw content (text, code blocks, comments)
 * Preserves original document formatting while skipping comments and directives
 */
export class ContentResolver {
  constructor(private stateService: IStateService) {}

  /**
   * Resolve content nodes, preserving original formatting but skipping comments and directives
   */
  async resolve(nodes: MeldNode[], context: ResolutionContext): Promise<string> {
    const resolvedParts: string[] = [];

    for (const node of nodes) {
      // Skip comments and directives
      if (node.type === 'Comment' || node.type === 'Directive') {
        continue;
      }

      switch (node.type) {
        case 'Text':
          // Regular text - output as is
          resolvedParts.push((node as TextNode).content);
          break;

        case 'CodeFence':
          // Code fence - preserve backticks, language and content exactly
          const codeFence = node as CodeFenceNode;
          // Extract backtick count from content
          const backtickMatch = codeFence.content.match(/^(`+)/);
          const backticks = backtickMatch ? backtickMatch[1] : '```';
          const fence = backticks + (codeFence.language || '');
          resolvedParts.push(`${fence}\n${codeFence.content.split('\n').slice(1, -1).join('\n')}\n${backticks}`);
          break;
      }
    }

    // Join parts without adding any additional whitespace
    return resolvedParts
      .filter(part => part !== undefined)
      .join('');
  }
}
```

# DataResolver.test.ts

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataResolver } from './DataResolver.js';
import { IStateService } from '@services/state/StateService/IStateService.js';
import { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';
import { MeldNode } from 'meld-spec';
import { createTestText, createTestDirective } from '@tests/utils/nodeFactories.js';

describe('DataResolver', () => {
  let resolver: DataResolver;
  let stateService: IStateService;
  let context: ResolutionContext;

  beforeEach(() => {
    stateService = {
      getDataVar: vi.fn(),
      setDataVar: vi.fn(),
    } as unknown as IStateService;

    resolver = new DataResolver(stateService);

    context = {
      currentFilePath: 'test.meld',
      allowedVariableTypes: {
        text: true,
        data: true,
        path: true,
        command: true
      },
      allowDataFields: true
    };
  });

  describe('resolve', () => {
    it('should return content of text node unchanged', async () => {
      const node = createTestText('test');
      const result = await resolver.resolve(node, context);
      expect(result).toBe('test');
    });

    it('should resolve data directive node', async () => {
      const node = createTestDirective('data', 'data', 'value');
      stateService.getDataVar.mockResolvedValue('value');
      const result = await resolver.resolve(node, context);
      expect(result).toBe('value');
      expect(stateService.getDataVar).toHaveBeenCalledWith('data');
    });

    it('should convert objects to JSON strings', async () => {
      const node = createTestDirective('data', 'data', '{ "test": "value" }');
      stateService.getDataVar.mockResolvedValue({ test: 'value' });
      const result = await resolver.resolve(node, context);
      expect(result).toBe('{"test":"value"}');
      expect(stateService.getDataVar).toHaveBeenCalledWith('data');
    });

    it('should handle null values', async () => {
      const node = createTestDirective('data', 'data', 'null');
      stateService.getDataVar.mockResolvedValue(null);
      const result = await resolver.resolve(node, context);
      expect(result).toBe('null');
      expect(stateService.getDataVar).toHaveBeenCalledWith('data');
    });
  });

  describe('error handling', () => {
    it('should throw when data variables are not allowed', async () => {
      context.allowedVariableTypes.data = false;
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'data',
          identifier: 'test',
          value: ''
        }
      };

      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow('Data variables are not allowed in this context');
    });

    it.todo('should handle undefined variables appropriately (pending new error system)');

    it.todo('should handle field access restrictions appropriately (pending new error system)');

    it.todo('should handle null/undefined field access appropriately (pending new error system)');

    it.todo('should handle accessing field of non-object (pending new error system)');

    it.todo('should handle accessing non-existent field (pending new error system)');
  });

  describe('extractReferences', () => {
    it('should extract variable identifier from data directive', async () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'data',
          identifier: 'test',
          value: ''
        }
      };
      const refs = resolver.extractReferences(node);
      expect(refs).toEqual(['test']);
    });

    it('should return empty array for non-data directive', async () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'test',
          value: ''
        }
      };
      const refs = resolver.extractReferences(node);
      expect(refs).toEqual([]);
    });

    it('should return empty array for text node', async () => {
      const node: MeldNode = {
        type: 'Text',
        content: 'no references here'
      };
      const refs = resolver.extractReferences(node);
      expect(refs).toEqual([]);
    });
  });
});
```

# DataResolver.ts

```typescript
import { MeldNode, DirectiveNode, TextNode } from 'meld-spec';
import { IStateService } from '@services/state/StateService/IStateService.js';
import { ResolutionContext, ResolutionErrorCode } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';

/**
 * Handles resolution of data variables ($data)
 */
export class DataResolver {
  constructor(private stateService: IStateService) {}

  /**
   * Resolve data variables in a node
   */
  async resolve(node: MeldNode, context: ResolutionContext): Promise<string> {
    // Handle text nodes by returning content unchanged
    if (node.type === 'Text') {
      return (node as TextNode).content;
    }

    // Validate node type
    if (node.type !== 'Directive' || (node as DirectiveNode).directive.kind !== 'data') {
      throw new ResolutionError(
        'Invalid node type for data resolution',
        ResolutionErrorCode.INVALID_NODE_TYPE,
        { value: node.type }
      );
    }

    const directiveNode = node as DirectiveNode;

    if (!context.allowedVariableTypes.data) {
      throw new ResolutionError(
        'Data variables are not allowed in this context',
        ResolutionErrorCode.INVALID_VARIABLE_TYPE,
        { value: directiveNode.directive.value, context }
      );
    }

    const identifier = directiveNode.directive.identifier;
    if (!identifier) {
      throw new ResolutionError(
        'Data variable identifier is required',
        ResolutionErrorCode.SYNTAX_ERROR,
        { value: JSON.stringify(directiveNode) }
      );
    }

    const value = await this.stateService.getDataVar(identifier);
    if (value === undefined) {
      console.warn(`Warning: Data variable '${identifier}' not found`);
      return '';
    }

    // Handle field access
    if (directiveNode.directive.field) {
      const field = directiveNode.directive.field;
      const fieldValue = value[field];
      if (fieldValue === undefined) {
        console.warn(`Warning: Field '${field}' not found in data variable '${identifier}'`);
        return '';
      }
      return this.stringifyValue(fieldValue);
    }

    return this.stringifyValue(value);
  }

  /**
   * Extract references from a node
   */
  extractReferences(node: MeldNode): string[] {
    if (node.type !== 'Directive' || (node as DirectiveNode).directive.kind !== 'data') {
      return [];
    }

    return [(node as DirectiveNode).directive.identifier];
  }

  /**
   * Convert a value to string format
   */
  private stringifyValue(value: any): string {
    if (value === undefined) {
      return '';
    }

    if (value === null) {
      return 'null';
    }

    if (typeof value === 'object') {
      return JSON.stringify(value);
    }

    return String(value);
  }
}
```

# PathResolver.test.ts

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PathResolver } from './PathResolver.js';
import { IStateService } from '@services/state/StateService/IStateService.js';
import { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';
import type { MeldNode, DirectiveNode, TextNode } from 'meld-spec';

describe('PathResolver', () => {
  let resolver: PathResolver;
  let stateService: IStateService;
  let context: ResolutionContext;

  beforeEach(() => {
    stateService = {
      getPathVar: vi.fn(),
      setPathVar: vi.fn(),
    } as unknown as IStateService;

    resolver = new PathResolver(stateService);

    context = {
      currentFilePath: 'test.meld',
      allowedVariableTypes: {
        text: false,
        data: false,
        path: true,
        command: false
      },
      pathValidation: {
        requireAbsolute: true,
        allowedRoots: ['HOMEPATH', 'PROJECTPATH']
      }
    };

    // Mock root paths
    vi.mocked(stateService.getPathVar)
      .mockImplementation((name) => {
        if (name === 'HOMEPATH') return '/home/user';
        if (name === 'PROJECTPATH') return '/project';
        return undefined;
      });
  });

  describe('resolve', () => {
    it('should return content of text node unchanged', async () => {
      const node: TextNode = {
        type: 'Text',
        content: '/home/user/file'
      };
      const result = await resolver.resolve(node, context);
      expect(result).toBe('/home/user/file');
    });

    it('should resolve path directive node', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'path',
          identifier: 'HOMEPATH'
        }
      };
      const result = await resolver.resolve(node, context);
      expect(result).toBe('/home/user');
      expect(stateService.getPathVar).toHaveBeenCalledWith('HOMEPATH');
    });

    it('should handle $~ alias for HOMEPATH', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'path',
          identifier: '~'
        }
      };
      const result = await resolver.resolve(node, context);
      expect(result).toBe('/home/user');
      expect(stateService.getPathVar).toHaveBeenCalledWith('HOMEPATH');
    });

    it('should handle $. alias for PROJECTPATH', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'path',
          identifier: '.'
        }
      };
      const result = await resolver.resolve(node, context);
      expect(result).toBe('/project');
      expect(stateService.getPathVar).toHaveBeenCalledWith('PROJECTPATH');
    });
  });

  describe('error handling', () => {
    it('should throw when path variables are not allowed', async () => {
      context.allowedVariableTypes.path = false;
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'path',
          identifier: 'test'
        }
      };
      await expect(resolver.resolve(node, context)).rejects.toThrow(ResolutionError);
    });

    it.todo('should handle undefined path variables appropriately (pending new error system)');

    it('should throw when path is not absolute but required', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'path',
          identifier: 'path'
        }
      };
      vi.mocked(stateService.getPathVar).mockReturnValue('relative/path');

      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow('Path must be absolute');
    });

    it('should throw when path does not start with allowed root', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'path',
          identifier: 'path'
        }
      };
      vi.mocked(stateService.getPathVar)
        .mockImplementation((name) => {
          if (name === 'HOMEPATH') return '/home/user';
          if (name === 'PROJECTPATH') return '/project';
          if (name === 'path') return '/other/path';
          return undefined;
        });

      context.pathValidation = {
        requireAbsolute: true,
        allowedRoots: ['HOMEPATH', 'PROJECTPATH']
      };

      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow('Path must start with one of: HOMEPATH, PROJECTPATH');
    });

    it('should throw on invalid node type', async () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'data',
          identifier: 'test',
          value: ''
        }
      };

      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow('Invalid node type for path resolution');
    });

    it('should throw on missing variable identifier', async () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'path',
          value: ''
        }
      };

      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow('Path variable identifier is required');
    });
  });

  describe('extractReferences', () => {
    it('should extract variable identifier from path directive', async () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'path',
          identifier: 'test',
          value: ''
        }
      };
      const refs = resolver.extractReferences(node);
      expect(refs).toEqual(['test']);
    });

    it('should resolve ~ alias to HOMEPATH', async () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'path',
          identifier: '~',
          value: ''
        }
      };
      const refs = resolver.extractReferences(node);
      expect(refs).toEqual(['HOMEPATH']);
    });

    it('should resolve . alias to PROJECTPATH', async () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'path',
          identifier: '.',
          value: ''
        }
      };
      const refs = resolver.extractReferences(node);
      expect(refs).toEqual(['PROJECTPATH']);
    });

    it('should return empty array for non-path directive', async () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'data',
          identifier: 'test',
          value: ''
        }
      };
      const refs = resolver.extractReferences(node);
      expect(refs).toEqual([]);
    });

    it('should return empty array for text node', async () => {
      const node: MeldNode = {
        type: 'Text',
        content: 'no references here'
      };
      const refs = resolver.extractReferences(node);
      expect(refs).toEqual([]);
    });
  });
});
```

# PathResolver.ts

```typescript
import { IStateService } from '@services/state/StateService/IStateService.js';
import { ResolutionContext, ResolutionErrorCode } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';
import type { MeldNode, DirectiveNode, TextNode, PathVarNode } from 'meld-spec';

/**
 * Handles resolution of path variables ($path)
 */
export class PathResolver {
  constructor(private stateService: IStateService) {}

  /**
   * Resolve path variables in a node
   */
  async resolve(node: MeldNode, context: ResolutionContext): Promise<string> {
    // Early return if not a directive node
    if (node.type !== 'Directive') {
      return node.type === 'Text' ? (node as TextNode).content : '';
    }

    const directiveNode = node as DirectiveNode;

    // Validate path variables are allowed
    if (!context.allowedVariableTypes.path) {
      throw new ResolutionError(
        'Path variables are not allowed in this context',
        ResolutionErrorCode.INVALID_CONTEXT,
        { value: directiveNode.directive.value, context }
      );
    }

    // Validate node type
    if (directiveNode.directive.kind !== 'path') {
      throw new ResolutionError(
        'Invalid node type for path resolution',
        ResolutionErrorCode.INVALID_NODE_TYPE,
        { value: directiveNode.directive.kind }
      );
    }

    // Get the variable identifier
    const identifier = directiveNode.directive.identifier;
    if (!identifier) {
      throw new ResolutionError(
        'Path variable identifier is required',
        ResolutionErrorCode.SYNTAX_ERROR,
        { value: JSON.stringify(directiveNode.directive) }
      );
    }

    // Handle special path variables
    if (identifier === '~' || identifier === 'HOMEPATH') {
      return this.stateService.getPathVar('HOMEPATH') || '';
    }
    if (identifier === '.' || identifier === 'PROJECTPATH') {
      return this.stateService.getPathVar('PROJECTPATH') || '';
    }

    // For regular path variables, get value from state
    const value = this.stateService.getPathVar(identifier);

    if (value === undefined) {
      throw new ResolutionError(
        `Undefined path variable: ${identifier}`,
        ResolutionErrorCode.UNDEFINED_VARIABLE,
        { value: identifier }
      );
    }

    // Validate path if required
    if (context.pathValidation) {
      return this.validatePath(value, context);
    }

    return value;
  }

  /**
   * Extract references from a node
   */
  extractReferences(node: MeldNode): string[] {
    if (node.type !== 'Directive') {
      return [];
    }

    const directiveNode = node as DirectiveNode;
    if (directiveNode.directive.kind !== 'path') {
      return [];
    }

    const identifier = directiveNode.directive.identifier;
    if (!identifier) {
      return [];
    }

    // Map special variables to their full names
    if (identifier === '~') {
      return ['HOMEPATH'];
    }
    if (identifier === '.') {
      return ['PROJECTPATH'];
    }

    return [identifier];
  }

  /**
   * Validate a resolved path against context requirements
   */
  private validatePath(path: string, context: ResolutionContext): string {
    if (context.pathValidation) {
      // Check if path is absolute or starts with a special variable
      if (context.pathValidation.requireAbsolute && !path.startsWith('/')) {
        throw new ResolutionError(
          'Path must be absolute',
          ResolutionErrorCode.INVALID_PATH,
          { value: path, context }
        );
      }

      // Check if path starts with an allowed root
      if (context.pathValidation.allowedRoots?.length) {
        const hasAllowedRoot = context.pathValidation.allowedRoots.some(root => {
          const rootVar = this.stateService.getPathVar(root);
          return rootVar && (
            path.startsWith(rootVar + '/') ||
            path === rootVar
          );
        });

        if (!hasAllowedRoot) {
          throw new ResolutionError(
            `Path must start with one of: ${context.pathValidation.allowedRoots.join(', ')}`,
            ResolutionErrorCode.INVALID_PATH,
            { value: path, context }
          );
        }
      }
    }

    return path;
  }

  /**
   * Get all path variables referenced in a node
   */
  getReferencedVariables(node: MeldNode): string[] {
    const pathVar = this.getPathVarFromNode(node);
    if (!pathVar || pathVar.isSpecial) {
      return [];
    }
    return [pathVar.identifier];
  }

  /**
   * Helper to extract PathVarNode from a node
   */
  private getPathVarFromNode(node: MeldNode): PathVarNode | null {
    if (node.type !== 'Directive' || (node as DirectiveNode).directive.kind !== 'path') {
      return null;
    }

    const pathVar = (node as DirectiveNode).directive.value as PathVarNode;
    if (!pathVar || pathVar.type !== 'PathVar') {
      return null;
    }

    return pathVar;
  }
}
```

# StringConcatenationHandler.test.ts

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { StringConcatenationHandler } from './StringConcatenationHandler.js';
import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';
import { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';

describe('StringConcatenationHandler', () => {
  let handler: StringConcatenationHandler;
  let mockResolutionService: IResolutionService;
  let context: ResolutionContext;

  beforeEach(() => {
    mockResolutionService = {
      resolveInContext: vi.fn()
    } as unknown as IResolutionService;

    handler = new StringConcatenationHandler(mockResolutionService);

    context = {
      currentFilePath: 'test.meld',
      allowedVariableTypes: {
        text: true,
        data: true,
        path: true,
        command: true
      },
      state: {} as any
    };
  });

  describe('hasConcatenation', () => {
    it('should detect valid concatenation operators', () => {
      expect(handler.hasConcatenation('"hello" ++ "world"')).toBe(true);
      expect(handler.hasConcatenation('${var1} ++ ${var2}')).toBe(true);
      expect(handler.hasConcatenation('"prefix" ++ @embed [file.md]')).toBe(true);
    });

    it('should reject invalid concatenation operators', () => {
      expect(handler.hasConcatenation('"hello"++"world"')).toBe(false); // No spaces
      expect(handler.hasConcatenation('"hello" + + "world"')).toBe(false); // Split ++
      expect(handler.hasConcatenation('"hello" + "world"')).toBe(false); // Single +
    });
  });

  describe('resolveConcatenation', () => {
    it('should concatenate string literals', async () => {
      const result = await handler.resolveConcatenation('"hello" ++ " " ++ "world"', context);
      expect(result).toBe('hello world');
    });

    it('should handle variables through resolution service', async () => {
      vi.mocked(mockResolutionService.resolveInContext).mockImplementation(async (value) => {
        if (value === '${var1}') return 'hello';
        if (value === '${var2}') return 'world';
        return value;
      });

      const result = await handler.resolveConcatenation('${var1} ++ " " ++ ${var2}', context);
      expect(result).toBe('hello world');
    });

    it('should preserve whitespace in string literals', async () => {
      const result = await handler.resolveConcatenation('"  hello  " ++ "  world  "', context);
      expect(result).toBe('  hello    world  ');
    });

    it('should handle escaped quotes in string literals', async () => {
      const result = await handler.resolveConcatenation('"say \\"hello\\"" ++ " world"', context);
      expect(result).toBe('say "hello" world');
    });

    it('should handle mixed string literals and variables', async () => {
      vi.mocked(mockResolutionService.resolveInContext).mockImplementation(async (value) => {
        if (value === '${name}') return 'world';
        return value;
      });

      const result = await handler.resolveConcatenation('"hello " ++ ${name}', context);
      expect(result).toBe('hello world');
    });

    it('should reject empty parts', async () => {
      await expect(handler.resolveConcatenation('"hello" ++  ++ "world"', context))
        .rejects
        .toThrow(ResolutionError);
    });

    it('should handle resolution errors', async () => {
      vi.mocked(mockResolutionService.resolveInContext).mockRejectedValue(
        new ResolutionError('Variable not found', { value: '${missing}' })
      );

      await expect(handler.resolveConcatenation('"hello" ++ ${missing}', context))
        .rejects
        .toThrow(ResolutionError);
    });

    it('should handle backtick strings', async () => {
      const result = await handler.resolveConcatenation('`hello` ++ ` world`', context);
      expect(result).toBe('hello world');
    });

    it('should handle single quoted strings', async () => {
      const result = await handler.resolveConcatenation("'hello' ++ ' world'", context);
      expect(result).toBe('hello world');
    });
  });
});
```

# StringConcatenationHandler.ts

```typescript
import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';
import { StringLiteralHandler } from './StringLiteralHandler.js';
import { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';

/**
 * Handles string concatenation operations using the ++ operator
 */
export class StringConcatenationHandler {
  private stringLiteralHandler: StringLiteralHandler;

  constructor(
    private resolutionService: IResolutionService
  ) {
    this.stringLiteralHandler = new StringLiteralHandler();
  }

  /**
   * Splits a value into its concatenation parts
   * @returns Array of parts to be concatenated
   * @throws ResolutionError if the concatenation syntax is invalid
   */
  private splitConcatenationParts(value: string): string[] {
    // Split by ++ operator, preserving spaces around it
    const parts = value.split(/\s*\+\+\s*/);

    // Validate each part is non-empty
    if (parts.some(part => part.trim().length === 0)) {
      throw new ResolutionError(
        'Empty part in string concatenation',
        { value }
      );
    }

    return parts;
  }

  /**
   * Checks if a value contains the ++ operator
   */
  hasConcatenation(value: string): boolean {
    // Look for ++ with required spaces on both sides
    return /\s\+\+\s/.test(value);
  }

  /**
   * Resolves a string concatenation expression
   * @throws ResolutionError if the concatenation is invalid
   */
  async resolveConcatenation(value: string, context: ResolutionContext): Promise<string> {
    // Split into parts
    const parts = this.splitConcatenationParts(value);

    // Resolve each part
    const resolvedParts: string[] = [];
    for (const part of parts) {
      const trimmedPart = part.trim();

      // Handle string literals
      if (this.stringLiteralHandler.isStringLiteral(trimmedPart)) {
        resolvedParts.push(this.stringLiteralHandler.parseLiteral(trimmedPart));
        continue;
      }

      // Handle variables and other expressions
      try {
        const resolved = await this.resolutionService.resolveInContext(trimmedPart, context);
        resolvedParts.push(resolved);
      } catch (error) {
        throw new ResolutionError(
          `Failed to resolve part in concatenation: ${trimmedPart}`,
          { value: trimmedPart, context, cause: error }
        );
      }
    }

    // Join all parts
    return resolvedParts.join('');
  }
}
```

# StringLiteralHandler.test.ts

```typescript
import { describe, it, expect } from 'vitest';
import { StringLiteralHandler } from './StringLiteralHandler.js';
import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';

describe('StringLiteralHandler', () => {
  const handler = new StringLiteralHandler();

  describe('validateLiteral', () => {
    it('should accept single quoted strings', () => {
      expect(() => handler.validateLiteral("'hello world'")).not.toThrow();
    });

    it('should accept double quoted strings', () => {
      expect(() => handler.validateLiteral('"hello world"')).not.toThrow();
    });

    it('should accept backtick quoted strings', () => {
      expect(() => handler.validateLiteral('`hello world`')).not.toThrow();
    });

    it('should reject unmatched quotes', () => {
      expect(() => handler.validateLiteral("'hello world")).toThrow(ResolutionError);
      expect(() => handler.validateLiteral('"hello world')).toThrow(ResolutionError);
      expect(() => handler.validateLiteral('`hello world')).toThrow(ResolutionError);
    });

    it('should reject mixed quotes', () => {
      expect(() => handler.validateLiteral("'hello world\"")).toThrow(ResolutionError);
      expect(() => handler.validateLiteral('"hello world`')).toThrow(ResolutionError);
      expect(() => handler.validateLiteral('`hello world\'')).toThrow(ResolutionError);
    });

    it('should reject strings without quotes', () => {
      expect(() => handler.validateLiteral('hello world')).toThrow(ResolutionError);
    });

    it('should reject empty strings', () => {
      expect(() => handler.validateLiteral('')).toThrow(ResolutionError);
    });

    it('should reject strings with only quotes', () => {
      expect(() => handler.validateLiteral('""')).toThrow(ResolutionError);
      expect(() => handler.validateLiteral("''")).toThrow(ResolutionError);
      expect(() => handler.validateLiteral('``')).toThrow(ResolutionError);
    });
  });

  describe('parseLiteral', () => {
    it('should remove matching single quotes', () => {
      expect(handler.parseLiteral("'hello world'")).toBe('hello world');
    });

    it('should remove matching double quotes', () => {
      expect(handler.parseLiteral('"hello world"')).toBe('hello world');
    });

    it('should remove matching backticks', () => {
      expect(handler.parseLiteral('`hello world`')).toBe('hello world');
    });

    it('should preserve internal quotes', () => {
      expect(handler.parseLiteral("'It\\'s a test'")).toBe("It's a test");
      expect(handler.parseLiteral('"Say \\"hello\\""')).toBe('Say "hello"');
      expect(handler.parseLiteral('`Use \\`backticks\\``')).toBe('Use `backticks`');
    });

    it('should preserve whitespace', () => {
      expect(handler.parseLiteral('"  hello  world  "')).toBe('  hello  world  ');
      expect(handler.parseLiteral("'  hello  world  '")).toBe('  hello  world  ');
      expect(handler.parseLiteral('`  hello  world  `')).toBe('  hello  world  ');
    });

    it('should preserve newlines in backtick strings', () => {
      expect(handler.parseLiteral('`line1\nline2`')).toBe('line1\nline2');
    });

    it('should reject newlines in single/double quoted strings', () => {
      expect(() => handler.parseLiteral("'line1\nline2'")).toThrow(ResolutionError);
      expect(() => handler.parseLiteral('"line1\nline2"')).toThrow(ResolutionError);
    });

    it('should preserve special characters', () => {
      expect(handler.parseLiteral('"$!@#%^&*()"')).toBe('$!@#%^&*()');
      expect(handler.parseLiteral("'$!@#%^&*()'")).toBe('$!@#%^&*()');
      expect(handler.parseLiteral('`$!@#%^&*()`')).toBe('$!@#%^&*()');
    });

    it('should handle escaped characters', () => {
      expect(handler.parseLiteral('"\\n\\t\\r"')).toBe('\\n\\t\\r');
      expect(handler.parseLiteral("'\\n\\t\\r'")).toBe('\\n\\t\\r');
      expect(handler.parseLiteral('`\\n\\t\\r`')).toBe('\\n\\t\\r');
    });

    it('should throw on invalid input', () => {
      expect(() => handler.parseLiteral('invalid')).toThrow(ResolutionError);
      expect(() => handler.parseLiteral('')).toThrow(ResolutionError);
      expect(() => handler.parseLiteral('""')).toThrow(ResolutionError);
    });
  });
});
```

# StringLiteralHandler.ts

```typescript
import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';

/**
 * Handles validation and parsing of string literals in text directives
 */
export class StringLiteralHandler {
  private readonly QUOTE_TYPES = ["'", '"', '`'] as const;
  private readonly MIN_CONTENT_LENGTH = 1;

  /**
   * Checks if a value appears to be a string literal
   * This is a preliminary check before full validation
   */
  isStringLiteral(value: string): boolean {
    if (!value || value.length < 2) {
      return false;
    }

    const firstChar = value[0];
    const lastChar = value[value.length - 1];

    // Check for matching quotes
    if (!this.QUOTE_TYPES.includes(firstChar as any) || firstChar !== lastChar) {
      return false;
    }

    // Check for unclosed quotes
    let isEscaped = false;
    for (let i = 1; i < value.length - 1; i++) {
      if (value[i] === '\\') {
        isEscaped = !isEscaped;
      } else if (value[i] === firstChar && !isEscaped) {
        return false; // Found an unescaped quote in the middle
      } else {
        isEscaped = false;
      }
    }

    return true;
  }

  /**
   * Validates a string literal for proper quoting and content
   * @throws ResolutionError if the literal is invalid
   */
  validateLiteral(value: string): void {
    if (!value || value.length < 2) {
      throw new ResolutionError(
        'String literal is empty or too short',
        { value }
      );
    }

    const firstChar = value[0];
    const lastChar = value[value.length - 1];

    // Check if starts with a valid quote
    if (!this.QUOTE_TYPES.includes(firstChar as any)) {
      throw new ResolutionError(
        'String literal must start with a quote (\', ", or `)',
        { value }
      );
    }

    // Check if quotes match
    if (firstChar !== lastChar) {
      throw new ResolutionError(
        'String literal has mismatched quotes',
        { value }
      );
    }

    // Check for mixed quotes
    const otherQuotes = this.QUOTE_TYPES.filter(q => q !== firstChar);
    const content = value.slice(1, -1);

    for (const quote of otherQuotes) {
      if (content.includes(quote) && !this.isEscaped(content, quote)) {
        throw new ResolutionError(
          'String literal contains unescaped mixed quotes',
          { value }
        );
      }
    }

    // Check content length
    if (content.length < this.MIN_CONTENT_LENGTH) {
      throw new ResolutionError(
        'String literal content is empty',
        { value }
      );
    }

    // Check for newlines in single/double quoted strings
    if (firstChar !== '`' && content.includes('\n')) {
      throw new ResolutionError(
        'Single and double quoted strings cannot contain newlines',
        { value }
      );
    }
  }

  /**
   * Parses a string literal, removing quotes and handling escapes
   * @throws ResolutionError if the literal is invalid
   */
  parseLiteral(value: string): string {
    // First validate the literal
    this.validateLiteral(value);

    // Get the content between quotes
    const content = value.slice(1, -1);

    // Handle escaped quotes based on quote type
    const quoteType = value[0];
    return this.unescapeQuotes(content, quoteType as typeof this.QUOTE_TYPES[number]);
  }

  /**
   * Checks if a character at a given position is escaped
   */
  private isEscaped(str: string, char: string, pos?: number): boolean {
    if (pos === undefined) {
      // If no position given, check all occurrences
      let escaped = false;
      for (let i = 0; i < str.length; i++) {
        if (str[i] === char && !this.isEscaped(str, char, i)) {
          return false;
        }
      }
      return true;
    }

    // Count backslashes before the character
    let backslashCount = 0;
    let i = pos - 1;
    while (i >= 0 && str[i] === '\\') {
      backslashCount++;
      i--;
    }
    return backslashCount % 2 === 1;
  }

  /**
   * Unescapes quotes in the content based on quote type
   */
  private unescapeQuotes(content: string, quoteType: typeof this.QUOTE_TYPES[number]): string {
    // Replace escaped quotes with actual quotes
    return content.replace(
      new RegExp(`\\\\${quoteType}`, 'g'),
      quoteType
    );
  }
}
```

# TextResolver.test.ts

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TextResolver } from './TextResolver.js';
import { IStateService } from '@services/state/StateService/IStateService.js';
import { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';
import { MeldNode } from 'meld-spec';

describe('TextResolver', () => {
  let resolver: TextResolver;
  let stateService: IStateService;
  let context: ResolutionContext;

  beforeEach(() => {
    stateService = {
      getTextVar: vi.fn(),
      setTextVar: vi.fn(),
    } as unknown as IStateService;

    resolver = new TextResolver(stateService);

    context = {
      currentFilePath: 'test.meld',
      allowedVariableTypes: {
        text: true,
        data: true,
        path: true,
        command: true
      }
    };
  });

  describe('resolve', () => {
    it('should return content of text node unchanged', async () => {
      const node: MeldNode = {
        type: 'Text',
        content: 'no variables here'
      };
      const result = await resolver.resolve(node, context);
      expect(result).toBe('no variables here');
    });

    it('should resolve text directive node', async () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'test',
          value: 'value'
        }
      };
      vi.mocked(stateService.getTextVar).mockReturnValue('resolved');
      const result = await resolver.resolve(node, context);
      expect(result).toBe('resolved');
      expect(stateService.getTextVar).toHaveBeenCalledWith('test');
    });

    it('should handle format specifications', async () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'test',
          value: 'value',
          format: '(format)'
        }
      };
      vi.mocked(stateService.getTextVar).mockReturnValue('value');
      const result = await resolver.resolve(node, context);
      expect(result).toBe('value'); // Format not implemented yet
      expect(stateService.getTextVar).toHaveBeenCalledWith('test');
    });

    it.todo('should handle environment variables appropriately (pending new error system)');
  });

  describe('error handling', () => {
    it('should throw when text variables are not allowed', async () => {
      context.allowedVariableTypes.text = false;
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'test',
          value: 'value'
        }
      };

      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow('Text variables are not allowed in this context');
    });

    it.todo('should handle undefined variables (pending new error system)');

    it('should throw on invalid node type', async () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'data',
          identifier: 'test',
          value: ''
        }
      };

      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow('Invalid node type for text resolution');
    });

    it('should throw on missing variable name', async () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'text'
        }
      };

      await expect(() => resolver.resolve(node, context))
        .rejects
        .toThrow('Text variable identifier is required');
    });
  });

  describe('extractReferences', () => {
    it('should extract variable name from text directive', () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'test',
          value: ''
        }
      };
      const refs = resolver.extractReferences(node);
      expect(refs).toEqual(['test']);
    });

    it('should return empty array for non-text directive', () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'data',
          identifier: 'test',
          value: ''
        }
      };
      const refs = resolver.extractReferences(node);
      expect(refs).toEqual([]);
    });

    it('should return empty array for text node', () => {
      const node: MeldNode = {
        type: 'Text',
        content: 'no references here'
      };
      const refs = resolver.extractReferences(node);
      expect(refs).toEqual([]);
    });
  });
});
```

# TextResolver.ts

```typescript
import { IStateService } from '@services/state/StateService/IStateService.js';
import { ResolutionContext, ResolutionErrorCode } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';
import { MeldNode, TextNode, DirectiveNode } from 'meld-spec';

/**
 * Handles resolution of text variables (${var})
 */
export class TextResolver {
  constructor(private stateService: IStateService) {}

  /**
   * Resolve text variables in a node
   */
  async resolve(node: MeldNode, context: ResolutionContext): Promise<string> {
    // Early return if not a directive node
    if (node.type !== 'Directive') {
      return node.type === 'Text' ? (node as TextNode).content : '';
    }

    const directiveNode = node as DirectiveNode;

    // Validate text variables are allowed
    if (!context.allowedVariableTypes.text) {
      throw new ResolutionError(
        'Text variables are not allowed in this context',
        ResolutionErrorCode.INVALID_CONTEXT,
        { value: directiveNode.directive.value, context }
      );
    }

    // Get the variable name and format if present
    const { identifier, format } = this.parseDirective(directiveNode);

    // Get variable value
    const value = this.stateService.getTextVar(identifier);

    if (value === undefined) {
      // Special handling for ENV variables
      if (identifier.startsWith('ENV_')) {
        console.warn(`Warning: Environment variable not set: ${identifier}`);
        return '';
      }
      throw new ResolutionError(
        `Undefined text variable: ${identifier}`,
        ResolutionErrorCode.UNDEFINED_VARIABLE,
        { value: identifier, context }
      );
    }

    // Apply format if present
    return format ? this.applyFormat(value, format) : value;
  }

  /**
   * Extract references from a node
   */
  extractReferences(node: MeldNode): string[] {
    if (node.type !== 'Directive') {
      return [];
    }
    const directiveNode = node as DirectiveNode;
    if (directiveNode.directive.kind !== 'text') {
      return [];
    }

    return [directiveNode.directive.identifier];
  }

  /**
   * Parse a directive node to extract identifier and format
   */
  private parseDirective(node: DirectiveNode): { identifier: string; format?: string } {
    if (node.directive.kind !== 'text') {
      throw new ResolutionError(
        'Invalid node type for text resolution',
        ResolutionErrorCode.SYNTAX_ERROR,
        { value: JSON.stringify(node) }
      );
    }

    const identifier = node.directive.identifier;
    if (!identifier) {
      throw new ResolutionError(
        'Text variable identifier is required',
        ResolutionErrorCode.SYNTAX_ERROR,
        { value: JSON.stringify(node) }
      );
    }

    return {
      identifier,
      format: node.directive.format
    };
  }

  /**
   * Apply format to a value
   */
  private applyFormat(value: string, format: string): string {
    // TODO: Implement format handling
    // For now just return the value as formats aren't specified in UX.md
    return value;
  }
}
```

# VariableReferenceResolver.test.ts

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VariableReferenceResolver } from './VariableReferenceResolver.js';
import { createMockStateService } from '@tests/utils/testFactories.js';
import { ResolutionError, ResolutionErrorCode } from '@services/resolution/ResolutionService/errors/ResolutionError.js';
import type { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';

describe('VariableReferenceResolver', () => {
  let resolver: VariableReferenceResolver;
  let stateService: ReturnType<typeof createMockStateService>;
  let context: ResolutionContext;

  beforeEach(() => {
    stateService = createMockStateService();
    resolver = new VariableReferenceResolver(stateService);
    context = {
      allowedVariableTypes: {
        text: true,
        data: true,
        path: true,
        command: true
      },
      currentFilePath: 'test.meld'
    };
  });

  describe('resolve', () => {
    it('should resolve text variables', async () => {
      vi.mocked(stateService.getTextVar).mockReturnValue('Hello World');
      const result = await resolver.resolve('${greeting}', context);
      expect(result).toBe('Hello World');
      expect(stateService.getTextVar).toHaveBeenCalledWith('greeting');
    });

    it('should resolve data variables when text variable not found', async () => {
      vi.mocked(stateService.getTextVar).mockReturnValue(undefined);
      vi.mocked(stateService.getDataVar).mockReturnValue('Data Value');
      const result = await resolver.resolve('${data}', context);
      expect(result).toBe('Data Value');
      expect(stateService.getTextVar).toHaveBeenCalledWith('data');
      expect(stateService.getDataVar).toHaveBeenCalledWith('data');
    });

    it('should handle multiple variable references', async () => {
      vi.mocked(stateService.getTextVar)
        .mockReturnValueOnce('Hello')
        .mockReturnValueOnce('World');
      const result = await resolver.resolve('${greeting1} ${greeting2}!', context);
      expect(result).toBe('Hello World!');
    });

    it('should handle field access in data variables', async () => {
      vi.mocked(stateService.getTextVar).mockReturnValue(undefined);
      vi.mocked(stateService.getDataVar).mockReturnValue({ user: { name: 'Alice' } });
      const result = await resolver.resolve('${data.user.name}', context);
      expect(result).toBe('Alice');
    });

    it('should handle environment variables', async () => {
      vi.mocked(stateService.getTextVar).mockReturnValue(undefined);
      vi.mocked(stateService.getDataVar).mockReturnValue(undefined);
      await expect(resolver.resolve('${ENV_TEST}', context))
        .rejects
        .toThrow('Environment variable not set: ENV_TEST');
    });

    it('should throw on undefined variable', async () => {
      vi.mocked(stateService.getTextVar).mockReturnValue(undefined);
      vi.mocked(stateService.getDataVar).mockReturnValue(undefined);
      await expect(resolver.resolve('${missing}', context))
        .rejects
        .toThrow('Undefined variable: missing');
    });

    it('should preserve text without variables', async () => {
      const result = await resolver.resolve('No variables here', context);
      expect(result).toBe('No variables here');
      expect(stateService.getTextVar).not.toHaveBeenCalled();
    });

    it('should handle mixed content with variables', async () => {
      vi.mocked(stateService.getTextVar)
        .mockReturnValueOnce('Alice')
        .mockReturnValueOnce('Wonderland');
      const result = await resolver.resolve(
        'Hello ${name}, welcome to ${place}!',
        context
      );
      expect(result).toBe('Hello Alice, welcome to Wonderland!');
    });
  });

  describe('extractReferences', () => {
    it('should extract all variable references', () => {
      const refs = resolver.extractReferences('${var1} and ${var2} and ${var3}');
      expect(refs).toEqual(['var1', 'var2', 'var3']);
    });

    it('should handle field access in references', () => {
      const refs = resolver.extractReferences('${data.field1} and ${data.field2}');
      expect(refs).toEqual(['data']);
    });

    it('should return empty array for no references', () => {
      const refs = resolver.extractReferences('No variables here');
      expect(refs).toEqual([]);
    });

    it('should handle duplicate references', () => {
      const refs = resolver.extractReferences('${var1} and ${var1} and ${var1}');
      expect(refs).toEqual(['var1']);
    });
  });
});
```

# VariableReferenceResolver.ts

```typescript
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionErrorCode } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';

/**
 * Handles resolution of variable references (${var})
 */
export class VariableReferenceResolver {
  private readonly variablePattern = /\${([^}]+)}/g;
  private readonly nestedVariablePattern = /\${([^${}]*\${[^}]+}[^}]*)}/g;
  private readonly MAX_RESOLUTION_DEPTH = 10;
  private readonly MAX_ITERATIONS = 100;

  constructor(
    private readonly stateService: IStateService,
    private readonly resolutionService: IResolutionService
  ) {}

  /**
   * Resolves all variable references in the given text
   * @param text Text containing variable references like ${varName}
   * @param context Resolution context
   * @returns Resolved text with all variables replaced with their values
   */
  async resolve(text: string, context: ResolutionContext): Promise<string> {
    if (!text.includes('${')) {
      return text;
    }

    // Track variables being resolved to detect circular references
    const resolutionPath: string[] = [];
    return this.resolveWithDepth(text, context, 0, resolutionPath);
  }

  /**
   * Resolves variables with depth tracking to prevent infinite loops
   */
  private async resolveWithDepth(
    text: string,
    context: ResolutionContext,
    depth: number,
    resolutionPath: string[]
  ): Promise<string> {
    if (depth >= this.MAX_RESOLUTION_DEPTH) {
      throw new ResolutionError(
        'Maximum resolution depth exceeded',
        ResolutionErrorCode.MAX_DEPTH_EXCEEDED,
        { value: text, context }
      );
    }

    // First resolve any nested variables
    let resolvedText = text;
    let hasNested = true;
    let iterations = 0;

    while (hasNested && iterations < this.MAX_ITERATIONS) {
      hasNested = false;
      iterations++;

      // Find all variable references
      this.variablePattern.lastIndex = 0;
      const matches = Array.from(resolvedText.matchAll(this.variablePattern));

      if (matches.length === 0) {
        break;
      }

      // Process each reference
      for (const match of matches) {
        const [fullMatch, varRef] = match;

        // Skip if no nested variables
        if (!varRef.includes('${')) {
          continue;
        }

        // Extract the innermost variable reference
        const innerMatch = varRef.match(/\${([^}$]+)}/);
        if (innerMatch) {
          const innerVar = innerMatch[1];
          const baseVar = innerVar.split('.')[0];

          // Check for circular references
          const currentPath = [...resolutionPath, baseVar];
          if (this.hasCircularReference(currentPath)) {
            const pathStr = currentPath.join(' -> ');
            throw new ResolutionError(
              `Circular reference detected: ${pathStr}`,
              ResolutionErrorCode.CIRCULAR_REFERENCE,
              { value: text, context }
            );
          }

          try {
            // Resolve the inner variable
            const resolvedInner = await this.resolveWithDepth(
              '${' + innerVar + '}',
              context,
              depth + 1,
              currentPath
            );

            // Replace in the original text
            resolvedText = resolvedText.replace(
              fullMatch,
              fullMatch.replace('${' + innerVar + '}', resolvedInner)
            );
            hasNested = true;
          } catch (error) {
            if (error instanceof ResolutionError) {
              throw error;
            }
            throw new ResolutionError(
              'Failed to resolve nested variable',
              ResolutionErrorCode.RESOLUTION_FAILED,
              { value: innerVar, context, cause: error }
            );
          }
        }
      }
    }

    if (iterations >= this.MAX_ITERATIONS) {
      throw new ResolutionError(
        'Too many resolution iterations',
        ResolutionErrorCode.MAX_ITERATIONS_EXCEEDED,
        { value: text, context }
      );
    }

    // Then resolve any remaining simple variables
    return this.resolveSimpleVariables(resolvedText, context, resolutionPath);
  }

  /**
   * Resolves simple (non-nested) variable references
   */
  private resolveSimpleVariables(
    text: string,
    context: ResolutionContext,
    resolutionPath: string[]
  ): string {
    this.variablePattern.lastIndex = 0;
    return text.replace(this.variablePattern, (match, varRef) => {
      // Handle environment variables with fallbacks
      if (varRef.startsWith('ENV_') && varRef.includes(':-')) {
        const [envVar, fallback] = varRef.split(':-');
        const value = process.env[envVar];
        if (value !== undefined) {
          return value;
        }
        return fallback;
      }

      // Handle field access (e.g., data.user.name)
      const parts = varRef.split('.');
      const baseVar = parts[0];

      // Check for circular references only for the base variable
      const currentPath = [...resolutionPath, baseVar];
      if (this.hasCircularReference(currentPath)) {
        const pathStr = currentPath.join(' -> ');
        throw new ResolutionError(
          `Circular reference detected: ${pathStr}`,
          ResolutionErrorCode.CIRCULAR_REFERENCE,
          { value: text, context }
        );
      }

      // Try text variable first
      let value = this.stateService.getTextVar(baseVar);

      // If not found in text vars, try data vars
      if (value === undefined && context.allowedVariableTypes.data) {
        value = this.stateService.getDataVar(baseVar);
      }

      // Handle environment variables
      if (value === undefined && baseVar.startsWith('ENV_')) {
        const envVar = process.env[baseVar];
        if (envVar === undefined) {
          throw new ResolutionError(
            'Environment variable not set: ' + baseVar,
            ResolutionErrorCode.UNDEFINED_VARIABLE,
            { value: baseVar, context }
          );
        }
        return envVar;
      }

      // Handle undefined variables
      if (value === undefined) {
        throw new ResolutionError(
          'Undefined variable: ' + baseVar,
          ResolutionErrorCode.UNDEFINED_VARIABLE,
          { value: baseVar, context }
        );
      }

      // Handle field access for data variables
      if (parts.length > 1 && typeof value === 'object') {
        try {
          value = parts.slice(1).reduce((obj: any, field) => {
            if (field.includes('[') && field.includes(']')) {
              const [arrayName, indexExpr] = field.split('[');
              const index = indexExpr.slice(0, -1); // Remove closing bracket

              // If index is a variable reference, resolve it
              if (index.startsWith('${') && index.endsWith('}')) {
                const indexVar = index.slice(2, -1);
                const indexValue = this.stateService.getTextVar(indexVar);
                if (indexValue === undefined) {
                  throw new ResolutionError(
                    'Undefined index variable: ' + indexVar,
                    ResolutionErrorCode.UNDEFINED_VARIABLE,
                    { value: indexVar, context }
                  );
                }
                return obj[indexValue];
              }
              return obj[index];
            }
            return obj[field];
          }, value);
        } catch (error) {
          throw new ResolutionError(
            'Invalid field access: ' + parts.slice(1).join('.'),
            ResolutionErrorCode.FIELD_ACCESS_ERROR,
            { value: varRef, context }
          );
        }
      }

      return String(value);
    });
  }

  /**
   * Checks if a resolution path contains a circular reference
   */
  private hasCircularReference(path: string[]): boolean {
    const seen = new Set<string>();
    for (const varName of path) {
      if (seen.has(varName)) {
        return true;
      }
      seen.add(varName);
    }
    return false;
  }

  /**
   * Extracts all unique variable references from the given text
   * @param text Text containing variable references
   * @returns Array of unique variable names (without ${} and field access)
   */
  extractReferences(text: string): string[] {
    const matches = text.match(this.variablePattern);
    if (!matches) {
      return [];
    }

    const refs = matches.map(match => {
      // Remove ${} and get base variable name (before any field access)
      const varRef = match.slice(2, -1);
      return varRef.split('.')[0];
    });

    // Return unique references
    return [...new Set(refs)];
  }
}
```

# IValidationService.ts

```typescript
import type { DirectiveNode } from 'meld-spec';

export interface IValidationService {
  /**
   * Validate a directive node against its schema and constraints
   * @throws {MeldDirectiveError} If validation fails
   */
  validate(node: DirectiveNode): Promise<void>;

  /**
   * Register a validator function for a specific directive kind
   */
  registerValidator(kind: string, validator: (node: DirectiveNode) => Promise<void>): void;

  /**
   * Remove a validator for a specific directive kind
   */
  removeValidator(kind: string): void;

  /**
   * Check if a validator exists for a specific directive kind
   */
  hasValidator(kind: string): boolean;

  /**
   * Get all registered directive kinds that can be validated
   */
  getRegisteredDirectiveKinds(): string[];
}
```

# ValidationService.test.ts

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ValidationService } from './ValidationService.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import type { DirectiveNode } from 'meld-spec';
import {
  createTextDirective,
  createDataDirective,
  createImportDirective,
  createEmbedDirective,
  createPathDirective,
  createLocation
} from '@tests/utils/testFactories.js';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';

describe('ValidationService', () => {
  let service: ValidationService;

  beforeEach(() => {
    service = new ValidationService();
  });

  describe('Service initialization', () => {
    it('should initialize with default validators', () => {
      const kinds = service.getRegisteredDirectiveKinds();
      expect(kinds).toContain('text');
      expect(kinds).toContain('data');
      expect(kinds).toContain('import');
      expect(kinds).toContain('embed');
      expect(kinds).toContain('path');
    });
  });

  describe('Validator registration', () => {
    it('should register a new validator', () => {
      const validator = async () => {};
      service.registerValidator('custom', validator);
      expect(service.hasValidator('custom')).toBe(true);
    });

    it('should throw on invalid validator registration', () => {
      expect(() => service.registerValidator('', async () => {}))
        .toThrow('Validator kind must be a non-empty string');
      expect(() => service.registerValidator('test', null as any))
        .toThrow('Validator must be a function');
    });

    it('should remove a validator', () => {
      service.registerValidator('custom', async () => {});
      expect(service.hasValidator('custom')).toBe(true);
      service.removeValidator('custom');
      expect(service.hasValidator('custom')).toBe(false);
    });
  });

  describe('Text directive validation', () => {
    it('should validate a valid text directive', async () => {
      const node = createTextDirective('greeting', 'Hello', createLocation(1, 1));
      await expect(service.validate(node)).resolves.not.toThrow();
    });

    it('should throw on missing name', async () => {
      const node = createTextDirective('', 'Hello', createLocation(1, 1));
      await expect(service.validate(node)).rejects.toThrow(MeldDirectiveError);
      await expect(service.validate(node)).rejects.toMatchObject({
        code: DirectiveErrorCode.VALIDATION_FAILED
      });
    });

    it('should throw on missing value', async () => {
      const node = createTextDirective('greeting', '', createLocation(1, 1));
      await expect(service.validate(node)).rejects.toThrow(MeldDirectiveError);
      await expect(service.validate(node)).rejects.toMatchObject({
        code: DirectiveErrorCode.VALIDATION_FAILED
      });
    });

    it('should throw on invalid name format', async () => {
      const node = createTextDirective('123invalid', 'Hello', createLocation(1, 1));
      await expect(service.validate(node)).rejects.toThrow(MeldDirectiveError);
      await expect(service.validate(node)).rejects.toMatchObject({
        code: DirectiveErrorCode.VALIDATION_FAILED
      });
    });
  });

  describe('Data directive validation', () => {
    it('should validate a valid data directive with string value', async () => {
      const node = createDataDirective('config', '{"key": "value"}', createLocation(1, 1));
      await expect(service.validate(node)).resolves.not.toThrow();
    });

    it('should validate a valid data directive with object value', async () => {
      const node = createDataDirective('config', { key: 'value' }, createLocation(1, 1));
      await expect(service.validate(node)).resolves.not.toThrow();
    });

    it('should throw on invalid JSON string', async () => {
      const node = createDataDirective('config', '{invalid json}', createLocation(1, 1));
      await expect(service.validate(node)).rejects.toThrow(MeldDirectiveError);
      await expect(service.validate(node)).rejects.toMatchObject({
        code: DirectiveErrorCode.VALIDATION_FAILED
      });
    });

    it('should throw on missing name', async () => {
      const node = createDataDirective('', { key: 'value' }, createLocation(1, 1));
      await expect(service.validate(node)).rejects.toThrow(MeldDirectiveError);
      await expect(service.validate(node)).rejects.toMatchObject({
        code: DirectiveErrorCode.VALIDATION_FAILED
      });
    });

    it('should throw on invalid name format', async () => {
      const node = createDataDirective('123invalid', { key: 'value' }, createLocation(1, 1));
      await expect(service.validate(node)).rejects.toThrow(MeldDirectiveError);
      await expect(service.validate(node)).rejects.toMatchObject({
        code: DirectiveErrorCode.VALIDATION_FAILED
      });
    });
  });

  describe('Path directive validation', () => {
    it('should validate a valid path directive with $HOMEPATH', async () => {
      const node = createPathDirective('docs', '$HOMEPATH/docs', createLocation(1, 1));
      await expect(service.validate(node)).resolves.not.toThrow();
    });

    it('should validate a valid path directive with $PROJECTPATH', async () => {
      const node = createPathDirective('src', '$PROJECTPATH/src', createLocation(1, 1));
      await expect(service.validate(node)).resolves.not.toThrow();
    });

    it('should validate a valid path directive with $~', async () => {
      const node = createPathDirective('config', '$~/config', createLocation(1, 1));
      await expect(service.validate(node)).resolves.not.toThrow();
    });

    it('should validate a valid path directive with $.', async () => {
      const node = createPathDirective('test', '$./test', createLocation(1, 1));
      await expect(service.validate(node)).resolves.not.toThrow();
    });

    it('should throw on missing identifier', async () => {
      const node = createPathDirective('', '$HOMEPATH/docs', createLocation(1, 1));
      await expect(service.validate(node)).rejects.toThrow(MeldDirectiveError);
      await expect(service.validate(node)).rejects.toMatchObject({
        code: DirectiveErrorCode.VALIDATION_FAILED
      });
    });

    it('should throw on invalid identifier format', async () => {
      const node = createPathDirective('123invalid', '$HOMEPATH/docs', createLocation(1, 1));
      await expect(service.validate(node)).rejects.toThrow(MeldDirectiveError);
      await expect(service.validate(node)).rejects.toMatchObject({
        code: DirectiveErrorCode.VALIDATION_FAILED
      });
    });

    it('should throw on missing value', async () => {
      const node = createPathDirective('docs', '', createLocation(1, 1));
      await expect(service.validate(node)).rejects.toThrow(MeldDirectiveError);
      await expect(service.validate(node)).rejects.toMatchObject({
        code: DirectiveErrorCode.VALIDATION_FAILED
      });
    });

    it('should throw on empty path value', async () => {
      const node = createPathDirective('docs', '   ', createLocation(1, 1));
      await expect(service.validate(node)).rejects.toThrow(MeldDirectiveError);
      await expect(service.validate(node)).rejects.toMatchObject({
        code: DirectiveErrorCode.VALIDATION_FAILED
      });
    });
  });

  describe('Import directive validation', () => {
    it('should validate a valid import directive', async () => {
      const node = createImportDirective('test.md', createLocation(1, 1));
      await expect(service.validate(node)).resolves.not.toThrow();
    });

    it('should throw on missing path', async () => {
      const node = createImportDirective('', createLocation(1, 1));
      await expect(service.validate(node)).rejects.toThrow(MeldDirectiveError);
      await expect(service.validate(node)).rejects.toMatchObject({
        code: DirectiveErrorCode.VALIDATION_FAILED
      });
    });
  });

  describe('Embed directive validation', () => {
    it('should validate a valid embed directive', async () => {
      const node = createEmbedDirective('test.md', 'section', createLocation(1, 1));
      await expect(service.validate(node)).resolves.not.toThrow();
    });

    it('should validate embed directive without section', async () => {
      const node = createEmbedDirective('test.md', undefined, createLocation(1, 1));
      await expect(service.validate(node)).resolves.not.toThrow();
    });

    it('should throw on missing path', async () => {
      const node = createEmbedDirective('', undefined, createLocation(1, 1));
      await expect(service.validate(node)).rejects.toThrow(MeldDirectiveError);
      await expect(service.validate(node)).rejects.toMatchObject({
        code: DirectiveErrorCode.VALIDATION_FAILED
      });
    });

    it('should validate fuzzy matching threshold', async () => {
      const node = createEmbedDirective('test.md', 'section', createLocation(1, 1));
      node.directive.fuzzy = 0.8;
      await expect(service.validate(node)).resolves.not.toThrow();
    });

    it('should throw on invalid fuzzy threshold (below 0)', async () => {
      const node = createEmbedDirective('test.md', 'section', createLocation(1, 1));
      node.directive.fuzzy = -0.1;
      await expect(service.validate(node)).rejects.toThrow(MeldDirectiveError);
      await expect(service.validate(node)).rejects.toMatchObject({
        code: DirectiveErrorCode.VALIDATION_FAILED
      });
    });

    it('should throw on invalid fuzzy threshold (above 1)', async () => {
      const node = createEmbedDirective('test.md', 'section', createLocation(1, 1));
      node.directive.fuzzy = 1.1;
      await expect(service.validate(node)).rejects.toThrow(MeldDirectiveError);
      await expect(service.validate(node)).rejects.toMatchObject({
        code: DirectiveErrorCode.VALIDATION_FAILED
      });
    });
  });

  describe('Unknown directive handling', () => {
    it('should throw on unknown directive kind', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'unknown'
        },
        location: createLocation(1, 1)
      };

      await expect(service.validate(node)).rejects.toThrow(MeldDirectiveError);
      await expect(service.validate(node)).rejects.toMatchObject({
        code: DirectiveErrorCode.HANDLER_NOT_FOUND
      });
    });
  });
});
```

# ValidationService.ts

```typescript
import type { DirectiveNode } from 'meld-spec';
import { validationLogger as logger } from '@core/utils/logger.js';
import { IValidationService } from './IValidationService.js';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';

// Import default validators
import { validateTextDirective } from './validators/TextDirectiveValidator.js';
import { validateDataDirective } from './validators/DataDirectiveValidator.js';
import { validateImportDirective } from './validators/ImportDirectiveValidator.js';
import { validateEmbedDirective } from './validators/EmbedDirectiveValidator.js';
import { validatePathDirective } from './validators/PathDirectiveValidator.js';
import { validateDefineDirective } from './validators/DefineDirectiveValidator.js';
import { validateRunDirective } from './validators/RunDirectiveValidator.js';

export class ValidationService implements IValidationService {
  private validators = new Map<string, (node: DirectiveNode) => Promise<void>>();

  constructor() {
    // Register default validators
    this.registerValidator('text', async (node) => validateTextDirective(node));
    this.registerValidator('data', async (node) => validateDataDirective(node));
    this.registerValidator('import', async (node) => validateImportDirective(node));
    this.registerValidator('embed', async (node) => validateEmbedDirective(node));
    this.registerValidator('path', async (node) => validatePathDirective(node));
    this.registerValidator('define', async (node) => validateDefineDirective(node));
    this.registerValidator('run', async (node) => validateRunDirective(node));

    logger.debug('ValidationService initialized with default validators', {
      validators: Array.from(this.validators.keys())
    });
  }

  /**
   * Validate a directive node against its schema and constraints
   * @throws {MeldDirectiveError} If validation fails
   */
  async validate(node: DirectiveNode): Promise<void> {
    logger.debug('Validating directive', {
      kind: node.directive.kind,
      location: node.location
    });

    const validator = this.validators.get(node.directive.kind);
    if (!validator) {
      throw new MeldDirectiveError(
        `Unknown directive kind: ${node.directive.kind}`,
        node.directive.kind,
        node.location?.start,
        DirectiveErrorCode.HANDLER_NOT_FOUND
      );
    }

    try {
      await validator(node);
      logger.debug('Directive validation successful', {
        kind: node.directive.kind,
        location: node.location
      });
    } catch (error) {
      logger.error('Directive validation failed', {
        kind: node.directive.kind,
        location: node.location,
        error
      });
      throw error;
    }
  }

  registerValidator(kind: string, validator: (node: DirectiveNode) => Promise<void>): void {
    if (!kind || typeof kind !== 'string') {
      throw new Error('Validator kind must be a non-empty string');
    }
    if (typeof validator !== 'function') {
      throw new Error('Validator must be a function');
    }

    this.validators.set(kind, validator);
    logger.debug('Registered validator', { kind });
  }

  removeValidator(kind: string): void {
    if (this.validators.delete(kind)) {
      logger.debug('Removed validator', { kind });
    }
  }

  hasValidator(kind: string): boolean {
    return this.validators.has(kind);
  }

  getRegisteredDirectiveKinds(): string[] {
    return Array.from(this.validators.keys());
  }
}
```

# DataDirectiveValidator.ts

```typescript
import { DirectiveNode, DataDirective } from 'meld-spec';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';

/**
 * Validates @data directives
 */
export function validateDataDirective(node: DirectiveNode): void {
  const directive = node.directive as DataDirective;

  // Validate identifier
  if (!directive.identifier || typeof directive.identifier !== 'string') {
    throw new MeldDirectiveError(
      'Data directive requires an "identifier" property (string)',
      'data',
      node.location?.start,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }

  // Validate identifier format
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(directive.identifier)) {
    throw new MeldDirectiveError(
      'Data identifier must be a valid identifier (letters, numbers, underscore, starting with letter/underscore)',
      'data',
      node.location?.start,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }

  // Validate value
  if (directive.value === undefined) {
    throw new MeldDirectiveError(
      'Data directive requires a value',
      'data',
      node.location?.start,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }

  // If value is a string, try to parse it as JSON
  if (typeof directive.value === 'string') {
    try {
      JSON.parse(directive.value);
    } catch (error) {
      throw new MeldDirectiveError(
        'Invalid JSON string in data directive',
        'data',
        node.location?.start,
        DirectiveErrorCode.VALIDATION_FAILED
      );
    }
  }

  // Validate value is JSON-serializable
  try {
    JSON.stringify(directive.value);
  } catch (error) {
    throw new MeldDirectiveError(
      'Data value must be JSON-serializable',
      'data',
      node.location?.start,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }
}
```

# DefineDirectiveValidator.ts

```typescript
import { DirectiveNode, DefineDirective } from 'meld-spec';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';

/**
 * Validates @define directives
 */
export function validateDefineDirective(node: DirectiveNode): void {
  const directive = node.directive as DefineDirective;

  // Validate identifier
  if (!directive.identifier || typeof directive.identifier !== 'string') {
    throw new MeldDirectiveError(
      'Define directive requires an "identifier" property (string)',
      'define',
      node.location?.start,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }

  // Validate identifier format
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*(?:\.(risk|about)(?:\.(high|med|low))?)?$/.test(directive.identifier)) {
    throw new MeldDirectiveError(
      'Invalid define directive identifier format',
      'define',
      node.location?.start,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }

  // Validate value exists
  if (!directive.value || typeof directive.value !== 'string') {
    throw new MeldDirectiveError(
      'Define directive requires a "value" property (string)',
      'define',
      node.location?.start,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }

  // Try to parse as JSON first
  try {
    const parsed = JSON.parse(directive.value);
    if (parsed.command?.kind === 'run' && typeof parsed.command.command === 'string') {
      // For JSON format, validate command is not empty
      if (!parsed.command.command.trim()) {
        throw new MeldDirectiveError(
          'Command cannot be empty',
          'define',
          node.location?.start,
          DirectiveErrorCode.VALIDATION_FAILED
        );
      }
      return;
    }
  } catch (e) {
    // Not JSON, validate raw command is not empty
    if (!directive.value.trim()) {
      throw new MeldDirectiveError(
        'Command cannot be empty',
        'define',
        node.location?.start,
        DirectiveErrorCode.VALIDATION_FAILED
      );
    }
  }
}
```

# EmbedDirectiveValidator.ts

```typescript
import type { DirectiveNode, EmbedDirective } from 'meld-spec';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';

export function validateEmbedDirective(node: DirectiveNode): void {
  const directive = node.directive as EmbedDirective;

  // Check required fields from meld-spec
  if (!directive.path || typeof directive.path !== 'string') {
    throw new MeldDirectiveError(
      'Embed directive requires a "path" property (string)',
      'embed',
      node.location?.start,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }

  // Path cannot be empty
  if (directive.path.trim() === '') {
    throw new MeldDirectiveError(
      'Embed directive path cannot be empty',
      'embed',
      node.location?.start,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }

  // Optional fields validation
  if (directive.section !== undefined && typeof directive.section !== 'string') {
    throw new MeldDirectiveError(
      'Embed directive "section" property must be a string if provided',
      'embed',
      node.location?.start,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }

  if (directive.fuzzy !== undefined) {
    if (typeof directive.fuzzy !== 'number' || directive.fuzzy < 0 || directive.fuzzy > 1) {
      throw new MeldDirectiveError(
        'Embed directive "fuzzy" property must be a number between 0 and 1 if provided',
        'embed',
        node.location?.start,
        DirectiveErrorCode.VALIDATION_FAILED
      );
    }
  }

  if (directive.format !== undefined && typeof directive.format !== 'string') {
    throw new MeldDirectiveError(
      'Embed directive "format" property must be a string if provided',
      'embed',
      node.location?.start,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }
}
```

# FuzzyMatchingValidator.test.ts

```typescript
import { describe, it, expect } from 'vitest';
import { validateFuzzyThreshold } from './FuzzyMatchingValidator.js';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import { createEmbedDirective, createLocation } from '@tests/utils/testFactories.js';

describe('FuzzyMatchingValidator', () => {
  describe('Fuzzy threshold validation', () => {
    it('should accept valid fuzzy thresholds', () => {
      const validThresholds = [0, 0.5, 0.8, 1];

      for (const threshold of validThresholds) {
        const node = createEmbedDirective('test.md', 'section', createLocation(1, 1));
        node.directive.fuzzy = threshold;
        expect(() => validateFuzzyThreshold(node)).not.toThrow();
      }
    });

    it.todo('should reject fuzzy thresholds below 0 - Edge case validation deferred for V1');

    it.todo('should reject fuzzy thresholds above 1 - Edge case validation deferred for V1');

    it.todo('should reject non-numeric fuzzy thresholds - Edge case validation deferred for V1');

    it('should handle missing fuzzy threshold (undefined is valid)', () => {
      const node = createEmbedDirective('test.md', 'section', createLocation(1, 1));
      // Don't set fuzzy threshold
      expect(() => validateFuzzyThreshold(node)).not.toThrow();
    });

    it.todo('should provide helpful error messages - Detailed error messaging deferred for V1');
  });
});
```

# FuzzyMatchingValidator.ts

```typescript
import type { DirectiveNode } from 'meld-spec';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';

/**
 * Validates fuzzy matching threshold values in directives that support them.
 * Valid thresholds must be numbers between 0 and 1 inclusive.
 * Undefined thresholds are allowed (will use default).
 */
export function validateFuzzyThreshold(node: DirectiveNode): void {
  const { fuzzy } = node.directive;

  // Undefined is valid (will use default)
  if (fuzzy === undefined) {
    return;
  }

  // Must be a number
  if (typeof fuzzy !== 'number' || isNaN(fuzzy) || fuzzy === null || fuzzy === true || fuzzy === false) {
    throw new MeldDirectiveError(
      'Fuzzy matching threshold must be a number',
      node.directive.kind,
      node.location?.start
    );
  }

  // Must be between 0 and 1
  if (fuzzy < 0 || fuzzy > 1) {
    throw new MeldDirectiveError(
      'Fuzzy matching threshold must be between 0 and 1',
      node.directive.kind,
      node.location?.start
    );
  }
}
```

# ImportDirectiveValidator.ts

```typescript
import { DirectiveNode, ImportDirective } from 'meld-spec';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';

/**
 * Validates @import directives
 */
export function validateImportDirective(node: DirectiveNode): void {
  const directive = node.directive as ImportDirective;

  // Handle both old format (value) and new format (path)
  const value = directive.value || directive.path;

  if (!value) {
    throw new MeldDirectiveError(
      'Import directive requires a path',
      'import',
      node.location,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }

  // Try new format: @import [x,y,z] from [file.md] or @import [file.md]
  // Now also handles path variables like [$./file.md]
  const newFormatMatch = value.match(/^\s*\[([^\]]+)\](?:\s+from\s+\[([^\]]+)\])?\s*$/);
  if (newFormatMatch) {
    const [, importsOrPath, fromPath] = newFormatMatch;
    const path = fromPath || importsOrPath;

    // Validate path
    validatePath(path.trim(), node);

    // If it's an explicit import list, validate each import
    if (fromPath && importsOrPath !== '*') {
      validateImportList(importsOrPath, node);
    }
    return;
  }

  // Try old format with path parameter
  const pathMatch = value.match(/path\s*=\s*["']([^"']+)["']/);
  if (!pathMatch) {
    throw new MeldDirectiveError(
      'Invalid import syntax. Expected either @import [file.md] or @import [x,y,z] from [file.md]',
      'import',
      node.location,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }

  const path = pathMatch[1];
  validatePath(path, node);

  // Check for import list in old format
  const importListMatch = value.match(/imports\s*=\s*\[(.*?)\]/);
  if (importListMatch) {
    const importList = importListMatch[1].trim();
    if (importList) {
      validateImportList(importList, node);
    }
  }
}

function validatePath(path: string, node: DirectiveNode): void {
  // Validate path is not empty
  if (path.trim() === '') {
    throw new MeldDirectiveError(
      'Import path cannot be empty',
      'import',
      node.location,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }

  // Allow path variables starting with $ but still validate ..
  if (!path.startsWith('$') && path.includes('..')) {
    throw new MeldDirectiveError(
      'Import path cannot contain parent directory references (..) unless using a path variable',
      'import',
      node.location,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }
}

function validateImportList(importList: string, node: DirectiveNode): void {
  if (importList === '*') {
    return; // Wildcard import is valid
  }

  const imports = importList.split(',');
  for (const imp of imports) {
    const asMatch = imp.trim().match(/^(\S+)(?:\s+as\s+(\S+))?$/);
    if (!asMatch) {
      throw new MeldDirectiveError(
        `Invalid import syntax: ${imp}`,
        'import',
        node.location,
        DirectiveErrorCode.VALIDATION_FAILED
      );
    }

    const [, identifier, alias] = asMatch;
    if (!identifier || identifier.trim() === '') {
      throw new MeldDirectiveError(
        'Import identifier cannot be empty',
        'import',
        node.location,
        DirectiveErrorCode.VALIDATION_FAILED
      );
    }

    if (alias && alias.trim() === '') {
      throw new MeldDirectiveError(
        'Import alias cannot be empty',
        'import',
        node.location,
        DirectiveErrorCode.VALIDATION_FAILED
      );
    }
  }
}
```

# PathDirectiveValidator.ts

```typescript
import { DirectiveNode, PathDirective } from 'meld-spec';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';

/**
 * Validates @path directives
 * Format: @path variable = "$./path" or "$~/path" or "$PROJECTPATH/path" or "$HOMEPATH/path"
 * The AST will have already parsed and normalized the path variables
 */
export function validatePathDirective(node: DirectiveNode): void {
  const directive = node.directive as PathDirective;

  // Validate identifier
  if (!directive.identifier || typeof directive.identifier !== 'string') {
    throw new MeldDirectiveError(
      'Path directive requires an "identifier" property (string)',
      'path',
      node.location?.start,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }

  // Validate identifier format
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(directive.identifier)) {
    throw new MeldDirectiveError(
      'Path identifier must be a valid identifier (letters, numbers, underscore, starting with letter/underscore)',
      'path',
      node.location?.start,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }

  // Validate value exists
  if (!directive.value || typeof directive.value !== 'string') {
    throw new MeldDirectiveError(
      'Path directive requires a "value" property (string)',
      'path',
      node.location?.start,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }

  // The AST will have already validated and normalized the path format
  // We just need to ensure it's not empty
  if (directive.value.trim() === '') {
    throw new MeldDirectiveError(
      'Path value cannot be empty',
      'path',
      node.location?.start,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }
}
```

# RunDirectiveValidator.ts

```typescript
import { DirectiveNode } from 'meld-spec';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';

/**
 * Validates @run directives
 */
export async function validateRunDirective(node: DirectiveNode): Promise<void> {
  const directive = node.directive;

  // Extract command from either the command property or the value property
  let command: string | undefined;

  if (directive.command && typeof directive.command === 'string') {
    command = directive.command;
  } else if (typeof directive.value === 'string') {
    // Check for [command] format
    const match = directive.value.match(/^\[(.*)\]$/);
    if (match) {
      command = match[1];
    }
  }

  // Validate command exists and is not empty
  if (!command) {
    throw new MeldDirectiveError(
      'Run directive requires a command (either as a property or in [command] format)',
      'run',
      node.location?.start,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }

  if (!command.trim()) {
    throw new MeldDirectiveError(
      'Run directive command cannot be empty',
      'run',
      node.location?.start,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }

  // Store the command in the directive for later use
  directive.command = command;
}
```

# TextDirectiveValidator.ts

```typescript
import type { DirectiveNode, TextDirective } from 'meld-spec';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';

/**
 * Validates @text directives according to spec
 */
export function validateTextDirective(node: DirectiveNode): void {
  const directive = node.directive as TextDirective;

  // Validate identifier
  if (!directive.identifier || typeof directive.identifier !== 'string') {
    throw new MeldDirectiveError(
      'Text directive requires an "identifier" property (string)',
      'text',
      node.location?.start,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }

  // Validate identifier format
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(directive.identifier)) {
    throw new MeldDirectiveError(
      'Text directive identifier must be a valid identifier (letters, numbers, underscore, starting with letter/underscore)',
      'text',
      node.location?.start,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }

  // Validate value
  if (directive.value === undefined || directive.value === '') {
    throw new MeldDirectiveError(
      'Text directive requires a non-empty "value" property',
      'text',
      node.location?.start,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }

  // Value must be a string
  if (typeof directive.value !== 'string') {
    throw new MeldDirectiveError(
      'Text directive "value" property must be a string',
      'text',
      node.location?.start,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }

  // If it's a quoted string (not from @embed, @run, or @call), validate quotes
  if (!directive.value.startsWith('@')) {
    // Check for mismatched quotes
    const firstQuote = directive.value[0];
    const lastQuote = directive.value[directive.value.length - 1];

    // Allow both single and double quotes, but they must match
    if (firstQuote !== lastQuote || !["'", '"', '`'].includes(firstQuote)) {
      // If the value contains quotes inside, they must be properly escaped
      const unescapedQuotes = directive.value.match(/(?<!\\)['"`]/g);
      if (unescapedQuotes && unescapedQuotes.length > 2) {
        throw new MeldDirectiveError(
          'Text directive string value contains unescaped quotes',
          'text',
          node.location?.start
        );
      }
    }

    // Check for multiline strings in non-template literals
    if (firstQuote !== '`' && directive.value.includes('\n')) {
      throw new MeldDirectiveError(
        'Multiline strings are only allowed in template literals (backtick quotes)',
        'text',
        node.location?.start
      );
    }
  } else {
    // Value is from @embed, @run, or @call
    const validPrefixes = ['@embed', '@run', '@call'];
    const prefix = validPrefixes.find(p => directive.value.startsWith(p));

    if (!prefix) {
      throw new MeldDirectiveError(
        'Text directive value starting with @ must be an @embed, @run, or @call directive',
        'text',
        node.location?.start
      );
    }

    // For @call, validate format
    if (directive.value.startsWith('@call')) {
      const callPattern = /^@call\s+[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*\s+\[[^\]]*\]$/;
      if (!callPattern.test(directive.value)) {
        throw new MeldDirectiveError(
          'Invalid @call format in text directive. Must be "@call api.method [path]"',
          'text',
          node.location?.start
        );
      }
    }
  }
}
```

\=== YOUR TASK

Can you please make a plan for the specific changes needed to `api/index.ts` and `api/api.test.ts` in order to align with our more sophisticated services setup?
