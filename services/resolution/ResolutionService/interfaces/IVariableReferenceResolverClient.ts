import { VariableResolutionTracker } from '@tests/utils/debug/VariableResolutionTracker/index';
import { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService';

/**
 * Interface for field access configuration
 */
export interface FieldAccessOptions {
  /**
   * Whether to preserve the original type of the result (if possible)
   * When true, returns the actual value instead of string conversion
   */
  preserveType?: boolean;
  
  /**
   * Variable name for error reporting when accessing fields directly
   */
  variableName?: string;
  
  /**
   * Formatting context for the field access
   * Used to apply the correct formatting rules based on surrounding context
   */
  formattingContext?: {
    /**
     * Whether this is in a block context (true) or inline context (false)
     */
    isBlock?: boolean;
    
    /**
     * The node type that contains this value
     */
    nodeType?: string;
    
    /**
     * Current line position (start of line, middle, end)
     */
    linePosition?: 'start' | 'middle' | 'end';
    
    /**
     * Whether this is in transformation mode
     */
    isTransformation?: boolean;
  };
}

/**
 * Client interface for VariableReferenceResolver functionality
 * This enhanced interface supports comprehensive field access and type handling
 */
export interface IVariableReferenceResolverClient {
  /**
   * Resolves all variable references in the given text
   * @param text - Text containing variable references like {{varName}}
   * @param context - Resolution context
   * @returns Resolved text with all variables replaced with their values
   */
  resolve(text: string, context: ResolutionContext): Promise<string>;

  /**
   * Resolve a field access expression like varName.field1.field2
   * @param varName - Base variable name
   * @param fieldPath - Dot-notation field path (e.g., "field1.field2")
   * @param context - Resolution context
   * @param options - Optional field access options
   * @returns Resolved field value (preserves type if options.preserveType is true)
   */
  resolveFieldAccess(
    varName: string, 
    fieldPath: string, 
    context: ResolutionContext,
    options?: FieldAccessOptions
  ): Promise<any>;

  /**
   * Access fields in an object using field path
   * @param baseValue - The base value to access fields from
   * @param fieldPath - Dot-notation field path (e.g., "field1.field2")
   * @param context - Resolution context
   * @param options - Optional field access options
   * @returns Field value (preserves type if options.preserveType is true)
   */
  accessFields(
    baseValue: any,
    fieldPath: string,
    context: ResolutionContext,
    options?: FieldAccessOptions
  ): Promise<any>;

  /**
   * Convert a value to string with context-aware formatting
   * @param value - The value to convert
   * @param options - Optional field access options with formatting context
   * @returns String representation of the value formatted according to context
   */
  convertToString(
    value: any,
    options?: FieldAccessOptions
  ): string;

  /**
   * Extract variable references from text
   * @param text - Text containing variable references
   * @returns Array of variable base names used in the text
   */
  extractReferences(text: string): Promise<string[]>;

  /**
   * Set the resolution tracker for debugging
   * @param tracker - The resolution tracker to set
   */
  setResolutionTracker(tracker: VariableResolutionTracker): void;
}