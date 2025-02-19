import { CLIService } from '@services/CLIService/CLIService.js';
import { ParserService } from '@services/ParserService/ParserService.js';
import { InterpreterService } from '@services/InterpreterService/InterpreterService.js';
import { OutputService } from '@services/OutputService/OutputService.js';
import { FileSystemService } from '@services/FileSystemService/FileSystemService.js';
import { PathService } from '@services/PathService/PathService.js';
import { StateService } from '@services/StateService/StateService.js';
import { DirectiveService } from '@services/DirectiveService/DirectiveService.js';
import { PathOperationsService } from '@services/FileSystemService/PathOperationsService.js';
import { NodeFileSystem } from '@services/FileSystemService/NodeFileSystem.js';
import { cliLogger as logger } from '@core/utils/logger.js';
import { ValidationService } from '@services/ValidationService/ValidationService.js';
import { CircularityService } from '@services/CircularityService/CircularityService.js';
import { ResolutionService } from '@services/ResolutionService/ResolutionService.js';
import { IFileSystem } from '@services/FileSystemService/IFileSystem.js';
import { createInterface } from 'readline';

// Create services
const parserService = new ParserService();
const interpreterService = new InterpreterService();
const outputService = new OutputService();
const pathOps = new PathOperationsService();
const nodeFs = new NodeFileSystem();
const fileSystemService = new FileSystemService(pathOps, nodeFs);
const pathService = new PathService();
const stateService = new StateService();
const validationService = new ValidationService();
const circularityService = new CircularityService();
const resolutionService = new ResolutionService(stateService, fileSystemService, parserService);
const directiveService = new DirectiveService();

// Initialize services
directiveService.initialize(
  validationService,
  stateService,
  pathService,
  fileSystemService,
  parserService,
  interpreterService,
  circularityService,
  resolutionService
);

// Initialize interpreter service
interpreterService.initialize(directiveService, stateService);

// Create CLI service
const cliService = new CLIService(
  parserService,
  interpreterService,
  outputService,
  fileSystemService,
  pathService,
  stateService
);

// Run CLI
export async function main(fsAdapter?: IFileSystem) {
  try {
    if (fsAdapter) {
      // In test mode, use the provided file system adapter
      fileSystemService.setFileSystem(fsAdapter);
    }

    // Initialize path service
    pathService.initialize(fileSystemService);

    await cliService.run(process.argv);
  } catch (error) {
    logger.error('CLI execution failed', {
      error: error instanceof Error ? error.message : String(error)
    });
    
    // In test mode, throw the error for proper test handling
    if (process.env.NODE_ENV === 'test') {
      // Preserve the original error message and type
      if (error instanceof Error) {
        throw error;
      } else {
        throw new Error(String(error));
      }
    } else {
      // In production, exit with error code
      process.exit(1);
    }
  }
}

// Only run if this is the main module
if (require.main === module) {
  main().catch(() => {
    process.exit(1);
  });
} 