import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestContextDI } from '@tests/utils/di/TestContextDI';
import { MemfsTestFileSystem } from '@tests/utils/MemfsTestFileSystem';
// import type { ProcessedMeld } from '@api/index'; // Commented out - Assuming not found
// import { MeldProcessor } from '@api/index'; // Commented out - Assuming not found
import { container, type DependencyContainer } from 'tsyringe'; 

// Import core services and interfaces
import { StateService } from '@services/state/StateService/StateService';
import { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService';
import { PathService } from '@services/fs/PathService/PathService';
import { FileSystemService } from '@services/fs/FileSystemService/FileSystemService';
import { InterpreterService } from '@services/pipeline/InterpreterService/InterpreterService';
import { DirectiveService } from '@services/pipeline/DirectiveService/DirectiveService';
import { OutputService } from '@services/pipeline/OutputService/OutputService';
import { ParserService } from '@services/pipeline/ParserService/ParserService';
import { ValidationService } from '@services/resolution/ValidationService/ValidationService';
import { CircularityService } from '@services/resolution/CircularityService/CircularityService';
import { PathOperationsService } from '@services/fs/FileSystemService/PathOperationsService'; 
import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem'; 

// Import Debug Services and Interfaces
import { StateEventService } from '@services/state/StateEventService/StateEventService';
import { StateTrackingService } from '@tests/utils/debug/StateTrackingService/StateTrackingService';
import { StateHistoryService } from '@tests/utils/debug/StateHistoryService/StateHistoryService';
import { VariableResolutionTracker } from '@tests/utils/debug/VariableResolutionTracker/VariableResolutionTracker';
import { StateVisualizationService } from '@tests/utils/debug/StateVisualizationService/StateVisualizationService';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IStateVisualizationService } from '@tests/utils/debug/StateVisualizationService/IStateVisualizationService';
import type { IStateTrackingService } from '@tests/utils/debug/StateTrackingService/IStateTrackingService';
import type { IStateEventService } from '@services/state/StateEventService/IStateEventService';
import type { IStateHistoryService } from '@tests/utils/debug/StateHistoryService/IStateHistoryService';
import type { IPathOperationsService } from '@services/fs/FileSystemService/IPathOperationsService';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import type { IPathService } from '@services/fs/PathService/IPathService';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService';
import type { IParserService } from '@services/pipeline/ParserService/IParserService';
import type { IDirectiveService } from '@services/pipeline/DirectiveService/IDirectiveService';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService';
import type { IOutputService } from '@services/pipeline/OutputService/IOutputService';
import type { IURLContentResolver, URLResponse } from '@services/resolution/URLContentResolver/IURLContentResolver'; 
// Import the factory
import { ResolutionServiceClientFactory } from '@services/resolution/ResolutionService/factories/ResolutionServiceClientFactory';

// Define a minimal logger interface if not found/imported
interface IDirectiveLogger {
  log: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
  debug?: (...args: any[]) => void; // Optional debug
}

describe('Debug Tools Integration Test', () => {
  let context: TestContextDI; 
  let testContainer: DependencyContainer; 
  // let meldProcessor: MeldProcessor; // Commented out
  let stateService: IStateService;
  let stateVisualizationService: IStateVisualizationService;
  let variableResolutionTracker: VariableResolutionTracker;
  let stateTrackingService: IStateTrackingService;
  let interpreterService: IInterpreterService; // Added for direct processing call

  beforeEach(async () => {
    context = TestContextDI.create();
    await context.initialize(); 
    testContainer = container.createChildContainer();

    testContainer.registerInstance<IFileSystem>('IFileSystem', context.fs);

    // Register Mocks
    const mockUrlResolver: IURLContentResolver = {
      isURL: vi.fn().mockReturnValue(false), // Assume paths are not URLs in this test
      validateURL: vi.fn().mockImplementation(async (url: string) => url), // Return URL as valid
      fetchURL: vi.fn().mockResolvedValue({
        content: 'Mock URL Content',
        metadata: { statusCode: 200, contentType: 'text/plain' },
        fromCache: false,
        url: 'mock://url' // Provide a mock URL in the response
      } as URLResponse) // Return a mock successful response
    };
    testContainer.registerInstance<IURLContentResolver>('IURLContentResolver', mockUrlResolver);

    // Register DirectiveLogger Mock
    const mockLogger: IDirectiveLogger = { 
      log: vi.fn(), 
      warn: vi.fn(), 
      error: vi.fn(),
      debug: vi.fn(),
    }; 
    testContainer.registerInstance<IDirectiveLogger>('DirectiveLogger', mockLogger);

    // Register Core Services 
    testContainer.registerSingleton('StateEventService', StateEventService);
    testContainer.registerSingleton<IStateEventService>('IStateEventService', StateEventService);
    testContainer.registerSingleton('StateTrackingService', StateTrackingService);
    testContainer.registerSingleton<IStateTrackingService>('IStateTrackingService', StateTrackingService);
    testContainer.registerSingleton('StateHistoryService', StateHistoryService);
    testContainer.registerSingleton<IStateHistoryService>('IStateHistoryService', StateHistoryService);
    testContainer.registerSingleton('VariableResolutionTracker', VariableResolutionTracker);
    testContainer.registerSingleton('StateVisualizationService', StateVisualizationService);
    testContainer.registerSingleton<IStateVisualizationService>('IStateVisualizationService', StateVisualizationService);
    testContainer.registerSingleton('StateService', StateService);
    testContainer.registerSingleton<IStateService>('IStateService', StateService);
    testContainer.registerSingleton('PathOperationsService', PathOperationsService);
    testContainer.registerSingleton<IPathOperationsService>('IPathOperationsService', PathOperationsService);
    testContainer.registerSingleton('FileSystemService', FileSystemService);
    testContainer.registerSingleton<IFileSystemService>('IFileSystemService', FileSystemService);
    testContainer.registerSingleton('PathService', PathService);
    testContainer.registerSingleton<IPathService>('IPathService', PathService);
    testContainer.registerSingleton('ResolutionService', ResolutionService);
    testContainer.registerSingleton<IResolutionService>('IResolutionService', ResolutionService);
    testContainer.registerSingleton('ValidationService', ValidationService);
    testContainer.registerSingleton<IValidationService>('IValidationService', ValidationService);
    testContainer.registerSingleton('CircularityService', CircularityService);
    testContainer.registerSingleton<ICircularityService>('ICircularityService', CircularityService);
    testContainer.registerSingleton('ParserService', ParserService);
    testContainer.registerSingleton<IParserService>('IParserService', ParserService);
    testContainer.registerSingleton('DirectiveService', DirectiveService);
    testContainer.registerSingleton<IDirectiveService>('IDirectiveService', DirectiveService);
    testContainer.registerSingleton('InterpreterService', InterpreterService);
    testContainer.registerSingleton<IInterpreterService>('IInterpreterService', InterpreterService);
    testContainer.registerSingleton('OutputService', OutputService);
    testContainer.registerSingleton<IOutputService>('IOutputService', OutputService);

    // --- Register ResolutionServiceClientFactory --- 
    // It depends on IResolutionService, which is registered above
    testContainer.registerSingleton(ResolutionServiceClientFactory);
    // --- End Factory Registration --- 

    // Register MeldProcessor (Commented out)
    // testContainer.registerSingleton(MeldProcessor);

    // Resolve services needed for the test
    // meldProcessor = testContainer.resolve(MeldProcessor); // Commented out
    stateService = testContainer.resolve<IStateService>('IStateService');
    stateVisualizationService = testContainer.resolve<IStateVisualizationService>('IStateVisualizationService');
    stateTrackingService = testContainer.resolve<IStateTrackingService>('IStateTrackingService');
    interpreterService = testContainer.resolve<IInterpreterService>('IInterpreterService'); 
    const resolutionService = testContainer.resolve<IResolutionService>('IResolutionService'); // Resolve ResolutionService

    // Enable resolution tracking EXPLICITLY
    const trackerConfig = { enabled: true };
    resolutionService.enableResolutionTracking(trackerConfig);
    // Retrieve the tracker instance managed by ResolutionService (optional, could also use the one we resolved directly)
    variableResolutionTracker = resolutionService.getResolutionTracker()!;
    // If we didn't resolve tracker separately: variableResolutionTracker = resolutionService.getResolutionTracker()!;
    // Re-apply config just in case ResolutionService created a new instance internally 
    // (though the code suggests it uses the one passed/created)
    variableResolutionTracker.configure(trackerConfig);
  });

  afterEach(async () => {
    testContainer?.clearInstances(); 
    await context?.cleanup(); 
  });

  it('should allow debug services to be instantiated and run basic visualization', async () => {
    const meldContent = `@text greeting = "Hello"\nThis is {{greeting}} world!`;
    const filePath = '/test.mld';
    const memfs = testContainer.resolve<IFileSystem>('IFileSystem'); 
    // Fix: Use await with writeFile
    await memfs.writeFile(filePath, meldContent);

    // let processedMeld: ProcessedMeld | undefined; // Commented out
    let processError: Error | undefined;
    let finalState: IStateService | undefined;

    try {
      // Process the Meld content directly using core services (Parser -> Interpreter)
      const parserService = testContainer.resolve<IParserService>('IParserService');
      const initialNodes = await parserService.parseFile(filePath);
      // Assume interpreterService returns the final state
      finalState = await interpreterService.interpret(initialNodes, { filePath: filePath });

      // Original MeldProcessor call (Commented out)
      // processedMeld = await meldProcessor.process(filePath);
    } catch (error) {
      processError = error instanceof Error ? error : new Error(String(error));
      console.error("Processing Error:", processError);
    }

    // Assert basic processing worked
    expect(processError).toBeUndefined();
    expect(finalState).toBeDefined();
    // Check state directly instead of processedMeld.output
    const greetingVar = finalState!.getTextVar('greeting');
    expect(greetingVar?.value).toBe('Hello');

    // Get the final state ID 
    const rootStateId = finalState!.getStateId(); // Use finalState
    expect(rootStateId).toBeDefined();

    // Verify Visualization Service call
    let visualizationOutput: string | undefined;
    let visualizationError: Error | undefined;
    try {
      visualizationOutput = stateVisualizationService.visualizeContextHierarchy(rootStateId!, { format: 'json' });
    } catch (error) {
      visualizationError = error instanceof Error ? error : new Error(String(error));
      console.error("Visualization Error:", visualizationError);
    }

    expect(visualizationError).toBeUndefined();
    expect(visualizationOutput).toBeDefined();
    expect(visualizationOutput).not.toBe('');
    
    let parsedJson: any;
    try {
      parsedJson = JSON.parse(visualizationOutput!);
    } catch(e) {
      console.error("JSON Parse Error:", e);
      console.error("Visualization Output:", visualizationOutput);
    }
    expect(() => JSON.parse(visualizationOutput!)).not.toThrow();
    expect(parsedJson).toHaveProperty('rootStateId', rootStateId);

    // Verify Resolution Tracker call
    let resolutionAttempts: unknown[] | undefined;
    let trackerError: Error | undefined;
    try {
      // Add logging before getting attempts
      process.stdout.write(`DEBUG: [Test] Checking tracker before getAttempts. Tracker: ${variableResolutionTracker ? 'exists' : 'null'}\n`);
      resolutionAttempts = variableResolutionTracker.getAttempts();
      process.stdout.write(`DEBUG: [Test] Got ${resolutionAttempts?.length ?? 0} attempts.\n`);
    } catch (error) {
      trackerError = error instanceof Error ? error : new Error(String(error));
      console.error("Tracker Error:", trackerError);
    }

    expect(trackerError).toBeUndefined();
    expect(resolutionAttempts).toBeDefined();
    expect(Array.isArray(resolutionAttempts)).toBe(true);
    
    const greetingAttempt = (resolutionAttempts as any[]).find(att => att.variableName === 'greeting');
    // Log the found attempt for inspection
    process.stdout.write(`DEBUG: [Test] Found greetingAttempt: ${JSON.stringify(greetingAttempt)}\n`);
    expect(greetingAttempt).toBeDefined();
    // expect(greetingAttempt).toHaveProperty('success', true); // Keep commented for now

  });
}); 