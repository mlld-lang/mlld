import { CLIService } from '@services/cli/CLIService/CLIService.js';
import { ParserService } from '@services/pipeline/ParserService/ParserService.js';
import { InterpreterService } from '@services/pipeline/InterpreterService/InterpreterService.js';
import { OutputService } from '@services/pipeline/OutputService/OutputService.js';
import { FileSystemService } from '@services/fs/FileSystemService/FileSystemService.js';
import { PathService } from '@services/fs/PathService/PathService.js';
import { StateService } from '@services/state/StateService/StateService.js';
import { DirectiveService } from '@services/pipeline/DirectiveService/DirectiveService.js';
import { PathOperationsService } from '@services/fs/FileSystemService/PathOperationsService.js';
import { NodeFileSystem } from '@services/fs/FileSystemService/NodeFileSystem.js';
import { cliLogger as logger } from '@core/utils/logger.js';
import { ValidationService } from '@services/resolution/ValidationService/ValidationService.js';
import { CircularityService } from '@services/resolution/CircularityService/CircularityService.js';
import { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService.js';
import { IFileSystem } from '@services/fs/FileSystemService/IFileSystem.js';
import { createInterface } from 'readline';
import { initCommand } from './commands/init.js';

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

// Initialize output service with state and resolution service
outputService.initialize(stateService, resolutionService);

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

    // Handle commands
    const args = process.argv.slice(2);
    if (args[0] === 'init') {
      await initCommand();
      return;
    }

    // Default to run command
    await cliService.run(args);
  } catch (error) {
    logger.error('CLI execution failed', {
      error: error instanceof Error ? error.message : String(error)
    });
    
    // Consistent behavior for both test and production
    // For tests, this will be caught at the top level and process.exit will be mocked
    // For production, this will actually exit the process
    process.exit(1);
  }
}

// Run the CLI if this is the main module
main().catch(() => {
  process.exit(1);
}); 