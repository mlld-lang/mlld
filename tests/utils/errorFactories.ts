/**
 * Error factory functions for creating test error instances
 * Uses vitest-mock-extended to ensure instanceof checks pass
 */
import { mock } from 'vitest-mock-extended';
import { Location } from '@core/syntax/types';
import { PathValidationError, PathErrorCode } from '@services/fs/PathService/errors/PathValidationError';

/**
 * Details for creating a PathValidationError
 */
export interface PathValidationErrorDetails {
  code: PathErrorCode;
  path: string;
  resolvedPath?: string;
  baseDir?: string;
  cause?: Error;
}

/**
 * Enhanced mock function that ensures proper prototype chain for instanceof checks
 */
function mockWithPrototype<T>(constructor: new (...args: any[]) => T): T {
  // Create the mock instance
  const mockInstance = mock<T>();
  
  // Set the prototype to ensure instanceof works
  Object.setPrototypeOf(mockInstance, constructor.prototype);
  
  return mockInstance;
}

/**
 * Creates a mock PathValidationError that passes instanceof checks
 * 
 * @param message Error message
 * @param details Path validation error details
 * @param location Optional source location
 * @returns A mock PathValidationError that passes instanceof checks
 */
export function createPathValidationError(
  message: string,
  details: PathValidationErrorDetails,
  location?: Location
): PathValidationError {
  // Create a mock with the correct prototype chain
  const error = mockWithPrototype(PathValidationError);
  
  // Define properties to match the real PathValidationError
  Object.defineProperties(error, {
    message: { value: message, writable: true, configurable: true },
    name: { value: 'PathValidationError', writable: true, configurable: true },
    code: { value: details.code, writable: true, configurable: true },
    path: { value: details.path, writable: true, configurable: true },
    resolvedPath: { value: details.resolvedPath, writable: true, configurable: true },
    baseDir: { value: details.baseDir, writable: true, configurable: true },
    cause: { value: details.cause, writable: true, configurable: true },
    location: { value: location, writable: true, configurable: true },
    stack: { value: new Error().stack, writable: true, configurable: true }
  });
  
  return error;
}

/**
 * Helper for throwing a PathValidationError in tests
 * 
 * @param message Error message
 * @param details Path validation error details
 * @param location Optional source location
 */
export function throwPathValidationError(
  message: string,
  details: PathValidationErrorDetails,
  location?: Location
): never {
  throw createPathValidationError(message, details, location);
} 