import 'reflect-metadata';
import { container } from 'tsyringe';

// Import all service classes
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
import { URLContentResolver } from '@services/resolution/URLContentResolver/URLContentResolver.js';
import { StateTrackingService } from '@tests/utils/debug/StateTrackingService/StateTrackingService.js';
import { PathOperationsService } from '@services/fs/FileSystemService/PathOperationsService.js';
import { NodeFileSystem } from '@services/fs/FileSystemService/NodeFileSystem.js';
import { SourceMapService } from '@core/utils/SourceMapService.js';
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
  // ... other loggers ...
} from '@core/utils/logger.js';

// Import AST factory classes
import { NodeFactory } from '@core/syntax/types/factories/NodeFactory.js';
import { VariableNodeFactory } from '@core/syntax/types/factories/VariableNodeFactory.js';
import { DirectiveNodeFactory } from '@core/syntax/types/factories/DirectiveNodeFactory.js';
// ... other AST factories ...

// --- Standard Container Registrations ---

// Register File System Implementation (used via IFileSystem token)
container.registerInstance('IFileSystem', new NodeFileSystem()); // Can keep instance for NodeFileSystem

// Register Core Services (using standard class registration)
container.register(PathOperationsService, { useClass: PathOperationsService });
container.register('IPathOperationsService', { useToken: PathOperationsService }); // Use Class as token

container.register(ProjectPathResolver, { useClass: ProjectPathResolver });
// No interface token needed if injected via class type

container.register(URLContentResolver, { useClass: URLContentResolver });
container.register('IURLContentResolver', { useToken: URLContentResolver }); // Use Class as token

container.register(PathService, { useClass: PathService });
container.register('IPathService', { useToken: PathService }); // Use Class as token

container.register(FileSystemService, { useClass: FileSystemService });
container.register('IFileSystemService', { useToken: FileSystemService }); // Use Class as token

container.register(ParserService, { useClass: ParserService });
container.register('IParserService', { useToken: ParserService }); // Use Class as token

container.register(StateFactory, { useClass: StateFactory });
// No interface token needed if injected via class type

container.register(StateEventService, { useClass: StateEventService });
container.register('IStateEventService', { useToken: StateEventService }); // Use Class as token

container.register(StateTrackingService, { useClass: StateTrackingService });
container.register('IStateTrackingService', { useToken: StateTrackingService }); // Use Class as token

container.register(StateService, { useClass: StateService });
container.register('IStateService', { useToken: StateService }); // Use Class as token

container.register(ResolutionService, { useClass: ResolutionService });
container.register('IResolutionService', { useToken: ResolutionService }); // Use Class as token

// Register Client Factories (these break circular dependencies)
container.register(PathServiceClientFactory, { useClass: PathServiceClientFactory });
container.register(FileSystemServiceClientFactory, { useClass: FileSystemServiceClientFactory });
container.register(ParserServiceClientFactory, { useClass: ParserServiceClientFactory });
container.register(ResolutionServiceClientFactory, { useClass: ResolutionServiceClientFactory });
container.register(VariableReferenceResolverClientFactory, { useClass: VariableReferenceResolverClientFactory });
container.register(VariableReferenceResolverFactory, { useClass: VariableReferenceResolverFactory });
container.register(DirectiveServiceClientFactory, { useClass: DirectiveServiceClientFactory });
container.register(ResolutionServiceClientForDirectiveFactory, { useClass: ResolutionServiceClientForDirectiveFactory });
container.register(StateServiceClientFactory, { useClass: StateServiceClientFactory });
container.register(StateTrackingServiceClientFactory, { useClass: StateTrackingServiceClientFactory });
container.register(InterpreterServiceClientFactory, { useClass: InterpreterServiceClientFactory });

// Register AST factory classes
container.register(NodeFactory, { useClass: NodeFactory });
container.register(VariableNodeFactory, { useClass: VariableNodeFactory });
container.register(DirectiveNodeFactory, { useClass: DirectiveNodeFactory });
// ... (rest of AST factories) ...

// Register other services
container.register(InterpreterService, { useClass: InterpreterService });
container.register('IInterpreterService', { useToken: InterpreterService }); // Use Class as token

container.register(DirectiveService, { useClass: DirectiveService });
container.register('IDirectiveService', { useToken: DirectiveService }); // Use Class as token

container.register(ErrorDisplayService, { useClass: ErrorDisplayService });
container.register('IErrorDisplayService', { useToken: ErrorDisplayService }); // Use Class as token

container.register(ValidationService, { useClass: ValidationService });
container.register('IValidationService', { useToken: ValidationService }); // Use Class as token

container.register(CircularityService, { useClass: CircularityService });
container.register('ICircularityService', { useToken: CircularityService }); // Use Class as token

container.register(SourceMapService, { useClass: SourceMapService });
container.register('ISourceMapService', { useToken: SourceMapService }); // Use Class as token

// Register Loggers
container.register(LoggerFactory, { useClass: LoggerFactory });
container.register('ILoggerFactory', { useToken: LoggerFactory }); // Use Class as token
container.register('MainLogger', { useValue: mainLogger });
container.register('ILogger', { useToken: 'MainLogger' });
// ... register other specific loggers using useValue ...

// Register CLI Services
container.register(CLIService, { useClass: CLIService });
container.register('ICLIService', { useToken: CLIService }); // Use Class as token
container.register(DefaultPromptService, { useClass: DefaultPromptService });
container.register('IPromptService', { useToken: DefaultPromptService }); // Use Class as token
