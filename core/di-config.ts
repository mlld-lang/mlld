import 'reflect-metadata';
import { container } from 'tsyringe';

// Import all service classes that need explicit registration
import { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService.js';
import { StateService } from '@services/state/StateService/StateService.js';
import { StateFactory } from '@services/state/StateService/StateFactory.js';
import { StateEventService } from '@services/state/StateEventService/StateEventService.js';
import { FileSystemService } from '@services/fs/FileSystemService/FileSystemService.js';
import { ParserService } from '@services/pipeline/ParserService/ParserService.js';
import { InterpreterService } from '@services/pipeline/InterpreterService/InterpreterService.js';
import { DirectiveService } from '@services/pipeline/DirectiveService/DirectiveService.js';
import { PathService } from '@services/fs/PathService/PathService.js';
import { ProjectPathResolver } from '@services/fs/ProjectPathResolver.js';
import { ErrorDisplayService } from '@services/display/ErrorDisplayService/ErrorDisplayService.js';
import { ValidationService } from '@services/resolution/ValidationService/ValidationService.js';
import { CircularityService } from '@services/resolution/CircularityService/CircularityService.js';
import { StateTrackingService } from '@tests/utils/debug/StateTrackingService/StateTrackingService.js';
import { PathOperationsService } from '@services/fs/FileSystemService/PathOperationsService.js';
import { NodeFileSystem } from '@services/fs/FileSystemService/NodeFileSystem.js';
import { SourceMapService, sourceMapService } from '@core/utils/SourceMapService.js';
import { CLIService, DefaultPromptService } from '@services/cli/CLIService/CLIService.js';
import { PathServiceClientFactory } from '@services/fs/PathService/factories/PathServiceClientFactory.js';
import { FileSystemServiceClientFactory } from '@services/fs/FileSystemService/factories/FileSystemServiceClientFactory.js';
import { ParserServiceClientFactory } from '@services/pipeline/ParserService/factories/ParserServiceClientFactory.js';
import { ResolutionServiceClientFactory } from '@services/resolution/ResolutionService/factories/ResolutionServiceClientFactory.js';
import { VariableReferenceResolverClientFactory } from '@services/resolution/ResolutionService/factories/VariableReferenceResolverClientFactory.js';
import { VariableReferenceResolverFactory } from '@services/resolution/ResolutionService/factories/VariableReferenceResolverFactory.js';
import { DirectiveServiceClientFactory } from '@services/pipeline/DirectiveService/factories/DirectiveServiceClientFactory.js';
import { ResolutionServiceClientForDirectiveFactory } from '@services/resolution/ResolutionService/factories/ResolutionServiceClientForDirectiveFactory.js';
import { StateServiceClientFactory } from '@services/state/StateService/factories/StateServiceClientFactory.js';
import { StateTrackingServiceClientFactory } from '@services/state/StateTrackingService/factories/StateTrackingServiceClientFactory.js';
import { InterpreterServiceClientFactory } from '@services/pipeline/InterpreterService/factories/InterpreterServiceClientFactory.js';
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
} from '@core/utils/logger.js';

// Import AST factory classes
import { NodeFactory } from '@core/syntax/types/factories/NodeFactory.js';
import { VariableNodeFactory } from '@core/syntax/types/factories/VariableNodeFactory.js';
import { DirectiveNodeFactory } from '@core/syntax/types/factories/DirectiveNodeFactory.js';
import { TextNodeFactory } from '@core/syntax/types/factories/TextNodeFactory.js';
import { CodeFenceNodeFactory } from '@core/syntax/types/factories/CodeFenceNodeFactory.js';
import { CommentNodeFactory } from '@core/syntax/types/factories/CommentNodeFactory.js';
import { ErrorNodeFactory } from '@core/syntax/types/factories/ErrorNodeFactory.js';
import { Logger, fsLogger } from '@core/utils/simpleLogger.js';

/**
 * This file contains the configuration for dependency injection using tsyringe.
 * It must be imported at the entry point of the application before any other imports
 * that use dependency injection decorators.
 */

// Create minimal instances of core services with circular dependencies first
const pathOps = new PathOperationsService();
const nodeFileSystem = new NodeFileSystem();
const projectPathResolver = new ProjectPathResolver();

// Register the nodeFileSystem instance as IFileSystem
container.registerInstance('IFileSystem', nodeFileSystem);
container.registerInstance('NodeFileSystem', nodeFileSystem);

// Create PathService first
const pathService = new PathService(projectPathResolver);
// Put PathService in test mode for debugging
pathService.setTestMode(true);

// Register PathService
container.registerInstance('PathService', pathService);
container.registerInstance('IPathService', pathService);

// Create PathServiceClientFactory
const pathServiceClientFactory = new PathServiceClientFactory(pathService);
container.registerInstance('PathServiceClientFactory', pathServiceClientFactory);

// Now create FileSystemService with all dependencies
const fileSystemService = new FileSystemService(pathOps, nodeFileSystem, pathServiceClientFactory);
container.registerInstance('FileSystemService', fileSystemService);
container.registerInstance('IFileSystemService', fileSystemService);

// Create FileSystemServiceClientFactory
const fileSystemServiceClientFactory = new FileSystemServiceClientFactory(fileSystemService);
container.registerInstance('FileSystemServiceClientFactory', fileSystemServiceClientFactory);

// Manually inject FileSystemServiceClientFactory into PathService
pathService["fsClientFactory"] = fileSystemServiceClientFactory;
pathService["factoryInitialized"] = true;

// Manually inject PathServiceClient into FileSystemService
fileSystemService["pathClient"] = pathServiceClientFactory.createClient();
fileSystemService["factoryInitialized"] = true;

const parserService = new ParserService();

// Create StateService with early initialization
// This is needed because ResolutionService depends on StateService
const stateFactory = new StateFactory();
container.registerInstance(StateFactory, stateFactory);
const stateEventService = new StateEventService();
const stateTrackingService = new StateTrackingService();
const stateTrackingServiceClientFactory = new StateTrackingServiceClientFactory(stateTrackingService);
container.registerInstance('StateTrackingServiceClientFactory', stateTrackingServiceClientFactory);
const stateService = new StateService(stateFactory, stateEventService, stateTrackingServiceClientFactory);

// Create the ResolutionService with the StateService dependency
const resolutionService = new ResolutionService(stateService, fileSystemService, pathService);

// Register instances of services with circular dependencies
container.registerInstance('PathService', pathService);
container.registerInstance('IPathService', pathService);
container.registerInstance('ParserService', parserService);
container.registerInstance('IParserService', parserService);
container.registerInstance('ResolutionService', resolutionService);
container.registerInstance('IResolutionService', resolutionService);
container.registerInstance('StateService', stateService);
container.registerInstance('IStateService', stateService);

// Register client factories for circular dependency resolution
container.register('PathServiceClientFactory', { useClass: PathServiceClientFactory });
container.register('ParserServiceClientFactory', { useClass: ParserServiceClientFactory });
container.register('ResolutionServiceClientFactory', { useClass: ResolutionServiceClientFactory });
container.register('VariableReferenceResolverClientFactory', { useClass: VariableReferenceResolverClientFactory });
container.register('VariableReferenceResolverFactory', { useClass: VariableReferenceResolverFactory });

// Register AST factory classes
container.register(NodeFactory, { useClass: NodeFactory });
container.register(VariableNodeFactory, { useClass: VariableNodeFactory });
container.register(DirectiveNodeFactory, { useClass: DirectiveNodeFactory });
container.register(TextNodeFactory, { useClass: TextNodeFactory });
container.register(CodeFenceNodeFactory, { useClass: CodeFenceNodeFactory });
container.register(CommentNodeFactory, { useClass: CommentNodeFactory });
container.register(ErrorNodeFactory, { useClass: ErrorNodeFactory });
container.register('DirectiveServiceClientFactory', { useClass: DirectiveServiceClientFactory });
container.register('ResolutionServiceClientForDirectiveFactory', { useClass: ResolutionServiceClientForDirectiveFactory });
container.register('StateServiceClientFactory', { useClass: StateServiceClientFactory });
container.register('StateTrackingServiceClientFactory', { useClass: StateTrackingServiceClientFactory });
container.register('InterpreterServiceClientFactory', { useClass: InterpreterServiceClientFactory });

// Register remaining services using class registrations
// These services don't have circular dependencies

// StateService ecosystem (other components)
container.register('StateFactory', { useClass: StateFactory });
container.register('StateEventService', { useClass: StateEventService });
container.register('IStateEventService', { useToken: 'StateEventService' });
container.register('StateTrackingService', { useClass: StateTrackingService });
container.register('IStateTrackingService', { useToken: 'StateTrackingService' });

// InterpreterService
container.register('InterpreterService', { useClass: InterpreterService });
container.register('IInterpreterService', { useToken: 'InterpreterService' });

// DirectiveService
container.register('DirectiveService', { useClass: DirectiveService });
container.register('IDirectiveService', { useToken: 'DirectiveService' });

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