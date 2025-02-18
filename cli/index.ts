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

// TODO: Implement CLI
export async function main(customFs?: NodeFileSystem) {
  try {
    // Create service instances
    const stateService = new StateService();
    const pathOps = new PathOperationsService();
    const nodeFs = customFs || new NodeFileSystem();
    const fileSystemService = new FileSystemService(pathOps, nodeFs);
    const parserService = new ParserService();
    const pathService = new PathService();
    const outputService = new OutputService();
    const interpreterService = new InterpreterService();
    const directiveService = new DirectiveService();
    const validationService = new ValidationService();
    const circularityService = new CircularityService();
    const resolutionService = new ResolutionService(stateService, fileSystemService, parserService);

    // Initialize services that need it
    pathService.initialize(fileSystemService);

    // Enable test mode for PathService in test environment
    if (process.env.NODE_ENV === 'test') {
      pathService.enableTestMode();
      pathService.setProjectPath('/project');
      // Add project path to process.argv for CLI service
      process.argv.push('--project-path', '/project');
    }

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
    interpreterService.initialize(directiveService, stateService);

    // Create CLI service with dependencies
    const cli = new CLIService(
      parserService,
      interpreterService,
      outputService,
      fileSystemService,
      pathService,
      stateService
    );

    // Run with process arguments
    await cli.run(process.argv);

    // Only exit in non-test environments
    if (process.env.NODE_ENV !== 'test') {
      process.exit(0);
    }
  } catch (error) {
    logger.error('CLI execution failed', {
      error: error instanceof Error ? error.message : String(error)
    });
    
    // Only exit in non-test environments
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
    throw error;
  }
}

// Run if this is the main module
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
} 