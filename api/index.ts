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
import { DebuggerService } from '@tests/utils/debug/StateDebuggerService/StateDebuggerService.js';
import { ProcessOptions, Services } from '@core/types/index.js';

// Import debug services
import { StateTrackingService } from '@tests/utils/debug/StateTrackingService/StateTrackingService.js';
import { StateVisualizationService } from '@tests/utils/debug/StateVisualizationService/StateVisualizationService.js';
import { StateHistoryService } from '@tests/utils/debug/StateHistoryService/StateHistoryService.js';
import { StateEventService } from '@services/state/StateEventService/StateEventService.js';
import { TestDebuggerService } from '@tests/utils/debug/TestDebuggerService.js';

// Package info
export { version } from '@core/version.js';

function createDefaultServices(options: ProcessOptions): Services {
  // 1. FileSystemService (base dependency)
  const pathOps = new PathOperationsService();
  const fs = options.fs || new NodeFileSystem();
  const filesystem = new FileSystemService(pathOps, fs);
  filesystem.setFileSystem(fs);

  // 2. PathService (depends on FS)
  const path = new PathService();
  path.initialize(filesystem);

  // 3. StateService (core state)
  const state = new StateService();

  // 4. ParserService (independent)
  const parser = new ParserService();

  // 5. ResolutionService (depends on State, FS, Parser)
  const resolution = new ResolutionService(state, filesystem, parser);

  // 6. ValidationService (depends on Resolution)
  const validation = new ValidationService();

  // 7. CircularityService (depends on Resolution)
  const circularity = new CircularityService();

  // 8. InterpreterService (orchestrates others)
  const interpreter = new InterpreterService();

  // 9. DirectiveService (depends on multiple services)
  const directive = new DirectiveService();
  directive.initialize(
    validation,
    state,
    path,
    filesystem,
    parser,
    interpreter, // Pass interpreter immediately
    circularity,
    resolution
  );

  // Initialize interpreter with directive
  interpreter.initialize(directive, state);

  // Register default handlers after all services are initialized
  directive.registerDefaultHandlers();

  // 10. OutputService (depends on State)
  const output = new OutputService();
  output.initialize(state);

  // Create debug service if requested
  let debug = undefined;
  if (options.debug) {
    debug = new TestDebuggerService(state);
    debug.initialize(state);
  }

  // Create services object
  const services: Services = {
    parser,
    interpreter,
    state,
    resolution,
    path,
    validation,
    circularity,
    directive,
    output,
    filesystem,
    debug
  };

  return services;
}

export async function main(filePath: string, options: ProcessOptions = {}): Promise<string> {
  // Create default services
  const defaultServices = createDefaultServices(options);

  // Merge with provided services and ensure proper initialization
  const services = options.services ? { ...defaultServices, ...options.services } : defaultServices;

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

  // Validate required services
  const requiredServices = ['filesystem', 'parser', 'interpreter', 'directive', 'state', 'output'];
  const missingServices = requiredServices.filter(service => !services[service]);
  if (missingServices.length > 0) {
    throw new Error(`Missing required services: ${missingServices.join(', ')}`);
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