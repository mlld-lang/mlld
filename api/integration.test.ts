import 'reflect-metadata'; // Ensure this is the very first import
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestContextDI } from '@tests/utils/di/TestContextDI';
import type { ProcessOptions, Services } from '@core/types/index';
import { VariableType } from '@core/types/variables';
import { MeldFileNotFoundError } from '@core/errors/MeldFileNotFoundError';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError';
import * as path from 'path';
import { TestDebuggerService } from '@tests/utils/debug/TestDebuggerService';
import { SyntaxExample } from '@core/syntax/helpers/index';
import {
  textDirectiveExamples,
  dataDirectiveExamples,
  importDirectiveExamples,
  defineDirectiveExamples,
  embedDirectiveExamples,
  pathDirectiveExamples,
  createNodeFromExample
} from '@core/syntax/index';
// Import run examples directly
import runDirectiveExamplesModule from '@core/syntax/run';
// Add imports for core services needed
import { ParserService } from '@services/pipeline/ParserService/ParserService';
import type { IParserService } from '@services/pipeline/ParserService/IParserService';
import { InterpreterService } from '@services/pipeline/InterpreterService/InterpreterService';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService';
import { StateService } from '@services/state/StateService/StateService';
import type { IStateService } from '@services/state/StateService/IStateService';
import { OutputService } from '@services/pipeline/OutputService/OutputService';
import type { IOutputService } from '@services/pipeline/OutputService/IOutputService';
import { FileSystemService } from '@services/fs/FileSystemService/FileSystemService';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import { PathService } from '@services/fs/PathService/PathService';
import type { IPathService } from '@services/fs/PathService/IPathService';
import { unsafeCreateValidatedResourcePath, PathValidationContext, NormalizedAbsoluteDirectoryPath, createMeldPath, unsafeCreateNormalizedAbsoluteDirectoryPath } from '@core/types/paths';
import type { NodeFileSystem } from '@services/fs/FileSystemService/NodeFileSystem';
import type { MeldNode, DirectiveNode } from '@core/syntax/types/index';
import { processMeld } from '@api/index';
// === Manual DI Imports ===
import { container, type DependencyContainer } from 'tsyringe';
import { mock } from 'vitest-mock-extended';
import { URL } from 'node:url';
import { DirectiveServiceClientFactory } from '@services/pipeline/DirectiveService/factories/DirectiveServiceClientFactory';
import { InterpreterServiceClientFactory } from '@services/pipeline/InterpreterService/factories/InterpreterServiceClientFactory';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import { ParserServiceClientFactory } from '@services/pipeline/ParserService/factories/ParserServiceClientFactory';
import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem';
import type { ILogger } from '@core/utils/logger';
import { FileSystemServiceClientFactory } from '@services/fs/FileSystemService/factories/FileSystemServiceClientFactory';
// Import PathOperationsService for registration
import { PathOperationsService } from '@services/fs/FileSystemService/PathOperationsService';
import { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService';
// <<< Add import for CircularityService >>>
import { CircularityService } from '@services/resolution/CircularityService/CircularityService';
// <<< ADDED: Import ValidationService >>>
import { ValidationService } from '@services/resolution/ValidationService/ValidationService';
// Import the default logger instance
import logger from '@core/utils/logger'; 
// <<< ADDED: Import DirectiveService >>>
import { DirectiveService } from '@services/pipeline/DirectiveService/DirectiveService';
// <<< CORRECTED: Import StateTrackingService from debug utils >>>
import { StateTrackingService } from '@tests/utils/debug/StateTrackingService/StateTrackingService';
// <<< ADDED: Import VariableReferenceResolverClientFactory >>>
import { VariableReferenceResolverClientFactory } from '@services/resolution/ResolutionService/factories/VariableReferenceResolverClientFactory'; // Corrected path
import { VariableReferenceResolver } from '@services/resolution/ResolutionService/resolvers/VariableReferenceResolver'; // <<< ADD IMPORT for manual instantiation
import { VariableReferenceResolverFactory } from '@services/resolution/ResolutionService/factories/VariableReferenceResolverFactory';

// =========================

// Define run examples directly
const runDirectiveExamples = runDirectiveExamplesModule;

// Type guard function
function isDirectiveNode(node: MeldNode): node is DirectiveNode {
  return node.type === 'Directive';
}

describe('API Integration Tests', () => {
  let context: TestContextDI;
  let testContainer: DependencyContainer; // Manual container
  let projectRoot: string;

  beforeEach(async () => {
    // 1. Setup TestContextDI for FS/Fixtures
    context = await TestContextDI.createIsolated();
    projectRoot = '/project';

    // 2. Create Manual Child Container
    testContainer = container.createChildContainer();

    // Keep only Logger mock
    // const mockLogger = mock<ILogger>(); // Remove mock logger

    // Register Dependencies
    // Infrastructure Mocks (FS, Logger)
    testContainer.registerInstance<IFileSystem>('IFileSystem', context.fs);
    // Remove incorrect registration
    // testContainer.registerInstance<ILogger>('DirectiveLogger', mockLogger);
    // Register the actual main logger using correct tokens
    const testLogger: ILogger = {
      error: (message, context) => logger.error(message, context),
      warn: (message, context) => logger.warn(message, context),
      info: (message, context) => logger.info(message, context),
      debug: (message, context) => logger.debug(message, context),
      trace: (message, context) => logger.debug(`[TRACE] ${message}`, context), // Map trace to debug
      level: logger.level ?? 'info', // Use logger's level or default
    };
    testContainer.registerInstance<ILogger>('ILogger', testLogger);

    // Register Real Factories
    testContainer.register(DirectiveServiceClientFactory, { useClass: DirectiveServiceClientFactory });
    testContainer.register(ParserServiceClientFactory, { useClass: ParserServiceClientFactory });
    testContainer.register(FileSystemServiceClientFactory, { useClass: FileSystemServiceClientFactory });
    testContainer.registerSingleton(InterpreterServiceClientFactory, InterpreterServiceClientFactory);

    // Register Real Services (Singleton State)
    testContainer.registerSingleton(StateService, StateService);
    testContainer.registerSingleton('IResolutionService', ResolutionService);
    testContainer.registerSingleton('IParserService', ParserService);
    testContainer.registerSingleton('IInterpreterService', InterpreterService);
    testContainer.register('IOutputService', { useClass: OutputService });
    testContainer.registerSingleton('IFileSystemService', FileSystemService);
    testContainer.registerSingleton('IPathService', PathService);
    testContainer.registerSingleton('IPathOperationsService', PathOperationsService);
    // <<< Register CircularityService >>>
    testContainer.registerSingleton('ICircularityService', CircularityService);
    // Register StateTrackingService for StateService dependency
    testContainer.registerSingleton(StateTrackingService, StateTrackingService); // Register concrete class
    // REMOVED: testContainer.registerSingleton('IStateTrackingService', { useExisting: StateTrackingService });

    // Register other services
    testContainer.registerSingleton('IDirectiveService', DirectiveService);
    // <<< ADDED: Register ValidationService >>>
    testContainer.register('IValidationService', { useClass: ValidationService });

    // <<< ADDED: Register the container itself >>>
    testContainer.registerInstance('DependencyContainer', testContainer);

    // --- DI Fix for VariableReferenceResolver ---    
    // 1. Resolve dependencies needed by VariableReferenceResolverFactory.createResolver
    // const stateService = testContainer.resolve<IStateService>('IStateService');
    // const resolutionService = testContainer.resolve<IResolutionService>('IResolutionService');
    // const parserService = testContainer.resolve<IParserService>('IParserService');
    // const resolverFactory = testContainer.resolve(VariableReferenceResolverFactory);
    
    // 2. Create the actual VariableReferenceResolver instance
    // const resolverInstance = resolverFactory.createResolver(stateService, resolutionService, parserService);
    
    // 3. Register the *instance* so VariableReferenceResolverClientFactory's constructor can find it
    testContainer.registerSingleton(VariableReferenceResolverFactory, VariableReferenceResolverFactory);

    // Register the class so DI can resolve its dependencies
    testContainer.register(VariableReferenceResolver, { useClass: VariableReferenceResolver }); 

    // Clear mocks after setup, before tests
    vi.clearAllMocks();
  });

  afterEach(async () => {
    testContainer?.dispose(); // <-- CHECK THIS: dispose might be redundant if cleanup handles it
    await context?.cleanup(); // REVERTED: cleanupAsync -> cleanup
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('API Integration Tests', () => {
    it('should resolve OutputService directly from test container', () => {
      expect(() => {
        const outputService = testContainer.resolve<IOutputService>('IOutputService');
        expect(outputService).toBeDefined();
      }).not.toThrow();
    });
  });

  describe('Variable Definitions and References', () => {
    it('should handle text variable definitions and references', async () => {
      // Use centralized examples directly
      const textVarExample = textDirectiveExamples.atomic.var1;
      const templateLiteralExample = textDirectiveExamples.combinations.basicInterpolation;
      
      // Combine examples with additional content
      const content = `${textVarExample.code}
${templateLiteralExample.code}

@embed [[Some text content with {{var1}} and {{message}}]]
`;

      try {
        // Use processMeld API
        const result = await processMeld(content, { container: testContainer });

        // Resolve state service *after* processing to check final state
        const stateService = testContainer.resolve<IStateService>('IStateService');
        
        // Verify output contains the expected content with transformed directives
        expect(result).toBeDefined();
        // Assuming markdown format is default or doesn't affect simple text resolution
        expect(result).toContain('Some text content with Value 1 and Hello, World!'); 
        
        // Check that text variables are set in state
        const var1MeldVar = stateService.getVariable('var1', VariableType.TEXT);
        expect(var1MeldVar).toBeDefined();
        expect(var1MeldVar?.value).toBe('Value 1');
        
        const messageMeldVar = stateService.getVariable('message', VariableType.TEXT);
        expect(messageMeldVar).toBeDefined();
        expect(messageMeldVar?.value).toBe('Hello, World!');
      } catch (error) {
        console.error('ERROR during test execution:', error);
        throw error;
      }
    });
    
    it('should handle data variable definitions and field access', async () => {
      // Use centralized examples directly
      const dataVarExample = dataDirectiveExamples.atomic.simpleObject;
      const textVarExample = textDirectiveExamples.atomic.simpleString;
      
      // Combine examples with additional content
      const content = `${dataVarExample.code}
${textVarExample.code}

@embed [[User info: {{user.name}} ({{user.id}})]]
`;

      const testFilePath = 'test.meld';
      // Resolve services needed within the test
      const fileSystemService = testContainer.resolve<IFileSystemService>('IFileSystemService');
      const parserService = testContainer.resolve<IParserService>('IParserService');
      const stateService = testContainer.resolve<IStateService>('IStateService');
      const interpreterService = testContainer.resolve<IInterpreterService>('IInterpreterService');
      const outputService = testContainer.resolve<IOutputService>('IOutputService');
      
      await fileSystemService.writeFile(unsafeCreateValidatedResourcePath(testFilePath), content);
      
      try {
        // Transformation enabled in beforeEach
        const fileContent = await fileSystemService.readFile(unsafeCreateValidatedResourcePath(testFilePath));
        const ast = await parserService.parse(fileContent, testFilePath);
        const resultState = await interpreterService.interpret(ast, {
          strict: true,
          initialState: stateService,
          filePath: testFilePath
        });
        const nodesToProcess = resultState.getNodes();
        const result = await outputService.convert(nodesToProcess, resultState, 'markdown', {});

        // Verify output contains the expected content with transformed directives
        expect(result).toBeDefined();
        expect(result).toContain('User info:');
        expect(result).toContain('Alice'); // Check for resolved name
        expect(result).toContain('(123)'); // Check for resolved id
        
        // Check that variables are set in state
        const userMeldVar = stateService.getVariable('user', VariableType.DATA);
        expect(userMeldVar).toBeDefined();
        expect(userMeldVar?.value).toHaveProperty('name', 'Alice');
        expect(userMeldVar?.value).toHaveProperty('id', 123);
      } catch (error) {
        console.error('ERROR during test execution:', error);
        throw error;
      }
    });
    
    it('should handle complex nested data structures', async () => {
      // Use a direct content approach instead of combining potentially problematic examples
      const content = `@text greeting = "Hello"
@data config = {
  "app": {
    "name": "Meld",
    "version": "1.0.0",
    "features": ["text", "data", "path"]
  },
  "env": "test"
}

@embed [[
Greeting: {{greeting}}
App name: {{config.app.name}}
Version: {{config.app.version}}
First feature: {{config.app.features.0}}
]]
`;

      const testFilePath = 'test.meld';
      // Resolve services needed within the test
      const fileSystemService = testContainer.resolve<IFileSystemService>('IFileSystemService');
      const parserService = testContainer.resolve<IParserService>('IParserService');
      const stateService = testContainer.resolve<IStateService>('IStateService');
      const interpreterService = testContainer.resolve<IInterpreterService>('IInterpreterService');
      const outputService = testContainer.resolve<IOutputService>('IOutputService');
      
      await fileSystemService.writeFile(unsafeCreateValidatedResourcePath(testFilePath), content);
      
      try {
        // Transformation enabled in beforeEach
        const fileContent = await fileSystemService.readFile(unsafeCreateValidatedResourcePath(testFilePath));
        const ast = await parserService.parse(fileContent, testFilePath);
        const resultState = await interpreterService.interpret(ast, {
          strict: true,
          initialState: stateService,
          filePath: testFilePath
        });
        const nodesToProcess = resultState.getNodes();
        const result = await outputService.convert(nodesToProcess, resultState, 'markdown', {});

        // Verify output contains the expected content with transformed directives
        expect(result).toBeDefined();
        expect(result).toContain('Greeting: Hello');
        expect(result).toContain('App name: Meld');
        expect(result).toContain('Version: 1.0.0');
        expect(result).toContain('First feature: text');
        
        // Check that data is set in state
        const configMeldVar = stateService.getVariable('config', VariableType.DATA);
        expect(configMeldVar).toBeDefined();
        const configValue = configMeldVar?.value as any;
        expect(configValue).toBeDefined();
        expect(configValue.app.name).toBe('Meld');
        expect(configValue.app.features).toBeDefined();
        expect(Array.isArray(configValue.app.features)).toBe(true);
      } catch (error) {
        console.error('ERROR during test execution:', error);
        throw error;
      }
    });

    it.todo('should handle nested array access (e.g., arr.1.1)'); // Placeholder for nested-array.test.ts scenario

    it('should handle template literals in text directives', async () => {
      // Use centralized examples directly
      const templateExample = textDirectiveExamples.atomic.templateLiteral;
      
      // Create content with the example
      const content = `${templateExample.code}

@embed [[
Template result: {{message}}
]]
`;

      // Start debug session
      // const sessionId = await context.startDebugSession();
      
      try {
        const testFilePath = 'test.meld';
        // Resolve services needed within the test
        const fileSystemService = testContainer.resolve<IFileSystemService>('IFileSystemService');
        const parserService = testContainer.resolve<IParserService>('IParserService');
        const stateService = testContainer.resolve<IStateService>('IStateService');
        const interpreterService = testContainer.resolve<IInterpreterService>('IInterpreterService');
        const outputService = testContainer.resolve<IOutputService>('IOutputService');
        
        await fileSystemService.writeFile(unsafeCreateValidatedResourcePath(testFilePath), content);

        const fileContent = await fileSystemService.readFile(unsafeCreateValidatedResourcePath(testFilePath));
        const ast = await parserService.parse(fileContent, testFilePath);
        const resultState = await interpreterService.interpret(ast, {
          strict: true,
          initialState: stateService,
          filePath: testFilePath
        });
        const nodesToProcess = resultState.getNodes();
        const result = await outputService.convert(nodesToProcess, resultState, 'markdown', {});

        // Log debug information
        // console.log('===== RESULT =====');
        // console.log(result);
        // console.log('=================');
        
        // Get debug session results
        // const debugResults = await context.endDebugSession(sessionId);
        // console.log('===== DEBUG SESSION RESULTS =====');
        // console.log(JSON.stringify(debugResults, null, 2));
        // console.log('=================================');
        
        // Verify output contains the expected content with transformed directives
        expect(result).toBeDefined();
        expect(result).toContain('Template result: Template content'); // Expect the actual literal value
      } catch (error) {
        console.error('ERROR during test execution:', error);
        throw error;
      }
    });
  });

  describe('Path Handling', () => {
    // Define context here to be accessible by all tests in this describe block
    const defaultValidationContext: PathValidationContext = {
      workingDirectory: unsafeCreateNormalizedAbsoluteDirectoryPath(projectRoot),
      allowExternalPaths: true,
      rules: { 
        allowAbsolute: true,
        allowRelative: true,
        allowParentTraversal: true,
      }
    };

    it('should handle path variables with special $PROJECTPATH syntax', async () => {
      // Enable verbose debugging for this test
      // process.env.MELD_DEBUG = '1';
      // process.env.MELD_DEBUG_LEVEL = 'trace';
      // process.env.MELD_DEBUG_VARS = 'docs,PROJECTPATH,HOMEPATH';
      
      // console.log('\n\n========== DEBUGGING PATH RESOLUTION ==========');
      
      // Get the debug service
      // const debugService = context.services.debug as unknown as TestDebuggerService;
      
      // Start a debug session to capture what's happening
      // const sessionId = await debugService.startSession({ ... });
      // console.log('Debug session started:', sessionId);
      
      // Resolve services needed within the test
      const pathService = testContainer.resolve<IPathService>('IPathService');
      const stateService = testContainer.resolve<IStateService>('IStateService');
      const fileSystemService = testContainer.resolve<IFileSystemService>('IFileSystemService');
      const parserService = testContainer.resolve<IParserService>('IParserService');
      const interpreterService = testContainer.resolve<IInterpreterService>('IInterpreterService');
      const outputService = testContainer.resolve<IOutputService>('IOutputService');
      
      // Log state service
      // console.log('State service:', { ... });

      // Create main test content
      const docsPath = 'my/docs';
      const content = `
@path docs = "$PROJECTPATH/my/docs"
Docs are at $docs
      `;
      
      const testFilePath = 'test-projectpath.meld';
      await fileSystemService.writeFile(unsafeCreateValidatedResourcePath(testFilePath), content);
      
      // Direct validation of path string - should work with real services
      try {
        // console.log('Validating $PROJECTPATH/my/docs path directly...');
        await pathService.validatePath('$PROJECTPATH/my/docs', defaultValidationContext);
        // console.log('✅ Direct path validation succeeded for $PROJECTPATH format');
      } catch (error) {
        // console.error('❌ Direct path validation failed for $PROJECTPATH format:', error);
        throw error; // Re-throw if validation fails unexpectedly
      }
      
      // Process with transformation
      try {
        // console.log('Processing $PROJECTPATH format...');
        // Use processMeld API for consistency
        const result = await processMeld(content, { container: testContainer });
        
        // console.log('$PROJECTPATH test result:', result);
        const docsVar = stateService.getVariable('docs', VariableType.PATH);
        // console.log('docs path var:', docsVar);
        
        // Check the output contains the resolved path (relative to project root)
        expect(result).toContain(`Docs are at ${docsPath}`);
        
      } catch (error) {
        // console.error('Error during $PROJECTPATH test:', error);
        throw error;
      }
      
      // End debug session
      // const debugResults = await debugService.endSession(sessionId);
      // console.log('\nDebug session results (summary):', Object.keys(debugResults));
    });
    
    it('should handle path variables with special $. alias syntax', async () => {
      // console.log('\n\n========== DEBUGGING $. PATH RESOLUTION ==========');
      
      // Resolve services needed within the test
      const pathService = testContainer.resolve<IPathService>('IPathService');
      const stateService = testContainer.resolve<IStateService>('IStateService');
      const fileSystemService = testContainer.resolve<IFileSystemService>('IFileSystemService');
      // const debugService = context.services.debug as unknown as TestDebuggerService;
      
      // Start a debug session for capturing state
      // const sessionId = await debugService.startSession({ ... });
      // console.log('Debug session started:', sessionId);
      
      // First try direct path validation
      try {
        // console.log('Directly validating $./config path...');
        await pathService.validatePath('$./config', defaultValidationContext);
        // console.log('✅ Direct path validation succeeded for $./config');
      } catch (error) {
        // console.error('❌ Direct path validation failed for $./config:', error);
        throw error;
      }
      
      // Create test content with the path format
      const content = `@path config = "$./config"`;
      // console.log('Test content:', content);
      
      const testFilePath = 'test.meld';
      await fileSystemService.writeFile(unsafeCreateValidatedResourcePath(testFilePath), content);
      
      // Capture state before processing
      // await debugService.captureState('before-dotslash-test', { ... });
      
      try {
        // console.log('Processing test file...');
        const result = await processMeld(content, { container: testContainer });
        
        // console.log('Test result:', result);
        
        // Capture post-processing state
        // await debugService.captureState('after-dotslash-test', { ... });
        
        // Check path variable state
        const configPathVar = stateService.getVariable('config', VariableType.PATH);
        // console.log('Path variable "config":', configPathVar);
        
        // Verify the path variable exists and contains the original alias
        expect(configPathVar).toBeDefined();
        // Assuming configPathVar itself represents the intended value or has toString()
        expect(String(configPathVar)).toContain('$./config'); 
      } catch (error) {
        // console.error('Error processing $. test:', error);
        throw error;
      }
      
      // End debug session
      // const debugResults = await debugService.endSession(sessionId);
      // console.log('Debug session results:', Object.keys(debugResults));
    });
    
    it('should handle path variables with special $HOMEPATH syntax', async () => {
      // console.log('\n\n========== DEBUGGING $HOMEPATH RESOLUTION ==========');
      
      // Resolve services needed within the test
      const pathService = testContainer.resolve<IPathService>('IPathService');
      const stateService = testContainer.resolve<IStateService>('IStateService');
      const fileSystemService = testContainer.resolve<IFileSystemService>('IFileSystemService');
      // const debugService = context.services.debug as unknown as TestDebuggerService;
      
      // Start a debug session for capturing state
      // const sessionId = await debugService.startSession({ ... });
      // console.log('Debug session started:', sessionId);
      
      // First try direct path validation
      try {
        // console.log('Directly validating $HOMEPATH/.config path...');
        await pathService.validatePath('$HOMEPATH/.config', defaultValidationContext);
        // console.log('✅ Direct path validation succeeded for $HOMEPATH/.config');
      } catch (error) {
        // console.error('❌ Direct path validation failed for $HOMEPATH/.config:', error);
        throw error;
      }
      
      // Create test content with the path format
      const content = `@path userConfig = "$HOMEPATH/.config"`;
      // console.log('Test content:', content);
      
      const testFilePath = 'test.meld';
      await fileSystemService.writeFile(unsafeCreateValidatedResourcePath(testFilePath), content);
      
      // Capture state before processing
      // await debugService.captureState('before-homepath-test', { ... });
      
      try {
        // console.log('Processing test file...');
        const result = await processMeld(content, { container: testContainer });
        
        // console.log('Test result:', result);
        
        // Capture post-processing state
        // await debugService.captureState('after-homepath-test', { ... });
        
        // Check path variable state
        const configPathVar = stateService.getVariable('userConfig', VariableType.PATH);
        // console.log('Path variable "userConfig":', configPathVar);
        
        // Verify the path variable exists and contains the original alias
        expect(configPathVar).toBeDefined();
        // Assuming configPathVar itself represents the intended value or has toString()
        expect(String(configPathVar)).toContain('$HOMEPATH/.config');
      } catch (error) {
        // console.error('Error processing $HOMEPATH test:', error);
        throw error;
      }
      
      // End debug session
      // const debugResults = await debugService.endSession(sessionId);
      // console.log('Debug session results:', Object.keys(debugResults));
    });
    
    it('should handle path variables with special $~ alias syntax', async () => {
      // console.log('\n\n========== DEBUGGING $~ PATH RESOLUTION ==========');
      
       // Resolve services needed within the test
      const pathService = testContainer.resolve<IPathService>('IPathService');
      const stateService = testContainer.resolve<IStateService>('IStateService');
      const fileSystemService = testContainer.resolve<IFileSystemService>('IFileSystemService');
      // const debugService = context.services.debug as unknown as TestDebuggerService;
      
      // Start a debug session for capturing state
      // const sessionId = await debugService.startSession({ ... });
      // console.log('Debug session started:', sessionId);
      
      // First try direct path validation
      try {
        // console.log('Directly validating $~/Documents path...');
        await pathService.validatePath('$~/Documents', defaultValidationContext);
        // console.log('✅ Direct path validation succeeded for $~/Documents');
      } catch (error) {
        // console.error('❌ Direct path validation failed for $~/Documents:', error);
        throw error;
      }
      
      // Create test content with the path format
      const content = `@path docs = "$~/Documents"`;
      // console.log('Test content:', content);
      
      const testFilePath = 'test.meld';
      await fileSystemService.writeFile(unsafeCreateValidatedResourcePath(testFilePath), content);
      
      // Capture state before processing
      // await debugService.captureState('before-tilde-test', { ... });
      
      try {
        // console.log('Processing test file...');
        const result = await processMeld(content, { container: testContainer });
        
        // console.log('Test result:', result);
        
        // Capture post-processing state
        // await debugService.captureState('after-tilde-test', { ... });
        
        // Check path variable state
        const configPathVar = stateService.getVariable('docs', VariableType.PATH);
        // console.log('Path variable "docs":', configPathVar);
        
        // Verify the path variable exists and contains the original alias
        expect(configPathVar).toBeDefined();
        // Assuming configPathVar itself represents the intended value or has toString()
        expect(String(configPathVar)).toContain('$~/Documents');
      } catch (error) {
        // console.error('Error processing $~ test:', error);
        throw error;
      }
      
      // End debug session
      // const debugResults = await debugService.endSession(sessionId);
      // console.log('Debug session results:', Object.keys(debugResults));
    });
    
    it('should allow raw absolute paths', async () => {
      const filePath = '/absolute/path/to/file.txt';
      // Write a dummy file to the mock FS at this path
      const fileSystemService = testContainer.resolve<IFileSystemService>('IFileSystemService');
      await fileSystemService.writeFile(unsafeCreateValidatedResourcePath(filePath), 'Absolute file content');
      
      const pathService = testContainer.resolve<IPathService>('IPathService');
      const validationContext: PathValidationContext = {
          workingDirectory: unsafeCreateNormalizedAbsoluteDirectoryPath(projectRoot),
          allowExternalPaths: true,
          rules: { allowAbsolute: true, allowRelative: true, allowParentTraversal: true },
      };
      await expect(pathService.validatePath(filePath, validationContext)).resolves.toBeDefined();
    });
    
    it('should allow paths with dot segments', async () => {
      const relativePath = './relative/to/../file.txt'; // Normalized to ./relative/file.txt
      const absolutePath = path.join(projectRoot, 'relative', 'file.txt');
      const fileSystemService = testContainer.resolve<IFileSystemService>('IFileSystemService');
      await fileSystemService.writeFile(unsafeCreateValidatedResourcePath(absolutePath), 'Dot segment file content');

      const pathService = testContainer.resolve<IPathService>('IPathService');
      const validationContext: PathValidationContext = {
          workingDirectory: unsafeCreateNormalizedAbsoluteDirectoryPath(projectRoot),
          allowExternalPaths: true,
          rules: { allowAbsolute: true, allowRelative: true, allowParentTraversal: true },
      };
      // Validate the relative path which should resolve correctly
      await expect(pathService.validatePath(relativePath, validationContext)).resolves.toBeDefined();
    });
  });

  // <<< Use describe.only to isolate Import tests >>>
  describe.only('Import Handling', () => {
    // <<< ADD Minimal beforeEach for import tests >>>
    beforeEach(async () => {
      // Minimal container setup for import tests
      testContainer = container.createChildContainer();
      testContainer.registerInstance<IFileSystem>('IFileSystem', context.fs);
      testContainer.registerInstance('MainLogger', logger); 
      testContainer.register('ILogger', { useToken: 'MainLogger' });

      // --- Essential Factories ---
      testContainer.register(FileSystemServiceClientFactory, { useClass: FileSystemServiceClientFactory }); 
      testContainer.register(InterpreterServiceClientFactory, { useClass: InterpreterServiceClientFactory });
      // Only register DirectiveServiceClientFactory if DirectiveService is needed directly by test assertions (unlikely for import)
      // testContainer.register(DirectiveServiceClientFactory, { useClass: DirectiveServiceClientFactory }); 
      testContainer.register(ParserServiceClientFactory, { useClass: ParserServiceClientFactory });
      
      // --- Essential Services ---
      testContainer.registerSingleton(StateService, StateService);
      testContainer.register('IPathService', { useClass: PathService });
      testContainer.register('IFileSystemService', { useClass: FileSystemService });
      testContainer.register('IParserService', { useClass: ParserService });
      testContainer.register('IResolutionService', { useClass: ResolutionService });
      testContainer.registerSingleton('ICircularityService', CircularityService);
      testContainer.register('IDirectiveService', { useClass: DirectiveService }); // Needed for handler resolution
      testContainer.register('IInterpreterService', { useClass: InterpreterService }); // Needed for import recursion
      testContainer.register('IValidationService', { useClass: ValidationService }); // Needed by DirectiveService
      testContainer.register('IPathOperationsService', { useClass: PathOperationsService }); // Dep for FileSystemService

      // --- Register Container Itself --- 
      testContainer.registerInstance('DependencyContainer', testContainer);
    });
    // <<< End Minimal beforeEach >>>

    it('should handle simple imports', async () => {
      const mainFilePath = 'main.meld';
      const importedFilePath = 'imported.meld';
      const fileSystemService = testContainer.resolve<IFileSystemService>('IFileSystemService');
      const stateService = testContainer.resolve<IStateService>('IStateService'); // Resolve state service

      // Use actual newlines \n instead of escaped \\n
      const mainContent = `Main file start.\n@import [${importedFilePath}]\nMain file end. @embed [[Imported var: {{importedVar}}]]`;
      const importedContent = `@text importedVar = "Imported Value"`;

      await fileSystemService.writeFile(unsafeCreateValidatedResourcePath(mainFilePath), mainContent);
      await fileSystemService.writeFile(unsafeCreateValidatedResourcePath(importedFilePath), importedContent);

      // Process using processMeld API
      const result = await processMeld(mainContent, {
        container: testContainer,
        // filePath: mainFilePath // Removed to fix linter error - investigate options later
      });

      // console.log('Simple import result:', result);

      // --- Corrected Assertions ---
      // Check the final output string - expecting import directive to be removed and imported var resolved
      const expectedOutput = 'Main file start.\n\nMain file end. Imported var: Imported Value';
      expect(result.trim()).toBe(expectedOutput.trim());

      // Verify state after import
      const importedVar = stateService.getVariable('importedVar', VariableType.TEXT);
      expect(importedVar).toBeDefined();
      expect(importedVar?.value).toBe('Imported Value');
      // --- End Corrected Assertions ---
    });
    
    it('should handle nested imports with proper scope inheritance', async () => {
      const mainFilePath = 'main.meld';
      const level1FilePath = 'level1.meld';
      const level2FilePath = 'level2.meld';
      const fileSystemService = testContainer.resolve<IFileSystemService>('IFileSystemService');
      const stateService = testContainer.resolve<IStateService>('IStateService'); // Resolve state service

      // Use actual newlines \n instead of escaped \\n
      const mainContent = `Main file start.\n@import [${level1FilePath}]\n@embed [[Main file end. Level1Var: {{level1Var}}, Level2Var: {{level2Var}}]]`;
      const level1Content = `Level 1 Start.\n@import [${level2FilePath}]\n@embed [[Level 1 End. Level1Var: {{level1Var}}, Level2Var: {{level2Var}}]]`;
      const level2Content = `@text level2Var = "Level 2 Value"\n@text level1Var = "Value From Level 2 (using {{level2Var}})"\n@embed [[Level 2 Text Node. Level2Var: {{level2Var}}]]`;

      await fileSystemService.writeFile(unsafeCreateValidatedResourcePath(mainFilePath), mainContent);
      await fileSystemService.writeFile(unsafeCreateValidatedResourcePath(level1FilePath), level1Content);
      await fileSystemService.writeFile(unsafeCreateValidatedResourcePath(level2FilePath), level2Content);

      // Process using processMeld API
      const result = await processMeld(mainContent, {
        container: testContainer,
        filePath: mainFilePath // Provide the file path for correct relative import resolution
      });
      
      // console.log('Nested import result:', result);

      // --- Corrected Assertions ---
      const expectedOutput = 'Main file start.\n\nMain file end. Level1Var: Value From Level 2 (using Level 2 Value), Level2Var: Level 2 Value';
      expect(result.trim()).toBe(expectedOutput.trim());

      // Check final merged state
      const level1Var = stateService.getVariable('level1Var', VariableType.TEXT);
      expect(level1Var).toBeDefined();
      expect(level1Var?.value).toBe('Value From Level 2 (using Level 2 Value)'); // Check if level1 var was updated in main state

      const level2Var = stateService.getVariable('level2Var', VariableType.TEXT);
      expect(level2Var).toBeDefined();
      expect(level2Var?.value).toBe('Level 2 Value'); // Check if level2 var exists in main state
      // --- End Corrected Assertions ---
    });
    
    it('should detect circular imports', async () => {
      const fileAPath = 'fileA.meld';
      const fileBPath = 'fileB.meld';
      // Resolve services needed within the test
      const fileSystemService = testContainer.resolve<IFileSystemService>('IFileSystemService');

      // Create test files with circular imports
      const fileAContent = `@import [${fileBPath}]\n@text valueA = "A"`;
      const fileBContent = `@import [${fileAPath}]\n@text valueB = "B"`;

      await fileSystemService.writeFile(unsafeCreateValidatedResourcePath(fileAPath), fileAContent);
      await fileSystemService.writeFile(unsafeCreateValidatedResourcePath(fileBPath), fileBContent);

      // Use processMeld with filePath to enable proper import resolution
      await expect(processMeld(fileAContent, {
        container: testContainer,
        filePath: fileAPath // Add filePath for proper import resolution
      })).rejects.toThrow(/Circular import detected/i);
    });
  });
});
