import 'reflect-metadata';
import { container } from 'tsyringe';

// Import all service classes
import { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService';
import { StateService } from '@services/state/StateService/StateService';
import { StateFactory } from '@services/state/StateService/StateFactory';
import { StateEventService } from '@services/state/StateEventService/StateEventService';
import { FileSystemService } from '@services/fs/FileSystemService/FileSystemService';
import { ParserService } from '@services/pipeline/ParserService/ParserService';
import { InterpreterService } from '@services/pipeline/InterpreterService/InterpreterService';
import { DirectiveService } from '@services/pipeline/DirectiveService/DirectiveService';
import { PathService } from '@services/fs/PathService/PathService';
import { ProjectPathResolver } from '@services/fs/ProjectPathResolver';
import { ErrorDisplayService } from '@services/display/ErrorDisplayService/ErrorDisplayService';
import { ValidationService } from '@services/resolution/ValidationService/ValidationService';
import { CircularityService } from '@services/resolution/CircularityService/CircularityService';
import { URLContentResolver } from '@services/resolution/URLContentResolver/URLContentResolver';
import { PathOperationsService } from '@services/fs/FileSystemService/PathOperationsService';
import { NodeFileSystem } from '@services/fs/FileSystemService/NodeFileSystem';
import { SourceMapService } from '@core/utils/SourceMapService';
import { CLIService, DefaultPromptService } from '@services/cli/CLIService/CLIService';
import { PathServiceClientFactory } from '@services/fs/PathService/factories/PathServiceClientFactory';
import { FileSystemServiceClientFactory } from '@services/fs/FileSystemService/factories/FileSystemServiceClientFactory';
import { ParserServiceClientFactory } from '@services/pipeline/ParserService/factories/ParserServiceClientFactory';
import { ResolutionServiceClientFactory } from '@services/resolution/ResolutionService/factories/ResolutionServiceClientFactory';
import { VariableReferenceResolverClientFactory } from '@services/resolution/ResolutionService/factories/VariableReferenceResolverClientFactory';
import { VariableReferenceResolverFactory } from '@services/resolution/ResolutionService/factories/VariableReferenceResolverFactory';
import { DirectiveServiceClientFactory } from '@services/pipeline/DirectiveService/factories/DirectiveServiceClientFactory';
import { ResolutionServiceClientForDirectiveFactory } from '@services/resolution/ResolutionService/factories/ResolutionServiceClientForDirectiveFactory';
import { StateServiceClientFactory } from '@services/state/StateService/factories/StateServiceClientFactory';
import { StateTrackingServiceClientFactory } from '@services/state/StateTrackingService/factories/StateTrackingServiceClientFactory';
import { InterpreterServiceClientFactory } from '@services/pipeline/InterpreterService/factories/InterpreterServiceClientFactory';
import { 
  LoggerFactory, 
  logger as mainLogger, 
  // ... other loggers ...
} from '@core/utils/logger';

// Import AST factory classes (temporarily from old location)
import { NodeFactory } from '@core/syntax/types-old/factories/NodeFactory';
import { VariableNodeFactory } from '@core/syntax/types-old/factories/VariableNodeFactory';
import { DirectiveNodeFactory } from '@core/syntax/types-old/factories/DirectiveNodeFactory';
// ... other AST factories ...

// Import Directive Handlers
import { TextDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/TextDirectiveHandler';
import { DataDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/DataDirectiveHandler';
import { PathDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/PathDirectiveHandler';
import { ExecDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/ExecDirectiveHandler';
import { RunDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler';
import { AddDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/AddDirectiveHandler';
import { ImportDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler';

// Import IFileSystem type
import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem';

// --- Standard Container Registrations ---

// Register File System Implementation (used via IFileSystem token)
container.registerInstance('IFileSystem', new NodeFileSystem()); // REVERTED: Back to instance registration
// container.registerSingleton<IFileSystem>('IFileSystem', NodeFileSystem); // REMOVED: Singleton registration

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

container.register(StateService, { useClass: StateService });
container.register('IStateService', { useToken: StateService }); // Use Class as token

container.register(ResolutionService, { useClass: ResolutionService });
container.register('IResolutionService', { useToken: ResolutionService }); // Use Class as token

// Register Client Factories (these break circular dependencies)
container.register(PathServiceClientFactory, { useClass: PathServiceClientFactory });
container.register(FileSystemServiceClientFactory, { useClass: FileSystemServiceClientFactory });
container.register(ParserServiceClientFactory, { useClass: ParserServiceClientFactory });
container.register(ResolutionServiceClientFactory, { useClass: ResolutionServiceClientFactory });
container.registerSingleton(VariableReferenceResolverClientFactory, VariableReferenceResolverClientFactory);
container.registerSingleton(VariableReferenceResolverFactory);
container.register(DirectiveServiceClientFactory, { useClass: DirectiveServiceClientFactory });
container.register(ResolutionServiceClientForDirectiveFactory, { useClass: ResolutionServiceClientForDirectiveFactory });
container.register(StateServiceClientFactory, { useClass: StateServiceClientFactory });
// <<< Comment out problematic factory registration >>>
// container.register(StateTrackingServiceClientFactory, { useClass: StateTrackingServiceClientFactory }); 
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

// --- Register Directive Handlers for @injectAll ---
container.register('IDirectiveHandler', { useClass: TextDirectiveHandler });
container.register('IDirectiveHandler', { useClass: DataDirectiveHandler });
container.register('IDirectiveHandler', { useClass: PathDirectiveHandler });
container.register('IDirectiveHandler', { useClass: ExecDirectiveHandler });
container.register('IDirectiveHandler', { useClass: RunDirectiveHandler });
container.register('IDirectiveHandler', { useClass: AddDirectiveHandler });
container.register('IDirectiveHandler', { useClass: ImportDirectiveHandler });
