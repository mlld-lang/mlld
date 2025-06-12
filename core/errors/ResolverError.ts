import { MlldError, ErrorSeverity, BaseErrorDetails } from '@core/errors/MlldError';
import { ResolutionContext } from '@core/resolvers/types';

/**
 * Error codes for resolver operations
 */
export enum ResolverErrorCode {
  NOT_FOUND = 'E_RESOLVER_NOT_FOUND',
  UNSUPPORTED_CONTEXT = 'E_RESOLVER_UNSUPPORTED_CONTEXT',
  UNSUPPORTED_CAPABILITY = 'E_RESOLVER_UNSUPPORTED_CAPABILITY', 
  READONLY = 'E_RESOLVER_READONLY',
  INVALID_FORMAT = 'E_RESOLVER_INVALID_FORMAT',
  RESOLUTION_FAILED = 'E_RESOLVER_RESOLUTION_FAILED',
  NAME_PROTECTED = 'E_RESOLVER_NAME_PROTECTED',
  GENERIC = 'E_RESOLVER_ERROR'
}

/**
 * Error details for resolver operations
 */
export interface ResolverErrorDetails extends BaseErrorDetails {
  /**
   * The resolver that generated the error
   */
  resolverName?: string;
  
  /**
   * The reference that failed to resolve
   */
  reference?: string;
  
  /**
   * The context where resolution was attempted
   */
  context?: ResolutionContext;
  
  /**
   * The operation that failed
   */
  operation?: 'resolve' | 'write' | 'list' | 'validate';
  
  /**
   * Capability that was required but not supported
   */
  missingCapability?: string;
  
  /**
   * Available resolvers that could handle the context
   */
  availableResolvers?: string[];
  
  /**
   * Suggested format if format was invalid
   */
  suggestedFormat?: string;
  
  /**
   * Original error if wrapping another error
   */
  originalError?: Error;
}

/**
 * Error thrown by resolver operations
 */
export class ResolverError extends MlldError {
  public readonly details: ResolverErrorDetails;

  constructor(
    message: string, 
    code: ResolverErrorCode = ResolverErrorCode.GENERIC,
    details: ResolverErrorDetails = {}
  ) {
    super(message, {
      code,
      severity: details.originalError ? ErrorSeverity.Fatal : ErrorSeverity.Recoverable,
      details,
      cause: details.originalError
    });
    this.details = details;
    this.name = 'ResolverError';
  }

  /**
   * Create error for missing resolver
   */
  static notFound(reference: string, context?: ResolutionContext): ResolverError {
    const contextMsg = context ? ` in ${context} context` : '';
    return new ResolverError(
      `No resolver found for reference '${reference}'${contextMsg}`,
      { reference, context, operation: 'resolve' }
    );
  }

  /**
   * Create error for unsupported capability
   */
  static unsupportedCapability(
    resolverName: string, 
    capability: string, 
    context?: ResolutionContext
  ): ResolverError {
    return new ResolverError(
      `Resolver '${resolverName}' does not support ${capability}`,
      { 
        resolverName, 
        context, 
        missingCapability: capability,
        operation: 'validate' 
      }
    );
  }

  /**
   * Create error for invalid format
   */
  static invalidFormat(
    resolverName: string, 
    format: string, 
    supportedFormats: string[]
  ): ResolverError {
    const suggestedFormat = supportedFormats[0] || 'default';
    return new ResolverError(
      `Resolver '${resolverName}' does not support format '${format}'. Supported formats: ${supportedFormats.join(', ')}`,
      {
        resolverName,
        operation: 'resolve',
        suggestedFormat
      }
    );
  }

  /**
   * Create error for resolution failure
   */
  static resolutionFailed(
    resolverName: string, 
    reference: string, 
    originalError: Error
  ): ResolverError {
    return new ResolverError(
      `${resolverName} failed to resolve '${reference}': ${originalError.message}`,
      {
        resolverName,
        reference,
        operation: 'resolve',
        originalError
      }
    );
  }

  /**
   * Create error for name protection violation
   */
  static nameProtected(name: string, isVariable: boolean = true): ResolverError {
    const type = isVariable ? 'variable' : 'import alias';
    return new ResolverError(
      `Cannot use '${name}' as ${type} name - it is a reserved resolver name`,
      {
        reference: name,
        operation: 'validate'
      }
    );
  }

  /**
   * Get formatted error message with attribution
   */
  getFormattedMessage(): string {
    const parts: string[] = [this.message];
    
    if (this.details.resolverName) {
      parts.push(`Resolver: ${this.details.resolverName}`);
    }
    
    if (this.details.context) {
      parts.push(`Context: ${this.details.context}`);
    }
    
    if (this.details.missingCapability) {
      parts.push(`Missing capability: ${this.details.missingCapability}`);
    }
    
    if (this.details.availableResolvers && this.details.availableResolvers.length > 0) {
      parts.push(`Available resolvers: ${this.details.availableResolvers.join(', ')}`);
    }
    
    if (this.details.suggestedFormat) {
      parts.push(`💡 Try using format: ${this.details.suggestedFormat}`);
    }
    
    return parts.join('\n  ');
  }

  /**
   * Get helpful suggestions based on error type
   */
  getSuggestions(): string[] {
    const suggestions: string[] = [];
    
    if (this.details.operation === 'resolve' && !this.details.resolverName) {
      suggestions.push('Check that the module or resolver is installed');
      suggestions.push('Verify the reference syntax is correct');
      if (this.details.reference?.startsWith('@')) {
        suggestions.push('For modules, use: @author/module');
        suggestions.push('For built-in resolvers, use: @TIME, @DEBUG, @INPUT, or @PROJECTPATH');
      }
    }
    
    if (this.details.missingCapability === 'supportsImports') {
      suggestions.push(`This resolver can only be used in path contexts, not imports`);
      suggestions.push(`Try using it with @path directive instead`);
    }
    
    if (this.details.missingCapability === 'supportsPaths') {
      suggestions.push(`This resolver can only be used in import contexts, not paths`);
      suggestions.push(`Try using it with @import directive instead`);
    }
    
    if (this.details.operation === 'validate' && this.message.includes('reserved resolver name')) {
      suggestions.push('Choose a different name that doesn\'t conflict with built-in resolvers');
      suggestions.push('Built-in resolver names: TIME, DEBUG, INPUT, PROJECTPATH');
    }
    
    return suggestions;
  }
}