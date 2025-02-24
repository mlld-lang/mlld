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