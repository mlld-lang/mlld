// ==============================
// CORE TYPE LAYER (Required by all services)
// ==============================

/**
 * Base interface for all embed directive types
 */
interface BaseEmbedDirective {
  // Core identification
  id: string;                                          // Unique node identifier
  type: 'EmbedDirective';                              // Constant type identifier
  subtype: 'embedPath' | 'embedVariable' | 'embedTemplate'; // Discriminator
  
  // Source information
  rawDirectiveText: string;                            // Original directive text (for ValidationService)
  syntaxType: 'bracketPath' | 'variableReference' | 'doubleBracketTemplate'; // Raw syntax type (for ParserService)
  
  // Location tracking
  location: {
    start: { line: number; column: number; offset: number; };
    end: { line: number; column: number; offset: number; };
    source?: string;                                  // Source file path
  };
  
  // Base state information
  stateInfo: {
    stateId: string;                                  // Unique state identifier
    parentStateId?: string;                           // Parent state if any
    createsChildState: boolean;                       // Whether processing creates a child state
  };
  
  // Transformation status
  transformStatus: 'pending' | 'processing' | 'transformed' | 'error';
  
  // Extension points for service-specific metadata
  resolutionMetadata?: ResolutionMetadata;            // For ResolutionService
  transformationMetadata?: TransformationMetadata;    // For InterpreterService
  outputMetadata?: OutputMetadata;                    // For OutputService
  validationMetadata?: ValidationMetadata;            // For ValidationService
  
  // Debug metadata - conditionally included based on env
  debugMetadata?: DebugMetadata;                      // For all debug services
}

/**
 * Path-based embed directive
 */
interface EmbedPathDirective extends BaseEmbedDirective {
  subtype: 'embedPath';
  path: string;                                       // The path expression
  resolvedPath?: string;                              // Path after resolution
  pathHasVariables: boolean;                          // Whether path contains variable references
}

/**
 * Variable-based embed directive
 */
interface EmbedVariableDirective extends BaseEmbedDirective {
  subtype: 'embedVariable';
  variable: {
    name: string;                                     // Variable name
    originalReference: string;                        // Complete original reference (e.g., {{var.field}})
    valueType: 'text' | 'data';                       // Type of variable
    accessPath?: {                                    // Field access information
      segments: Array<{
        type: 'property' | 'index';
        value: string | number;
      }>;
      original: string;                               // Original access syntax
    };
  };
}

/**
 * Template-based embed directive
 */
interface EmbedTemplateDirective extends BaseEmbedDirective {
  subtype: 'embedTemplate';
  template: string;                                   // Original template text
  processedTemplate?: string;                         // Template after newline processing
  firstNewlineStripped: boolean;                      // Whether first newline was removed
  variableReferences: Array<{                         // Detected variable references
    reference: string;                                // Full reference with braces
    start: number;                                    // Position in template
    end: number;
    resolved?: boolean;                               // Whether it's been resolved
  }>;
}

// ==============================
// SERVICE-SPECIFIC METADATA LAYER (Optional extensions)
// ==============================

/**
 * Metadata for ResolutionService
 */
interface ResolutionMetadata {
  context: {
    disablePathPrefixing: boolean;
    allowedVariableTypes: {
      text: boolean;
      data: boolean;
      path: boolean;
      command: boolean;
    };
    allowNested: boolean;
  };
  status: 'pending' | 'resolving' | 'resolved' | 'error';
  resolutionError?: string;
  resolvedValue?: any;
  dependencyTracking?: {
    variables: string[];
    files: string[];
    executionChain: string[];
  };
}

/**
 * Metadata for InterpreterService
 */
interface TransformationMetadata {
  replacementInfo: {
    nodeId?: string;
    replacementNodes?: string[];
    transformationTime?: number;
  };
  contentInfo: {
    resolvedContent?: string;
    contentType?: 'text' | 'markdown' | 'code' | 'html';
  };
  variableCopyRules: {
    copyMode: 'none' | 'all' | 'selective';
    variableTypes: ('text' | 'data' | 'path' | 'command')[];
    skipExistingVariables: boolean;
  };
}

/**
 * Metadata for OutputService
 */
interface OutputMetadata {
  contentFormat: 'text' | 'markdown' | 'code' | 'html';
  needsVariableResolution: boolean;
  pendingVariables?: string[];
  outputOptions: {
    escapeHtml: boolean;
    renderAsBlock: boolean;
    preserveNewlines: boolean;
    targetFormat?: 'markdown' | 'llm' | string;
  };
  errorHandling: {
    onResolutionFailure: 'throw' | 'preserve' | 'empty';
    onTransformationFailure: 'throw' | 'original' | 'empty';
  };
}

/**
 * Metadata for ValidationService
 */
interface ValidationMetadata {
  validationStatus: 'pending' | 'valid' | 'invalid';
  validationErrors?: string[];
  validationRules?: string[];
}

// ==============================
// DEBUG LAYER (Optional, for development only)
// ==============================

/**
 * Combined debug metadata
 */
interface DebugMetadata {
  // State tracking
  stateTracking?: {
    parentStates: string[];
    childStates: string[];
    siblingStates?: string[];
    stateLineage: string[];
    variablesDefined: string[];
    variablesAccessed: string[];
  };
  
  // Event system
  eventTracking?: {
    eventTypes: string[];
    eventBubbling: boolean;
    eventSubscribers: string[];
    eventPropagation: {
      bubbleEvents: boolean;
      captureEvents: boolean;
      crossBoundary: boolean;
    };
  };
  
  // Performance
  performance?: {
    timestamps: {
      created: number;
      processed?: number;
      transformed?: number;
      completed?: number;
    };
    metrics: {
      processingTime?: number;
      resolutionTime?: number;
      transformationTime?: number;
    };
  };
  
  // Visualization
  visualization?: {
    variableFlow: {
      source: Array<{ stateId: string; variableName: string; }>;
      target: Array<{ stateId: string; variableName: string; }>;
    };
    transformationChain: {
      originalNodeId: string;
      intermediateNodeIds: string[];
      finalNodeIds: string[];
    };
  };
}

// ==============================
// UTILITY TYPES (For integration)
// ==============================

/**
 * Factory type for creating service-specific metadata
 */
interface MetadataFactory<T> {
  create(): T;
  createFromExisting(existing: Partial<T>): T;
}

/**
 * Type for type-safe access to extended metadata
 */
type WithMetadata<T extends BaseEmbedDirective, M> = T & { 
  [K in keyof M]: M[K] 
};