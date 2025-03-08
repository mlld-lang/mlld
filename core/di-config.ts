import 'reflect-metadata';
import { container } from 'tsyringe';

// Import all service classes that need explicit registration
import { ResolutionService } from '../services/resolution/ResolutionService/ResolutionService.js';
import { StateService } from '../services/state/StateService/StateService.js';
import { StateFactory } from '../services/state/StateService/StateFactory.js';
import { StateEventService } from '../services/state/StateEventService/StateEventService.js';
import { FileSystemService } from '../services/fs/FileSystemService/FileSystemService.js';
import { ParserService } from '../services/pipeline/ParserService/ParserService.js';
import { InterpreterService } from '../services/pipeline/InterpreterService/InterpreterService.js';
import { DirectiveService } from '../services/pipeline/DirectiveService/DirectiveService.js';
import { PathService } from '../services/fs/PathService/PathService.js';
import { ProjectPathResolver } from '../services/fs/ProjectPathResolver.js';
import { ErrorDisplayService } from '../services/display/ErrorDisplayService/ErrorDisplayService.js';
import { ValidationService } from '../services/resolution/ValidationService/ValidationService.js';
import { CircularityService } from '../services/resolution/CircularityService/CircularityService.js';
import { StateTrackingService } from '../tests/utils/debug/StateTrackingService/StateTrackingService.js';
import { PathOperationsService } from '../services/fs/FileSystemService/PathOperationsService.js';
import { NodeFileSystem } from '../services/fs/FileSystemService/NodeFileSystem.js';
import { SourceMapService, sourceMapService } from '../core/utils/SourceMapService.js';
import { CLIService, DefaultPromptService } from '../services/cli/CLIService/CLIService.js';
import { 
  LoggerFactory, 
  logger as mainLogger, 
  stateLogger,
  parserLogger,
  interpreterLogger,
  filesystemLogger,
  validationLogger,
  outputLogger,
  pathLogger,
  directiveLogger,
  circularityLogger,
  resolutionLogger,
  importLogger,
  cliLogger,
  embedLogger
} from '../core/utils/logger.js';
import { Logger, fsLogger } from '../core/utils/simpleLogger.js';

/**
 * This file contains the configuration for dependency injection using tsyringe.
 * It must be imported at the entry point of the application before any other imports
 * that use dependency injection decorators.
 */

// Register all services that need explicit registration in the DI container
// This allows resolving services both by class and by string token

// ResolutionService
container.register('ResolutionService', { useClass: ResolutionService });
container.register('IResolutionService', { useToken: 'ResolutionService' });

// StateService ecosystem
container.register('StateService', { useClass: StateService });
container.register('IStateService', { useToken: 'StateService' });
container.register('StateFactory', { useClass: StateFactory });
container.register('StateEventService', { useClass: StateEventService });
container.register('IStateEventService', { useToken: 'StateEventService' });
container.register('StateTrackingService', { useClass: StateTrackingService });
container.register('IStateTrackingService', { useToken: 'StateTrackingService' });

// FileSystemService
container.register('FileSystemService', { useClass: FileSystemService });
container.register('IFileSystemService', { useToken: 'FileSystemService' });

// ParserService
container.register('ParserService', { useClass: ParserService });
container.register('IParserService', { useToken: 'ParserService' });

// InterpreterService
container.register('InterpreterService', { useClass: InterpreterService });
container.register('IInterpreterService', { useToken: 'InterpreterService' });

// DirectiveService
container.register('DirectiveService', { useClass: DirectiveService });
container.register('IDirectiveService', { useToken: 'DirectiveService' });

// PathService
container.register('PathService', { useClass: PathService });
container.register('IPathService', { useToken: 'PathService' });

// ErrorDisplayService
container.register('ErrorDisplayService', { useClass: ErrorDisplayService });
container.register('IErrorDisplayService', { useToken: 'ErrorDisplayService' });

// ValidationService
container.register('ValidationService', { useClass: ValidationService });
container.register('IValidationService', { useToken: 'ValidationService' });

// CircularityService
container.register('CircularityService', { useClass: CircularityService });
container.register('ICircularityService', { useToken: 'CircularityService' });

// ProjectPathResolver
container.register(ProjectPathResolver, { useClass: ProjectPathResolver });

// PathOperationsService
container.register('PathOperationsService', { useClass: PathOperationsService });
container.register('IPathOperationsService', { useToken: 'PathOperationsService' });

// NodeFileSystem
container.register('NodeFileSystem', { useClass: NodeFileSystem });
container.register('IFileSystem', { useToken: 'NodeFileSystem' });

// SourceMapService
container.register('SourceMapService', { useClass: SourceMapService });
container.register('ISourceMapService', { useToken: 'SourceMapService' });

// Logger Factory
container.register('LoggerFactory', { useClass: LoggerFactory });
container.register('ILoggerFactory', { useToken: 'LoggerFactory' });

// Main Winston Logger
container.register('MainLogger', { useValue: mainLogger });
container.register('ILogger', { useToken: 'MainLogger' });

// Service-specific Winston Loggers
container.register('StateLogger', { useValue: stateLogger });
container.register('ParserLogger', { useValue: parserLogger });
container.register('InterpreterLogger', { useValue: interpreterLogger });
container.register('FilesystemLogger', { useValue: filesystemLogger });
container.register('ValidationLogger', { useValue: validationLogger });
container.register('OutputLogger', { useValue: outputLogger });
container.register('PathLogger', { useValue: pathLogger });
container.register('DirectiveLogger', { useValue: directiveLogger });
container.register('CircularityLogger', { useValue: circularityLogger });
container.register('ResolutionLogger', { useValue: resolutionLogger });
container.register('ImportLogger', { useValue: importLogger });
container.register('CliLogger', { useValue: cliLogger });
container.register('EmbedLogger', { useValue: embedLogger });

// Simple logger
container.register('SimpleLogger', { useClass: Logger });
container.register('ISimpleLogger', { useToken: 'SimpleLogger' });
container.register('FSSimpleLogger', { useValue: fsLogger });

// CLIService
container.register('CLIService', { useClass: CLIService });
container.register('ICLIService', { useToken: 'CLIService' });

// DefaultPromptService
container.register('DefaultPromptService', { useClass: DefaultPromptService });
container.register('IPromptService', { useClass: DefaultPromptService });