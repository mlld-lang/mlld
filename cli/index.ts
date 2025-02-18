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

// TODO: Implement CLI
export async function main() {
  try {
    // Create service instances
    const stateService = new StateService();
    const pathOps = new PathOperationsService();
    const nodeFs = new NodeFileSystem();
    const fileSystemService = new FileSystemService(pathOps, nodeFs);
    const parserService = new ParserService();
    const pathService = new PathService();
    const outputService = new OutputService();
    const interpreterService = new InterpreterService();
    const directiveService = new DirectiveService();

    // Initialize services that need it
    pathService.initialize(fileSystemService);
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
    process.exit(0);
  } catch (error) {
    logger.error('CLI execution failed', {
      error: error instanceof Error ? error.message : String(error)
    });
    process.exit(1);
  }
}

// Run if this is the main module
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
} 