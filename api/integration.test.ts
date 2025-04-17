import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import type { ProcessOptions, Services } from '@core/types/index.js';
import { MeldFileNotFoundError } from '@core/errors/MeldFileNotFoundError.js';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import * as path from 'path';
import { TestDebuggerService } from '@tests/utils/debug/TestDebuggerService.js';
import { SyntaxExample } from '@core/syntax/helpers/index.js';
import {
  textDirectiveExamples,
  dataDirectiveExamples,
  importDirectiveExamples,
  defineDirectiveExamples,
  embedDirectiveExamples,
  pathDirectiveExamples,
  createNodeFromExample
} from '@core/syntax/index.js';
// Import run examples directly
import runDirectiveExamplesModule from '@core/syntax/run.js';
// Add imports for core services needed
import { ParserService } from '@services/pipeline/ParserService/ParserService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import { InterpreterService } from '@services/pipeline/InterpreterService/InterpreterService.js';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import { StateService } from '@services/state/StateService/StateService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import { OutputService } from '@services/pipeline/OutputService/OutputService.js';
import type { IOutputService } from '@services/pipeline/OutputService/IOutputService.js';
import { FileSystemService } from '@services/fs/FileSystemService/FileSystemService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { PathService } from '@services/fs/PathService/PathService.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import { unsafeCreateValidatedResourcePath, PathValidationContext, NormalizedAbsoluteDirectoryPath, createMeldPath, unsafeCreateNormalizedAbsoluteDirectoryPath } from '@core/types/paths.js';
import type { NodeFileSystem } from '@services/fs/FileSystemService/NodeFileSystem.js';
import type { MeldNode, DirectiveNode } from '@core/syntax/types/index.js';
import { processMeld } from '@api/index.js';
// === Manual DI Imports ===
import { container, type DependencyContainer } from 'tsyringe';
import { mock } from 'vitest-mock-extended';
import { URL } from 'node:url';
import { DirectiveServiceClientFactory } from '@services/pipeline/DirectiveService/factories/DirectiveServiceClientFactory.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ParserServiceClientFactory } from '@services/pipeline/ParserService/factories/ParserServiceClientFactory.js';
import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem.js';
import type { ILogger } from '@core/utils/logger.js';
import { FileSystemServiceClientFactory } from '@services/fs/FileSystemService/factories/FileSystemServiceClientFactory.js';
// Import PathOperationsService for registration
import { PathOperationsService } from '@services/fs/FileSystemService/PathOperationsService.js';
import { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService.js';
// =========================

// Define runDirectiveExamples from the module
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
    context = TestContextDI.createIsolated();
    await context.initialize();
    projectRoot = '/project';

    // 2. Create Manual Child Container
    testContainer = container.createChildContainer();

    // Keep only Logger mock
    const mockLogger = mock<ILogger>();

    // Register Dependencies
    // Infrastructure Mocks (FS, Logger)
    testContainer.registerInstance<IFileSystem>('IFileSystem', context.fs);
    testContainer.registerInstance<ILogger>('DirectiveLogger', mockLogger);

    // Register Real Factories
    testContainer.register(DirectiveServiceClientFactory, { useClass: DirectiveServiceClientFactory });
    testContainer.register(ParserServiceClientFactory, { useClass: ParserServiceClientFactory });
    testContainer.register(FileSystemServiceClientFactory, { useClass: FileSystemServiceClientFactory });

    // Register Real Services (Singleton State)
    testContainer.registerSingleton('IStateService', StateService);
    testContainer.register('IResolutionService', { useClass: ResolutionService });
    testContainer.register('IParserService', { useClass: ParserService });
    testContainer.register('IInterpreterService', { useClass: InterpreterService });
    testContainer.register('IOutputService', { useClass: OutputService });
    testContainer.register('IFileSystemService', { useClass: FileSystemService });
    testContainer.register('IPathService', { useClass: PathService });
    testContainer.register('IPathOperationsService', { useClass: PathOperationsService });
  });

  afterEach(async () => {
    testContainer?.clearInstances(); // Clear manual container first
    await context?.cleanup();
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('Variable Definitions and References', () => {
    it('should handle text variable definitions and references', async () => {
      // Use centralized examples directly
      const textVarExample = textDirectiveExamples.atomic.var1;
      const templateLiteralExample = textDirectiveExamples.combinations.basicInterpolation;
      
      // Add debug logging
      // console.log('DEBUG - textVarExample:', textVarExample.code);
      // console.log('DEBUG - templateLiteralExample:', templateLiteralExample.code);
      
      // Combine examples with additional content
      const content = `${textVarExample.code}
${templateLiteralExample.code}

Some text content with {{var1}} and {{message}}
`;

      // Start debug session
      // const sessionId = await context.startDebugSession();
      
      try {
        // Write content to a file first
        const testFilePath = 'test.meld';
        // Resolve services needed within the test
        const fileSystemService = testContainer.resolve<IFileSystemService>('IFileSystemService');
        const parserService = testContainer.resolve<IParserService>('IParserService');
        const stateService = testContainer.resolve<IStateService>('IStateService');
        const interpreterService = testContainer.resolve<IInterpreterService>('IInterpreterService');
        const outputService = testContainer.resolve<IOutputService>('IOutputService');
        
        await fileSystemService.writeFile(unsafeCreateValidatedResourcePath(testFilePath), content);
        
        // Read the content back (mimicking what main would do)
        const fileContent = await fileSystemService.readFile(unsafeCreateValidatedResourcePath(testFilePath));

        // Parse the content directly
        const ast = await parserService.parse(fileContent, testFilePath); // Provide file path for context

        // Interpret the AST using the resolved services
        const resultState = await interpreterService.interpret(ast, {
          strict: true,
          initialState: stateService,
          filePath: testFilePath // Pass file path
        });

        // Convert the result using the resolved services
        const nodesToProcess = resultState.getNodes();
        const result = await outputService.convert(nodesToProcess, resultState, 'markdown', {}); // Pass format and empty options

        // Log debug information
        // console.log('===== RESULT =====');
        // console.log(result);
        // console.log('=================');
        
        // Log the state service
        // console.log('===== STATE SERVICE =====');
        // console.log('Has services:', !!context.services); // Keep this check for context.services
        // console.log('Has state service:', !!stateService); // Use resolved stateService
        // console.log('State service methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(stateService)));
        // console.log('=================================');
        
        // Get debug session results
        // const debugResults = await context.endDebugSession(sessionId);
        // console.log('===== DEBUG SESSION RESULTS =====');
        // console.log(JSON.stringify(debugResults, null, 2));
        // console.log('=================================');
        
        // Verify output contains the expected content with transformed directives
        expect(result).toBeDefined();
        expect(result).toContain('Some text content with');
        expect(result).toContain('Value 1');
        expect(result).toContain('Hello, World!');
        
        // Check that text variables are set in state
        const var1Value = stateService.getTextVar('var1'); // Use resolved stateService
        // console.log('DEBUG - var1 value in state:', var1Value);
        
        expect(var1Value).toBeDefined();
        expect(var1Value).toBe('Value 1');
        
        const messageValue = stateService.getTextVar('message'); // Use resolved stateService
        // console.log('DEBUG - message value in state:', messageValue);
        
        expect(messageValue).toBeDefined();
        expect(messageValue).toBe('Hello, World!');
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

User info: {{user.name}} ({{user.id}})
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
        const userVar = stateService.getDataVar('user') as any; // Use resolved stateService
        expect(userVar).toBeDefined();
        expect(userVar).toHaveProperty('name', 'Alice');
        expect(userVar).toHaveProperty('id', 123);
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

Greeting: {{greeting}}
App name: {{config.app.name}}
Version: {{config.app.version}}
First feature: {{config.app.features.0}}
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
        const configData = stateService.getDataVar('config') as any; // Use resolved stateService
        expect(configData).toBeDefined();
        expect(configData.app.name).toBe('Meld');
        expect(configData.app.features).toBeDefined();
        expect(Array.isArray(configData.app.features)).toBe(true);
      } catch (error) {
        console.error('ERROR during test execution:', error);
        throw error;
      }
    });

    it('should handle template literals in text directives', async () => {
      // Use centralized examples directly
      const templateExample = textDirectiveExamples.atomic.templateLiteral;
      
      // Create content with the example
      const content = `${templateExample.code}

Template result: {{template}}
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
        expect(result).toContain('Template result: Hello, World!'); // Expect resolved value
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
        const docsVar = stateService.getPathVar('docs');
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
        const configPathVar = stateService.getPathVar('config');
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
        const configPathVar = stateService.getPathVar('userConfig');
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
        const configPathVar = stateService.getPathVar('docs');
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

  describe('Import Handling', () => {
    it('should handle simple imports', async () => {
      const mainFilePath = 'main.meld';
      const importedFilePath = 'imported.meld';
      const fileSystemService = testContainer.resolve<IFileSystemService>('IFileSystemService');
      const stateService = testContainer.resolve<IStateService>('IStateService'); // Resolve state service

      const mainContent = `Main file content: @import "${importedFilePath}"`;
      const importedContent = `@text importedVar = "Imported Value"{{importedVar}}`;
      
      await fileSystemService.writeFile(unsafeCreateValidatedResourcePath(mainFilePath), mainContent);
      await fileSystemService.writeFile(unsafeCreateValidatedResourcePath(importedFilePath), importedContent); 

      // Process using processMeld API
      const result = await processMeld(mainContent, {
        container: testContainer,
      });
      
      // console.log('Simple import result:', result);
      
      // Check the final output string
      expect(result.trim()).toBe('Main file content: Imported Value');
      // Verify state after import
      const importedVarValue = stateService.getTextVar('importedVar');
      expect(importedVarValue).toBe('Imported Value');
    });
    
    it('should handle nested imports with proper scope inheritance', async () => {
      const mainFilePath = 'main.meld';
      const level1FilePath = 'level1.meld';
      const level2FilePath = 'level2.meld';
      const fileSystemService = testContainer.resolve<IFileSystemService>('IFileSystemService');
      const stateService = testContainer.resolve<IStateService>('IStateService'); // Resolve state service
      
      const mainContent = `Main: @import "${level1FilePath}"`;
      const level1Content = `Level 1: @import "${level2FilePath}" {{level1Var}}`;
      const level2Content = `@text level2Var = "Level 2 Value"@text level1Var = "{{level2Var}}"{{level2Var}}`; // Level 1 var references Level 2
      
      await fileSystemService.writeFile(unsafeCreateValidatedResourcePath(mainFilePath), mainContent);
      await fileSystemService.writeFile(unsafeCreateValidatedResourcePath(level1FilePath), level1Content);
      await fileSystemService.writeFile(unsafeCreateValidatedResourcePath(level2FilePath), level2Content); 

      // Process using processMeld API
      const result = await processMeld(mainContent, {
        container: testContainer,
      });

      // Adjust expectation based on scope rules. Level 2 vars might not leak to main scope by default.
      // The output should reflect resolved content from nested levels.
      expect(result.trim()).toBe('Main: Level 1: Level 2 Value Level 2 Value'); // Check actual output based on service logic

      // Check final state (variables might be scoped)
      expect(stateService.getTextVar('level1Var')).toBe('Level 2 Value'); // Check if level1 var was updated in main state
      expect(stateService.getTextVar('level2Var')).toBe('Level 2 Value'); // Check if level2 var exists in main state
    });
    
    it('should detect circular imports', async () => {
      const fileAPath = 'fileA.meld';
      const fileBPath = 'fileB.meld';
      // Resolve services needed within the test
      const fileSystemService = testContainer.resolve<IFileSystemService>('IFileSystemService');
      // const stateService = testContainer.resolve<IStateService>('IStateService'); // Not needed for processMeld call
      // const parserService = testContainer.resolve<IParserService>('IParserService'); // Not needed for processMeld call
      // const interpreterService = testContainer.resolve<IInterpreterService>('IInterpreterService'); // Not needed for processMeld call

      const fileAContent = `File A content @import "${fileBPath}"`;
      const fileBContent = `File B content @import "${fileAPath}"`;
      
      await fileSystemService.writeFile(unsafeCreateValidatedResourcePath(fileAPath), fileAContent);
      await fileSystemService.writeFile(unsafeCreateValidatedResourcePath(fileBPath), fileBContent); 

      // Use processMeld which internally handles interpretation
      // Expect it to throw due to circular dependency detected by CircularityService
      await expect(processMeld(fileAContent, {
        container: testContainer,
      })).rejects.toThrow(/Circular import detected/i);

      // console.log('✅ Circular import detected as expected.');
    });
  });
});
