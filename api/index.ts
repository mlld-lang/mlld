// Core services
export * from '@services/InterpreterService/InterpreterService.js';
export * from '@services/ParserService/ParserService.js';
export * from '@services/StateService/StateService.js';
export * from '@services/ResolutionService/ResolutionService.js';
export * from '@services/DirectiveService/DirectiveService.js';
export * from '@services/ValidationService/ValidationService.js';
export * from '@services/PathService/PathService.js';
export * from '@services/FileSystemService/FileSystemService.js';
export * from '@services/FileSystemService/PathOperationsService.js';
export * from '@services/OutputService/OutputService.js';
export * from '@services/CircularityService/CircularityService.js';

// Core types and errors
export * from '@core/types/index.js';
export * from '@core/errors/MeldDirectiveError.js';
export * from '@core/errors/MeldInterpreterError.js';
export * from '@core/errors/MeldParseError.js';

// Import service classes
import { InterpreterService } from '@services/InterpreterService/InterpreterService.js';
import { ParserService } from '@services/ParserService/ParserService.js';
import { StateService } from '@services/StateService/StateService.js';
import { ResolutionService } from '@services/ResolutionService/ResolutionService.js';
import { DirectiveService } from '@services/DirectiveService/DirectiveService.js';
import { ValidationService } from '@services/ValidationService/ValidationService.js';
import { PathService } from '@services/PathService/PathService.js';
import { FileSystemService } from '@services/FileSystemService/FileSystemService.js';
import { PathOperationsService } from '@services/FileSystemService/PathOperationsService.js';
import { OutputService } from '@services/OutputService/OutputService.js';
import { CircularityService } from '@services/CircularityService/CircularityService.js';
import { NodeFileSystem } from '@services/FileSystemService/NodeFileSystem.js';
import { ProcessOptions } from '@core/types/index.js';

// Package info
export const version = '0.1.0';

export async function main(filePath: string, options: ProcessOptions = {}): Promise<string> {
  const pathOps = new PathOperationsService();
  const fs = new FileSystemService(pathOps, options.fs || new NodeFileSystem());
  const parser = new ParserService();
  const interpreter = new InterpreterService();
  const output = new OutputService();
  const state = new StateService();
  const directives = new DirectiveService();
  const validation = new ValidationService();
  const circularity = new CircularityService();
  const resolution = new ResolutionService(state, fs, parser);
  const path = new PathService();

  // Initialize services
  directives.initialize(
    validation,
    state,
    path,
    fs,
    parser,
    interpreter,
    circularity,
    resolution
  );
  interpreter.initialize(directives, state);
  
  // Read the file
  const content = await fs.readFile(filePath);
  
  // Parse the content
  const ast = await parser.parse(content);
  
  // Interpret the AST
  const result = await interpreter.interpret(ast, { filePath, initialState: state });
  
  // Convert to desired format
  const converted = await output.convert(ast, result, options.format || 'llm');
  
  return converted;
}