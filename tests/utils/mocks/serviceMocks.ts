/**
 * Service Mock Factory Utilities
 * 
 * This file provides factory functions for creating mock services using vitest-mock-extended.
 * These factories ensure type safety while providing proper prototype chain inheritance for
 * instanceof checks in tests.
 */

import { mock } from 'vitest-mock-extended';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { DirectiveError } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { PathValidationError } from '@core/errors/PathValidationError.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import type { IStateService as ClonedState } from '@services/state/StateService/IStateService.js';

/**
 * Creates a mock ValidationService with default behavior
 * @returns A mocked IValidationService
 */
export function createValidationServiceMock() {
  const service = mock<IValidationService>();
  // Default behaviors
  service.validate.mockReturnValue(undefined);
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
  service.getOriginalNodes.mockReturnValue([]); // Keep original method if still present
  service.addNode.mockReturnValue(undefined);
  service.appendContent.mockReturnValue(undefined);
  service.getTransformedNodes.mockReturnValue([]);
  service.setTransformedNodes.mockReturnValue(undefined);
  service.transformNode.mockReturnValue(undefined);
  service.isTransformationEnabled.mockReturnValue(false);
  service.setTransformationEnabled.mockReturnValue(undefined);
  service.getTransformationOptions.mockReturnValue({});
  service.setTransformationOptions.mockReturnValue(undefined);
  service.addImport.mockReturnValue(undefined);
  service.removeImport.mockReturnValue(undefined);
  service.hasImport.mockReturnValue(false);
  service.getImports.mockReturnValue(new Set());
  service.getCurrentFilePath.mockReturnValue(null);
  service.setCurrentFilePath.mockReturnValue(undefined);
  service.hasLocalChanges.mockReturnValue(false);
  service.getLocalChanges.mockReturnValue([]);
  service.setImmutable.mockReturnValue(undefined);
  // service.isImmutable needs property mock if readonly
  Object.defineProperty(service, 'isImmutable', { get: () => false });
  service.createChildState.mockReturnValue(service); // Return self for simple cases
  service.mergeChildState.mockReturnValue(undefined);
  service.getVariable.mockReturnValue(undefined);
  service.setVariable.mockResolvedValue({} as any);
  service.hasVariable.mockReturnValue(false);
  service.removeVariable.mockResolvedValue(false);
  // service.getInternalStateNode.mockReturnValue({} as any);

  // Mock methods added from StateServiceLike
  service.enableTransformation = vi.fn();
  service.getNodes.mockReturnValue([]); // Replaces getOriginalNodes if renamed
  service.setCommand.mockResolvedValue({} as any);
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
  // Default behaviors
  service.resolveVariable.mockReturnValue('resolved-value');
  return service;
}

/**
 * Creates a mock FileSystemService with default behavior
 * @returns A mocked IFileSystemService
 */
export function createFileSystemServiceMock() {
  const service = mock<IFileSystemService>();
  // Default behaviors
  service.fileExists.mockResolvedValue(true);
  service.readFile.mockResolvedValue('file-contents');
  return service;
}

/**
 * Creates a mock PathService with default behavior
 * @returns A mocked IPathService
 */
export function createPathServiceMock() {
  const service = mock<IPathService>();
  // Default behaviors
  service.resolve.mockReturnValue('/resolved/path');
  service.isAbsolute.mockReturnValue(true);
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