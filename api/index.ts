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
import { StateDebuggerService } from '@tests/utils/debug/StateDebuggerService/StateDebuggerService.js';
import { ProcessOptions, Services } from '@core/types/index.js';

// Import debug services
import { StateTrackingService } from '@tests/utils/debug/StateTrackingService/StateTrackingService.js';
import { StateVisualizationService } from '@tests/utils/debug/StateVisualizationService/StateVisualizationService.js';
import { StateHistoryService } from '@tests/utils/debug/StateHistoryService/StateHistoryService.js';
import { StateEventService } from '@services/state/StateEventService/StateEventService.js';
import { TestDebuggerService } from '@tests/utils/debug/TestDebuggerService.js';

// Package info
export { version } from '@core/version.js';

import { validateServicePipeline } from '@core/utils/serviceValidation.js';

// Define the required services type
type RequiredServices = {
  filesystem: FileSystemService;
  parser: ParserService;
  interpreter: InterpreterService;
  directive: DirectiveService;
  state: StateService;
  output: OutputService;
  eventService: StateEventService;
  path: PathService;
  validation: ValidationService;
  circularity: CircularityService;
  resolution: ResolutionService;
  debug?: StateDebuggerService & TestDebuggerService;
};

function createDefaultServices(options: ProcessOptions): Services & RequiredServices {
  // 1. FileSystemService (base dependency)
  const pathOps = new PathOperationsService();
  const fs = options.fs || new NodeFileSystem();
  const filesystem = new FileSystemService(pathOps, fs);
  filesystem.setFileSystem(fs);

  // 2. PathService (depends on filesystem)
  const path = new PathService();
  path.initialize(filesystem);

  // 3. State Management Services
  const eventService = new StateEventService();
  const state = new StateService();
  state.setEventService(eventService);

  // 4. ParserService (independent)
  const parser = new ParserService();

  // 5. Resolution Layer Services
  const resolution = new ResolutionService(state, filesystem, parser);
  const validation = new ValidationService();
  const circularity = new CircularityService();

  // 6. Pipeline Orchestration (handle circular dependency)
  const directive = new DirectiveService();
  const interpreter = new InterpreterService();

  // Initialize interpreter with directive and state
  interpreter.initialize(directive, state);

  // Initialize directive with all dependencies
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

  // Register default handlers after all services are initialized
  directive.registerDefaultHandlers();

  // 7. OutputService (depends on state and interpreter)
  const output = new OutputService();
  output.initialize(state);

  // Create debug service if requested
  let debug = undefined;
  if (options.debug) {
    debug = new TestDebuggerService(state) as StateDebuggerService & TestDebuggerService;
    debug.initialize(state);
  }

  // Create services object in correct initialization order based on dependencies
  const services: Services & RequiredServices = {
    // Base services
    filesystem,
    path,
    // State management
    eventService,
    state,
    // Core pipeline
    parser,
    // Resolution layer
    resolution,
    validation,
    circularity,
    // Pipeline orchestration
    directive,
    interpreter,
    // Output generation
    output,
    // Optional debug service
    debug
  };

  // Validate the service pipeline
  validateServicePipeline(services);

  return services;
}

export async function main(filePath: string, options: ProcessOptions = {}): Promise<string> {
  // Create default services
  const defaultServices = createDefaultServices(options);

  // Merge with provided services and ensure proper initialization
  const services = options.services ? { ...defaultServices, ...options.services } as Services & RequiredServices : defaultServices;

  // Validate the service pipeline after merging
  validateServicePipeline(services);

  // If directive service was injected, we need to re-initialize it and the interpreter
  if (options.services?.directive) {
    const directive = services.directive;
    const interpreter = services.interpreter;

    // Re-initialize directive with interpreter
    directive.initialize(
      services.validation,
      services.state,
      services.path,
      services.filesystem,
      services.parser,
      interpreter, // Pass interpreter immediately
      services.circularity,
      services.resolution
    );

    // Re-initialize interpreter with directive
    interpreter.initialize(directive, services.state);

    // Register default handlers
    directive.registerDefaultHandlers();
  }

  try {
    // Read the file
    const content = await services.filesystem.readFile(filePath);
    
    // Parse the content
    const ast = await services.parser.parse(content);
    
    // Enable transformation if requested (do this before interpretation)
    if (options.transformation) {
      services.state.enableTransformation(true);
    }
    
    // Interpret the AST
    const resultState = await services.interpreter.interpret(ast, { filePath, initialState: services.state });
    
    // Ensure transformation state is preserved from original state service
    if (services.state.isTransformationEnabled()) {
      resultState.enableTransformation(true);
    }
    
    // Get transformed nodes if available
    const nodesToProcess = resultState.isTransformationEnabled() && resultState.getTransformedNodes()
      ? resultState.getTransformedNodes()
      : ast;
    
    // Convert to desired format using the updated state
    const converted = await services.output.convert(nodesToProcess, resultState, options.format || 'llm');
    
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