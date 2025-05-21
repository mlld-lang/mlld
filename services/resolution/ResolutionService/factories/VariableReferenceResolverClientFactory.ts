import { injectable } from 'tsyringe';
import { Service } from '@core/ServiceProvider';
import { VariableReferenceResolver } from '@services/resolution/ResolutionService/resolvers/VariableReferenceResolver';
import { 
  FieldAccessOptions, 
  IVariableReferenceResolverClient 
} from '@services/resolution/ResolutionService/interfaces/IVariableReferenceResolverClient';
import { resolutionLogger as logger } from '@core/utils/logger';
import { ResolutionContext } from '@core/types/resolution';
import { JsonValue } from '@core/types/common';
import { Field } from '@core/ast/types/shared-types';
import { ParserServiceClientFactory } from '@services/pipeline/ParserService/factories/ParserServiceClientFactory';
import { IParserServiceClient } from '@services/pipeline/ParserService/interfaces/IParserServiceClient';
import { MeldNode, TextNode, VariableReferenceNode } from '@core/ast/types/index';
import { ResolutionContextFactory } from '../ResolutionContextFactory';
import { IVariableReference } from '@core/ast/types/interfaces/IVariableReference';
import { createVariableReferenceNode } from '@core/ast/types/variables';
import { VariableType } from '@core/types/variables';

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
  private parserClient?: IParserServiceClient;

  /**
   * Creates a new VariableReferenceResolverClientFactory
   * @param variableReferenceResolver - The variable reference resolver to create clients for
   * @param parserServiceClientFactory - Factory for creating parser service clients
   */
  constructor(
    private variableReferenceResolver: VariableReferenceResolver,
    private parserServiceClientFactory: ParserServiceClientFactory
  ) {
    this.initializeParserClient();
  }

  private initializeParserClient(): void {
    try {
      this.parserClient = this.parserServiceClientFactory.createClient();
      logger.debug('Successfully created ParserServiceClient');
    } catch (error) {
      logger.warn('Failed to create ParserServiceClient', { error });
    }
  }
  
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
      resolve: async (text: string, context: ResolutionContext): Promise<string> => {
        // Create a variable reference node for the text
        const varRefNode = createVariableReferenceNode(
          text,
          VariableType.TEXT,
          [], // No fields
          undefined, // No format
          {
            start: { line: 0, column: 0 },
            end: { line: 0, column: 0 }
          }
        );

        return await this.variableReferenceResolver.resolve(varRefNode, context);
      },
      
      /**
       * Resolve a field access expression
       */
      resolveFieldAccess: async (
        varName: string, 
        fieldPath: string, 
        context: ResolutionContext,
        options?: FieldAccessOptions
      ): Promise<any> => {
        // Create a variable reference node using the helper function
        const varRefNode = createVariableReferenceNode(
          varName,
          VariableType.DATA,
          [], // No fields in the node since we'll process them separately
          undefined, // No format
          {
            start: { line: 0, column: 0 },
            end: { line: 0, column: 0 }
          }
        );

        // Get the base variable value first
        const baseValue = await this.variableReferenceResolver.resolve(varRefNode, context);

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

        const result = await this.variableReferenceResolver.accessFields(
          baseValue as JsonValue, 
          fields as Field[], 
          varName,
          context
        );

        if (!result.success) {
          throw result.error;
        }

        return result.value;
      },
      
      /**
       * Access fields in an object using field path
       */
      accessFields: async (
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
        
        const result = await this.variableReferenceResolver.accessFields(
          baseValue as JsonValue, 
          fields as Field[], 
          options?.variableName || 'anonymous',
          context
        );

        if (!result.success) {
          throw result.error;
        }

        const value = result.value;

        // If preserveType is true, return the raw value
        if (options?.preserveType) {
          return value;
        }
        
        // Otherwise convert to string with the appropriate formatting
        return this.variableReferenceResolver.convertToString(value, context);
      },
      
      /**
       * Convert a value to string with context-aware formatting
       */
      convertToString: (value: any, options?: FieldAccessOptions): string => {
        // Create a minimal context for string conversion
        const context = ResolutionContextFactory.create(this.variableReferenceResolver.getStateService())
          .withFlags({ processNestedVariables: false });

        return this.variableReferenceResolver.convertToString(value, context);
      },
      
      /**
       * Extract variable references from text using AST parsing
       */
      extractReferences: async (text: string): Promise<string[]> => {
        if (!this.parserClient) {
          logger.warn('ParserServiceClient not available for variable reference extraction');
          return [];
        }

        try {
          // Parse the text into AST nodes
          const nodes = await this.parserClient.parseString(text);

          // Extract unique variable identifiers from VariableReferenceNodes
          const references = new Set<string>();
          for (const node of nodes) {
            if (node.type === 'VariableReference') {
              const varNode = node as VariableReferenceNode;
              // Get the base variable name (before any field access)
              const baseName = varNode.identifier.split('.')[0];
              references.add(baseName);
            }
          }

          return Array.from(references);
        } catch (error) {
          logger.error('Failed to parse text for variable references', { error });
          return [];
        }
      },
      
      /**
       * Set the resolution tracker for debugging
       */
      setResolutionTracker: (tracker) => {
        this.variableReferenceResolver.setTracker(tracker);
      }
    };
  }
} 