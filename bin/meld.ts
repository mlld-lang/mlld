#!/usr/bin/env node

import { CLIService } from '../services/CLIService/CLIService';
import { ParserService } from '../services/ParserService/ParserService';
import { InterpreterService } from '../services/InterpreterService/InterpreterService';
import { OutputService } from '../services/OutputService/OutputService';
import { FileSystemService } from '@services/FileSystemService/FileSystemService.js';
import { PathService } from '../services/PathService/PathService';
import { StateService } from '../services/StateService/StateService';
import { PathOperationsService } from '@services/FileSystemService/PathOperationsService.js';
import { NodeFileSystem } from '@services/FileSystemService/NodeFileSystem.js';
import { cliLogger as logger } from '../core/utils/logger';

// Create services
const parserService = new ParserService();
const interpreterService = new InterpreterService();
const outputService = new OutputService();
const pathOps = new PathOperationsService();
const nodeFs = new NodeFileSystem();
const fileSystemService = new FileSystemService(pathOps, nodeFs);
const pathService = new PathService();
const stateService = new StateService();

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
cliService.run(process.argv).catch((error: Error) => {
  logger.error('CLI execution failed', {
    error: error instanceof Error ? error.message : String(error)
  });
  process.exit(1);
}); 