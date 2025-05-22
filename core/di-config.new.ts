import 'reflect-metadata';
import { container } from 'tsyringe';
import { StateService } from '@services/state/StateService/StateService';
import { StateServiceAdapter } from '@services/state/StateService/StateServiceAdapter';
import { DirectiveService } from '@services/pipeline/DirectiveService/DirectiveService.new';
import { HandlerRegistry } from '@services/pipeline/DirectiveService/HandlerRegistry.new';

// Import other required services (keep existing ones)
import { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService';
import { PathService } from '@services/fs/PathService/PathService';
import { FileSystemService } from '@services/fs/FileSystemService/FileSystemService';
import { ParserService } from '@services/pipeline/ParserService/ParserService';
import { InterpreterService } from '@services/pipeline/InterpreterService/InterpreterService.new';
import { OutputService } from '@services/pipeline/OutputService/OutputService';
import { ValidationService } from '@services/resolution/ValidationService/ValidationService';
import { CircularityService } from '@services/resolution/CircularityService/CircularityService';
import { URLContentResolver } from '@services/resolution/URLContentResolver/URLContentResolver';
import { StateEventService } from '@services/state/StateEventService/StateEventService';
import { PathOperationsService } from '@services/fs/FileSystemService/PathOperationsService';
import { NodeFileSystem } from '@services/fs/FileSystemService/NodeFileSystem';
import { DirectiveServiceClientFactory } from '@services/pipeline/DirectiveService/factories/DirectiveServiceClientFactory';
import { ParserServiceClientFactory } from '@services/pipeline/ParserService/factories/ParserServiceClientFactory';
import { simpleLogger } from '@core/utils/simpleLogger';

/**
 * Configure the DI container with new minimal services
 */
export function configureDIContainer(): void {
  // Register logger
  container.register('ILogger', { useValue: simpleLogger });
  container.register('MainLogger', { useValue: simpleLogger });
  
  // Register StateService with adapter for now (until all services are migrated)
  container.register(StateService, { useClass: StateServiceAdapter });
  container.register('IStateService', { useClass: StateServiceAdapter });
  
  // Register file system services
  container.register(NodeFileSystem, { useClass: NodeFileSystem });
  container.register('IFileSystem', { useToken: NodeFileSystem });
  container.register(PathOperationsService, { useClass: PathOperationsService });
  container.register('IPathOperationsService', { useToken: PathOperationsService });
  container.register(FileSystemService, { useClass: FileSystemService });
  container.register('IFileSystemService', { useToken: FileSystemService });
  container.register(PathService, { useClass: PathService });
  container.register('IPathService', { useToken: PathService });
  
  // Register resolution services
  container.register(ResolutionService, { useClass: ResolutionService });
  container.register('IResolutionService', { useToken: ResolutionService });
  container.register(ValidationService, { useClass: ValidationService });
  container.register('IValidationService', { useToken: ValidationService });
  container.register(CircularityService, { useClass: CircularityService });
  container.register('ICircularityService', { useToken: CircularityService });
  container.register(URLContentResolver, { useClass: URLContentResolver });
  container.register('IURLContentResolver', { useToken: URLContentResolver });
  
  // Register state services
  container.register(StateEventService, { useClass: StateEventService });
  container.register('IStateEventService', { useToken: StateEventService });
  
  // Register pipeline services
  container.register(ParserService, { useClass: ParserService });
  container.register('IParserService', { useToken: ParserService });
  container.register(InterpreterService, { useClass: InterpreterService });
  container.register('IInterpreterService', { useToken: InterpreterService });
  container.register(OutputService, { useClass: OutputService });
  container.register('IOutputService', { useToken: OutputService });
  
  // Register new DirectiveService and handlers
  container.register(DirectiveService, { useClass: DirectiveService });
  container.register('IDirectiveService', { useClass: DirectiveService });
  
  // Register all directive handlers
  HandlerRegistry.registerWithContainer(container);
  
  // Register factories
  container.register(DirectiveServiceClientFactory, { useClass: DirectiveServiceClientFactory });
  container.register('DirectiveServiceClientFactory', { useToken: DirectiveServiceClientFactory });
  container.register(ParserServiceClientFactory, { useClass: ParserServiceClientFactory });
  container.register('ParserServiceClientFactory', { useToken: ParserServiceClientFactory });
  
  // Register container itself for services that need it
  container.register('DependencyContainer', { useValue: container });
}

// Initialize container
configureDIContainer();

export { container };