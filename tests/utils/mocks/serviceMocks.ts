/**
 * Service Mock Factory Utilities
 * 
 * This file provides factory functions for creating mock services using vitest-mock-extended.
 * These factories ensure type safety while providing proper prototype chain inheritance for
 * instanceof checks in tests.
 */

import { mock } from 'vitest-mock-extended';
import { vi } from 'vitest';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { DirectiveError } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { PathValidationError } from '@core/errors/PathValidationError.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import type { IStateService as ClonedState } from '@services/state/StateService/IStateService.js';
import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem.js';
import { Result } from '@core/types/common.js';
import type { MeldPath } from '@core/types/paths.js';
import type { ILogger } from '@services/logger/ILogger.js';

/**
 * Creates a mock ValidationService with default behavior
 * @returns A mocked IValidationService
 */
export function createValidationServiceMock() {
  const service = mock<IValidationService>();
  // Default behaviors
  service.validate.mockResolvedValue(undefined);
  return service;
}

/**
 * Creates a mock StateService with default behavior
 * @returns A mocked IStateService
 */
export function createStateServiceMock() {
  const service = mock<IStateService>();
  // Mock methods from IStateService (core)
  service.clone.mockReturnValue({} as ClonedState);
  service.getTextVar.mockReturnValue(undefined);
  service.setTextVar.mockResolvedValue({} as any); // Return placeholder
  service.getAllTextVars.mockReturnValue(new Map());
  service.getLocalTextVars.mockReturnValue(new Map());
  service.getDataVar.mockReturnValue(undefined);
  service.setDataVar.mockResolvedValue({} as any);
  service.getAllDataVars.mockReturnValue(new Map());
  service.getLocalDataVars.mockReturnValue(new Map());
  service.getPathVar.mockReturnValue(undefined);
  service.setPathVar.mockResolvedValue({} as any);
  service.getAllPathVars.mockReturnValue(new Map());
  service.getCommandVar.mockReturnValue(undefined);
  service.getAllCommands.mockReturnValue(new Map());
  service.addNode.mockReturnValue(undefined);
  service.appendContent.mockReturnValue(undefined);
  service.getTransformedNodes.mockReturnValue([]);
  service.setTransformedNodes.mockReturnValue(undefined);
  service.transformNode.mockReturnValue(undefined);
  service.isTransformationEnabled.mockReturnValue(false);
  service.setTransformationEnabled.mockReturnValue(undefined);
  service.getTransformationOptions.mockReturnValue({ enabled: false, preserveOriginal: true, transformNested: false });
  service.setTransformationOptions.mockReturnValue(undefined);
  service.addImport.mockReturnValue(undefined);
  service.removeImport.mockReturnValue(undefined);
  service.hasImport.mockReturnValue(false);
  service.getImports.mockReturnValue(new Set());
  service.getCurrentFilePath.mockReturnValue('/mock/file/path.meld');
  service.setCurrentFilePath.mockReturnValue(undefined);
  service.hasLocalChanges.mockReturnValue(false);
  service.getLocalChanges.mockReturnValue([]);
  service.setImmutable.mockReturnValue(undefined);
  Object.defineProperty(service, 'isImmutable', { get: () => false });
  service.createChildState.mockReturnValue(service); // Return self for simple cases
  service.mergeChildState.mockReturnValue(undefined);
  service.getVariable.mockReturnValue(undefined);
  service.setVariable.mockResolvedValue({} as any);
  service.hasVariable.mockReturnValue(false);
  service.removeVariable.mockResolvedValue(false);
  service.getParentState.mockReturnValue(undefined);
  service.getInternalStateNode.mockReturnValue({} as any);
  service.setEventService.mockReturnValue(undefined);
  service.setTrackingService.mockReturnValue(undefined);

  // Mock methods added from StateServiceLike
  service.enableTransformation = vi.fn();
  service.getNodes.mockReturnValue([]); // Replaces getOriginalNodes if renamed
  service.setCommandVar.mockResolvedValue({} as any);
  service.getCommand.mockReturnValue(undefined);
  service.shouldTransform.mockReturnValue(false);
  service.getCommandOutput.mockReturnValue(undefined);
  service.hasTransformationSupport.mockReturnValue(true); // Assume support

  return service;
}

/**
 * Creates a mock ResolutionService with default behavior
 * @returns A mocked IResolutionService
 */
export function createResolutionServiceMock() {
  const service = mock<IResolutionService>();
  const mockMeldPath = {
    contentType: 'filesystem',
    validatedPath: '/resolved/mock/path' as any,
    originalValue: '$mock/path',
    value: { exists: true, isAbsolute: true, isSecure: true, isValidSyntax: true },
    isURL: false,
    isSimple: false,
    raw: '$mock/path',
    isAbsolute: true,
    isRelative: false,
    isFilesystem: true,
    isSecure: true,
    isValidSyntax: true
  } as MeldPath;
  service.resolveText.mockResolvedValue('resolved-text');
  service.resolveData.mockResolvedValue({ mock: 'data' });
  service.resolvePath.mockResolvedValue(mockMeldPath);
  service.resolveCommand.mockResolvedValue('resolved-command-output');
  service.resolveFile.mockResolvedValue('resolved-file-content');
  service.resolveContent.mockResolvedValue('resolved-content');
  service.resolveNodes.mockResolvedValue('resolved-nodes-string');
  service.resolveInContext.mockResolvedValue('resolved-in-context');
  service.resolveFieldAccess.mockResolvedValue({ success: true, value: 'resolved-field-access' });
  service.validateResolution.mockResolvedValue(mockMeldPath);
  service.extractSection.mockResolvedValue('extracted-section');
  service.detectCircularReferences.mockResolvedValue(undefined);
  service.convertToFormattedString.mockResolvedValue('formatted-string');
  service.enableResolutionTracking.mockReturnValue(undefined);
  service.getResolutionTracker.mockReturnValue(undefined);

  return service;
}

/**
 * Creates a mock FileSystemService with default behavior
 * @returns A mocked IFileSystemService
 */
export function createFileSystemServiceMock() {
  const service = mock<IFileSystemService>();
  
  // Explicitly mock all methods from IFileSystemService
  service.readFile.mockResolvedValue('mock-file-content');
  service.writeFile.mockResolvedValue(undefined);
  service.exists.mockResolvedValue(true);
  service.stat.mockResolvedValue({ isFile: () => true, isDirectory: () => false } as any); // Basic stats mock
  service.isFile.mockResolvedValue(true);
  service.readDir.mockResolvedValue(['file1.txt', 'subdir']);
  service.ensureDir.mockResolvedValue(undefined);
  service.isDirectory.mockResolvedValue(false);
  service.watch.mockImplementation(async function* () {}); // Basic async generator mock
  service.getCwd.mockReturnValue('/mock/workspace');
  service.dirname.mockReturnValue('/mock/workspace');
  service.executeCommand.mockResolvedValue({ stdout: 'mock command output', stderr: '' });
  service.setFileSystem.mockReturnValue(undefined);
  service.getFileSystem.mockReturnValue(mock<IFileSystem>()); // Return mocked IFileSystem
  service.mkdir.mockResolvedValue(undefined); // Keep deprecated method mocked
  service.deleteFile.mockResolvedValue(undefined);

  return service;
}

/**
 * Creates a mock PathService with default behavior
 * @returns A mocked IPathService
 */
export function createPathServiceMock() {
  const service = mock<IPathService>();
  // Default behaviors based on IPathService
  // service.initialize // Initialization logic typically not mocked
  // service.enableTestMode // Control methods usually not mocked
  // service.disableTestMode
  service.isTestMode.mockReturnValue(false);
  // service.setHomePath // Setter methods usually not mocked
  // service.setProjectPath
  service.getHomePath.mockReturnValue('/mock/home');
  service.getProjectPath.mockReturnValue('/mock/project');
  service.resolveProjectPath.mockResolvedValue('/mock/project');
  // resolvePath returns a basic absolute path
  service.resolvePath.mockReturnValue('/resolved/mock/path' as any); // Cast for branding
  // validatePath returns a basic validated MeldPath
  service.validatePath.mockResolvedValue({
    contentType: 'filesystem',
    validatedPath: '/validated/mock/path' as any,
    originalValue: './mock/path',
    value: { exists: true, isAbsolute: true, isSecure: true, isValidSyntax: true },
    isURL: false,
    isSimple: false,
    raw: './mock/path',
    isAbsolute: true,
    isRelative: false,
    isFilesystem: true
  } as any); // Cast to MeldPath
  service.joinPaths.mockImplementation((...paths: string[]) => paths.join('/')); // Simple join mock
  service.dirname.mockImplementation((p: string) => p.substring(0, p.lastIndexOf('/') || p.length));
  service.basename.mockImplementation((p: string) => p.substring(p.lastIndexOf('/') + 1));
  // Explicitly assign a mock function for the optional method
  service.normalizePath = vi.fn().mockImplementation((p: string) => p);
  service.isURL.mockReturnValue(false);
  service.validateURL.mockResolvedValue('https://mock.validated.url' as any); // Cast for branding
  service.fetchURL.mockResolvedValue({ status: 200, content: 'mock url content' });

  // Remove outdated mocks
  // service.resolve is not present
  // service.isAbsolute is not present

  return service;
}

/**
 * Creates a DirectiveError mock with proper prototype chain for instanceof checks
 * @param message Error message
 * @param code Error code
 * @returns A mocked DirectiveError
 */
export function createDirectiveErrorMock(message: string, code: string) {
  const error = mock<DirectiveError>();
  
  Object.defineProperties(error, {
    message: { value: message, writable: true, configurable: true },
    name: { value: 'DirectiveError', writable: true, configurable: true },
    code: { value: code, writable: true, configurable: true }
  });
  
  return error;
}

/**
 * Creates a PathValidationError mock with proper prototype chain for instanceof checks
 * @param message Error message
 * @param path Path that failed validation
 * @returns A mocked PathValidationError
 */
export function createPathValidationErrorMock(message: string, path: string) {
  const error = mock<PathValidationError>();
  
  Object.defineProperties(error, {
    message: { value: message, writable: true, configurable: true },
    name: { value: 'PathValidationError', writable: true, configurable: true },
    path: { value: path, writable: true, configurable: true }
  });
  
  return error;
}

/**
 * Creates a mock LoggerService with default behavior
 * @returns A mocked ILogger
 */
export function createLoggerServiceMock() {
  const service = mock<ILogger>();
  // Provide no-op implementations for logging methods
  service.debug.mockImplementation(() => {});
  service.info.mockImplementation(() => {});
  service.warn.mockImplementation(() => {});
  service.error.mockImplementation(() => {});
  service.log.mockImplementation(() => {});
  service.setLogLevel.mockImplementation(() => {});
  // Add other methods if ILogger interface has them
  return service;
} 