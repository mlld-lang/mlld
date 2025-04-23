import { injectable } from 'tsyringe';
import { Service } from '@core/ServiceProvider';
import { VariableReferenceResolver } from '@services/resolution/ResolutionService/resolvers/VariableReferenceResolver';
import { 
  FieldAccessOptions, 
  IVariableReferenceResolverClient 
} from '@services/resolution/ResolutionService/interfaces/IVariableReferenceResolverClient';
import { resolutionLogger as logger } from '@core/utils/logger';
import { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService';

/**
 * Factory for creating variable reference resolver clients
 * This factory is used to break the circular dependency between ResolutionService and VariableReferenceResolver
 * and provides enhanced field access capabilities.
 */
@injectable()
@Service({
  description: 'Factory for creating variable reference resolver clients with enhanced field access'
})
export class VariableReferenceResolverClientFactory {
  /**
   * Creates a new VariableReferenceResolverClientFactory
   * @param variableReferenceResolver - The variable reference resolver to create clients for
   */
  constructor(private variableReferenceResolver: VariableReferenceResolver) {}
  
  /**
   * Creates a client for the variable reference resolver with enhanced field access support
   * @returns A client that provides variable reference resolver functionality
   */
  createClient(): IVariableReferenceResolverClient {
    logger.debug('Creating enhanced VariableReferenceResolverClient');
    
    return {
      /**
       * Resolves all variable references in the given text
       */
      resolve: (text: string, context: ResolutionContext): Promise<string> => {
        return this.variableReferenceResolver.resolve(text, context);
      },
      
      /**
       * Resolve a field access expression
       */
      resolveFieldAccess: (
        varName: string, 
        fieldPath: string, 
        context: ResolutionContext,
        options?: FieldAccessOptions
      ): Promise<any> => {
        // Get the preserve type flag - default to false
        const preserveType = options?.preserveType ?? false;
        
        // Call the resolver's method with enhanced options support
        return this.variableReferenceResolver.resolveFieldAccess(
          varName, 
          fieldPath, 
          context, 
          preserveType
        ).then(value => {
          // If using type preservation, make a deep copy to preserve the array/object
          if (preserveType && value !== null && value !== undefined) {
            if (Array.isArray(value)) {
              return [...value]; // Return a copy of the array
            } else if (typeof value === 'object') {
              return {...value}; // Return a copy of the object
            }
          }
          return value;
        });
      },
      
      /**
       * Access fields in an object using field path
       */
      accessFields: (
        baseValue: any,
        fieldPath: string,
        context: ResolutionContext,
        options?: FieldAccessOptions
      ): Promise<any> => {
        // Parse the field path into field access objects
        const fields = fieldPath.split('.').map(field => {
          // Check if this is a numeric index
          const numIndex = parseInt(field, 10);
          if (!isNaN(numIndex)) {
            return { type: 'index' as const, value: numIndex };
          }
          // Otherwise it's a field name
          return { type: 'field' as const, value: field };
        });
        
        // Call the underlying method with the parsed fields
        // The type assertion is needed because the Field type is internal to the resolver
        return this.variableReferenceResolver.accessFields(
          baseValue, 
          fields as any, 
          context, 
          options?.variableName || 'anonymous'
        ).then(result => {
          // If preserveType is true, return the raw value
          if (options?.preserveType) {
            return result;
          }
          
          // Otherwise convert to string with the appropriate formatting
          return this.variableReferenceResolver.convertToString(result);
        });
      },
      
      /**
       * Convert a value to string with context-aware formatting
       */
      convertToString: (value: any, options?: FieldAccessOptions): string => {
        // Enhanced convertToString with formatting context awareness
        if (options?.formattingContext) {
          // Call the resolver with the formatting context
          return this.variableReferenceResolver.convertToString(value, options.formattingContext);
        }
        
        // Default string conversion
        return this.variableReferenceResolver.convertToString(value);
      },
      
      /**
       * Extract variable references from text
       */
      extractReferences: (text: string): Promise<string[]> => {
        return this.variableReferenceResolver.extractReferencesAsync(text);
      },
      
      /**
       * Set the resolution tracker for debugging
       */
      setResolutionTracker: (tracker) => {
        this.variableReferenceResolver.setResolutionTracker(tracker);
      }
    };
  }
} 