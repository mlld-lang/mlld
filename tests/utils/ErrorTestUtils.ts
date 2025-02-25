import { expect } from 'vitest';
import { MeldError, ErrorSeverity } from '@core/errors/MeldError.js';
import { MeldResolutionError } from '@core/errors/MeldResolutionError.js';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import { MeldInterpreterError } from '@core/errors/MeldInterpreterError.js';
import { DirectiveError } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';

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