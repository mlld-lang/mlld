import { expect } from 'vitest';
import { MeldError, ErrorSeverity } from '@core/errors/MeldError';
import { MeldResolutionError } from '@core/errors/MeldResolutionError';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError';
import { MeldInterpreterError } from '@core/errors/MeldInterpreterError';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError';

/**
 * Error handler that collects errors for testing
 */
export class ErrorCollector {
  public errors: MeldError[] = [];
  public warnings: MeldError[] = [];

  /**
   * Error handler function that can be passed to services
   */
  public handleError = (error: MeldError): void => {
    if (error.severity === ErrorSeverity.Warning || 
        error.severity === ErrorSeverity.Recoverable) {
      this.warnings.push(error);
    } else {
      this.errors.push(error);
    }
  };

  /**
   * Reset the collector
   */
  public reset(): void {
    this.errors = [];
    this.warnings = [];
  }

  /**
   * Get all collected errors and warnings
   */
  public getAllErrors(): MeldError[] {
    return [...this.errors, ...this.warnings];
  }

  /**
   * Get errors of a specific type
   */
  public getErrorsOfType<T extends MeldError>(errorType: new (...args: any[]) => T): T[] {
    return this.getAllErrors().filter(error => error instanceof errorType) as T[];
  }

  /**
   * Get warnings of a specific type
   */
  public getWarningsOfType<T extends MeldError>(errorType: new (...args: any[]) => T): T[] {
    return this.warnings.filter(error => error instanceof errorType) as T[];
  }
}

/**
 * Test options for running tests in different error modes
 */
export interface ErrorModeTestOptions {
  strict?: boolean;
  errorHandler?: (error: MeldError) => void;
}

/**
 * Create test options for strict mode
 */
export function createStrictModeOptions(): ErrorModeTestOptions {
  return { strict: true };
}

/**
 * Create test options for permissive mode with an error collector
 */
export function createPermissiveModeOptions(collector: ErrorCollector): ErrorModeTestOptions {
  return {
    strict: false,
    errorHandler: collector.handleError
  };
}

/**
 * Assert that an error has the expected severity
 */
export function expectErrorSeverity(error: MeldError, severity: ErrorSeverity): void {
  expect(error.severity).toBe(severity);
}

/**
 * Assert that an error is a specific type with the expected severity
 */
export function expectErrorTypeAndSeverity<T extends MeldError>(
  error: unknown,
  errorType: new (...args: any[]) => T,
  severity: ErrorSeverity
): void {
  expect(error).toBeInstanceOf(errorType);
  expectErrorSeverity(error as MeldError, severity);
}

/**
 * Assert that a function throws an error with the expected severity
 */
export async function expectThrowsWithSeverity<T extends MeldError>(
  fn: () => Promise<any> | any,
  errorType: new (...args: any[]) => T,
  severity: ErrorSeverity
): Promise<void> {
  try {
    await fn();
    throw new Error(`Expected function to throw ${errorType.name} with severity ${severity}`);
  } catch (error) {
    expectErrorTypeAndSeverity(error, errorType, severity);
  }
}

/**
 * Assert that a function does not throw but generates warnings in permissive mode
 */
export async function expectWarningsInPermissiveMode<T extends MeldError>(
  fn: (options: ErrorModeTestOptions) => Promise<any> | any,
  errorType: new (...args: any[]) => T,
  expectedWarningCount = 1
): Promise<void> {
  const collector = new ErrorCollector();
  const options = createPermissiveModeOptions(collector);
  
  // Should not throw in permissive mode
  await fn(options);
  
  // Should have generated warnings
  expect(collector.warnings.length).toBe(expectedWarningCount);
  expect(collector.getWarningsOfType(errorType).length).toBeGreaterThan(0);
}

/**
 * Assert that a function throws in strict mode but only warns in permissive mode
 */
export async function expectThrowsInStrictButWarnsInPermissive<T extends MeldError>(
  fn: (options: ErrorModeTestOptions) => Promise<any> | any,
  errorType: new (...args: any[]) => T,
  severity: ErrorSeverity = ErrorSeverity.Recoverable
): Promise<void> {
  // Should throw in strict mode
  const strictOptions = createStrictModeOptions();
  await expectThrowsWithSeverity(
    () => fn(strictOptions),
    errorType,
    severity
  );
  
  // Should only warn in permissive mode
  await expectWarningsInPermissiveMode(fn, errorType);
}

/**
 * Helper to test DirectiveError with specific error code
 */
export function expectDirectiveErrorWithCode(
  error: unknown,
  errorCode: string,
  severity: ErrorSeverity
): void {
  expect(error).toBeInstanceOf(DirectiveError);
  const directiveError = error as DirectiveError;
  expect(directiveError.code).toBe(errorCode);
  expectErrorSeverity(directiveError, severity);
}

/**
 * Helper to test MeldResolutionError with specific details
 */
export function expectResolutionErrorWithDetails(
  error: unknown,
  details: Record<string, any>,
  severity: ErrorSeverity = ErrorSeverity.Recoverable
): void {
  expect(error).toBeInstanceOf(MeldResolutionError);
  const resolutionError = error as MeldResolutionError;
  expectErrorSeverity(resolutionError, severity);
  
  // Check that all expected details are present
  for (const [key, value] of Object.entries(details)) {
    expect(resolutionError.details?.[key]).toEqual(value);
  }
}

/**
 * Error testing configuration options
 */
export interface ErrorTestOptions {
  /**
   * The expected error type (class name)
   */
  type?: string;
  
  /**
   * The expected error code
   */
  code?: string;
  
  /**
   * The expected error severity
   */
  severity?: ErrorSeverity;
  
  /**
   * Whether the error message should contain this substring
   */
  messageContains?: string;
  
  /**
   * The exact error message to match
   */
  exactMessage?: string;
  
  /**
   * The directive kind for MeldDirectiveError
   */
  directiveKind?: string;
  
  /**
   * Whether the error should have a location
   */
  hasLocation?: boolean;
}

/**
 * Checks if an error matches the expected configuration
 * This provides more resilient error testing by focusing on properties
 * rather than exact message strings
 * 
 * @param error The error to check
 * @param options The expected error configuration
 * @returns void
 * @throws Test assertion error if the error doesn't match expectations
 */
export function checkError(error: unknown, options: ErrorTestOptions): void {
  // Verify the error is an object
  expect(error).toBeInstanceOf(Object);
  
  // Check error type
  if (options.type) {
    expect(error.constructor.name).toBe(options.type);
  }
  
  // Handle MeldError specific checks
  if (error instanceof MeldError) {
    if (options.code) {
      expect(error.code).toBe(options.code);
    }
    
    if (options.severity) {
      expect(error.severity).toBe(options.severity);
    }
    
    if (options.messageContains) {
      expect(error.message).toContain(options.messageContains);
    }
    
    if (options.exactMessage) {
      expect(error.message).toBe(options.exactMessage);
    }
  }
  
  // Handle MeldDirectiveError specific checks
  if (error instanceof MeldDirectiveError) {
    if (options.directiveKind) {
      expect(error.directiveKind).toBe(options.directiveKind);
    }
    
    if (options.hasLocation) {
      expect(error.location).toBeDefined();
      expect(error.location?.line).toBeGreaterThanOrEqual(0);
      expect(error.location?.column).toBeGreaterThanOrEqual(0);
    }
  }
}

/**
 * Convenience function to check if an error is a validation error
 */
export function expectValidationError(error: unknown): void {
  checkError(error, {
    type: 'MeldDirectiveError',
    code: DirectiveErrorCode.VALIDATION_FAILED,
    severity: ErrorSeverity.Fatal
  });
}

/**
 * Helper to easily assert a specific directive validation error
 */
export function expectDirectiveValidationError(
  error: unknown, 
  directiveKind: string, 
  messageContains?: string
): void {
  checkError(error, {
    type: 'MeldDirectiveError',
    code: DirectiveErrorCode.VALIDATION_FAILED,
    severity: ErrorSeverity.Fatal,
    directiveKind,
    messageContains,
    hasLocation: true
  });
}

/**
 * Async wrapper to test functions that should throw errors
 * This makes tests more readable than try/catch blocks
 * 
 * @param fn Function that should throw an error
 * @param options Options to verify the thrown error
 * @returns Promise that resolves when the test passes
 */
export async function expectToThrowWithConfig(
  fn: () => Promise<any>, 
  options: ErrorTestOptions
): Promise<void> {
  try {
    await fn();
    // If we get here, the function didn't throw
    expect.fail('Expected function to throw an error');
  } catch (error) {
    // Check if this is an assertion error from expect.fail
    if (error.name === 'AssertionError') {
      throw error;
    }
    
    // Otherwise check the actual error
    checkError(error, options);
  }
}

/**
 * Sync version of expectToThrowWithConfig
 */
export function expectToThrowWithConfigSync(
  fn: () => any, 
  options: ErrorTestOptions
): void {
  try {
    fn();
    // If we get here, the function didn't throw
    expect.fail('Expected function to throw an error');
  } catch (error) {
    // Check if this is an assertion error from expect.fail
    if (error.name === 'AssertionError') {
      throw error;
    }
    
    // Otherwise check the actual error
    checkError(error, options);
  }
}

/**
 * Specialized validation error checking for ValidationService tests
 * This makes tests more resilient to error message changes
 * 
 * @param error The error to check
 * @param directiveKind The directive kind (e.g., 'text', 'data', 'path')
 * @param code The error code (e.g., DirectiveErrorCode.VALIDATION_FAILED)
 * @param propertyName Optional property name that caused the validation error
 * @param severity The error severity (defaults to Fatal)
 */
export function expectValidationErrorWithDetails(
  error: unknown,
  directiveKind: string,
  code: string,
  propertyName?: string,
  severity: ErrorSeverity = ErrorSeverity.Fatal
): void {
  // Check basic error type
  expect(error).toBeInstanceOf(MeldDirectiveError);
  const directiveError = error as MeldDirectiveError;
  
  // Check properties regardless of exact message
  expect(directiveError.directiveKind).toBe(directiveKind);
  expect(directiveError.code).toBe(code);
  expect(directiveError.severity).toBe(severity);
  
  // If property name is specified, check that it's mentioned in the message
  if (propertyName) {
    expect(directiveError.message.toLowerCase()).toContain(propertyName.toLowerCase());
  }
}

/**
 * Test a validation function expecting it to throw an error with specific attributes
 * 
 * @param validationFn The validation function to test
 * @param directiveKind The expected directive kind in the error
 * @param code The expected error code
 * @param propertyName Optional property name that caused the validation error
 * @param severity The expected severity
 */
export function expectValidationToThrowWithDetails(
  validationFn: () => any,
  directiveKind: string,
  code: string,
  propertyName?: string,
  severity: ErrorSeverity = ErrorSeverity.Fatal
): void {
  try {
    validationFn();
    throw new Error(`Expected validation function to throw MeldDirectiveError for ${directiveKind}`);
  } catch (error) {
    expectValidationErrorWithDetails(error, directiveKind, code, propertyName, severity);
  }
}

/**
 * Asynchronous version of expectValidationToThrowWithDetails
 */
export async function expectValidationToThrowWithDetailsAsync(
  validationFn: () => Promise<any>,
  directiveKind: string,
  code: string,
  propertyName?: string,
  severity: ErrorSeverity = ErrorSeverity.Fatal
): Promise<void> {
  try {
    await validationFn();
    throw new Error(`Expected validation function to throw MeldDirectiveError for ${directiveKind}`);
  } catch (error) {
    expectValidationErrorWithDetails(error, directiveKind, code, propertyName, severity);
  }
} 