import { ServiceName } from '../types/dependencies.js';

/**
 * Error codes specific to service initialization failures
 */
export enum ServiceInitializationErrorCode {
  MISSING_REQUIRED_SERVICE = 'MISSING_REQUIRED_SERVICE',
  MISSING_DEPENDENCIES = 'MISSING_DEPENDENCIES',
  INVALID_INITIALIZATION_ORDER = 'INVALID_INITIALIZATION_ORDER',
  TRANSFORMATION_SUPPORT_MISSING = 'TRANSFORMATION_SUPPORT_MISSING',
  INVALID_SERVICE_STATE = 'INVALID_SERVICE_STATE'
}

/**
 * Context information for service initialization errors
 */
export interface ServiceInitializationErrorContext {
  service: ServiceName;
  missingDependencies?: ServiceName[];
  requiredServices?: ServiceName[];
  transformationCapability?: string;
  state?: Record<string, unknown>;
}

/**
 * Error thrown when service initialization fails
 */
export class ServiceInitializationError extends Error {
  public readonly code: ServiceInitializationErrorCode;
  public readonly context: ServiceInitializationErrorContext;

  constructor(
    code: ServiceInitializationErrorCode,
    context: ServiceInitializationErrorContext,
    message?: string
  ) {
    // Generate default message if none provided
    const defaultMessage = ServiceInitializationError.getDefaultMessage(code, context);
    super(message || defaultMessage);

    this.name = 'ServiceInitializationError';
    this.code = code;
    this.context = context;
  }

  /**
   * Generate a default error message based on the error code and context
   */
  private static getDefaultMessage(
    code: ServiceInitializationErrorCode,
    context: ServiceInitializationErrorContext
  ): string {
    switch (code) {
      case ServiceInitializationErrorCode.MISSING_REQUIRED_SERVICE:
        return `Missing required service: ${context.service}`;

      case ServiceInitializationErrorCode.MISSING_DEPENDENCIES:
        return `Service ${context.service} is missing dependencies: ${
          context.missingDependencies?.join(', ') || 'unknown'
        }`;

      case ServiceInitializationErrorCode.INVALID_INITIALIZATION_ORDER:
        return `Invalid initialization order for service ${context.service}. Required services must be initialized first: ${
          context.requiredServices?.join(', ') || 'unknown'
        }`;

      case ServiceInitializationErrorCode.TRANSFORMATION_SUPPORT_MISSING:
        return `Service ${context.service} lacks required transformation capability: ${
          context.transformationCapability || 'unknown'
        }`;

      case ServiceInitializationErrorCode.INVALID_SERVICE_STATE:
        return `Service ${context.service} is in an invalid state`;

      default:
        return `Service initialization failed for ${context.service}`;
    }
  }
} 