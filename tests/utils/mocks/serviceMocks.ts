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
  // Default behaviors
  service.clone.mockReturnValue({} as ClonedState);
  // Ensure getPathVar is defined with default behavior
  service.getPathVar.mockImplementation((name) => undefined);
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