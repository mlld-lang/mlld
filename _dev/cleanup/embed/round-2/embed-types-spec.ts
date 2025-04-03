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
  originalAstNode?: DirectiveNode;                     // Reference to the original AST node
  
  // Location tracking
  location: {
    start: { line: number; column: number; offset: number; };
    end: { line: number; column: number; offset: number; };
    source?: string;                                  // Source file path
    contentRange?: {                                  // Range of just the directive content (not including @embed prefix)
      start: { line: number; column: number; offset: number; };
      end: { line: number; column: number; offset: number; };
    };
    offsetType: 'character';                          // Specify that offsets are character-based, not byte-based
  };
  
  // Base state information
  stateInfo: {
    stateId: string;                                  // Unique state identifier
    parentStateId?: string;                           // Parent state if any
    createsChildState: boolean;                       // Whether processing creates a child state
    childStateId?: string;                            // Reference to created child state
    inheritanceConfig?: {                             // Basic inheritance control
      inheritVariables: boolean;
      skipExistingVariables: boolean;
    };
  };
  
  // Transformation status
  transformStatus: 'pending' | 'processing' | 'transformed' | 'error';
  
  // Extension points for service-specific metadata
  resolutionMetadata?: ResolutionMetadata;            // For ResolutionService
  transformationMetadata?: TransformationMetadata;    // For InterpreterService
  outputMetadata?: OutputMetadata;                    // For OutputService
  validationMetadata?: ValidationMetadata;            // For ValidationService
  eventMetadata?: EventMetadata;                      // For EventService
  
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
  pathVariables?: string[];                           // List of path variables (e.g., ["HOME", "PROJECT"])
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
  variableReferences: Array<{                         // Enhanced variable references in templates
    reference: string;                                // Full reference with braces
    variableName: string;                             // Just the variable name
    accessPath?: {                                    // Field access information
      segments: Array<{
        type: 'property' | 'index';
        value: string | number;
      }>;
      original: string;                               // Original access syntax
    };
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
    currentFilePath: string;                          // Critical for resolving relative paths
    disablePathPrefixing: boolean;
    allowedVariableTypes: {
      text: boolean;
      data: boolean;
      path: boolean;
      command: boolean;
    };
    allowNested: boolean;
    resolutionMode: 'strict' | 'relaxed';             // Controls resolution failure behavior
    baseDirectory?: string;                           // Base for path resolution
  };
  status: 'pending' | 'resolving' | 'resolved' | 'error' | 'cached';
  resolutionError?: string;
  resolvedValue?: any;
  dependencyTracking?: {
    variables: string[];
    files: string[];
    executionChain: string[];
  };
  circularityStatus?: {                               // Track circularity for better error reporting
    isCircular: boolean;
    circularPath?: string[];
  };
  resolutionChain?: string[];                         // Track resolution path for debugging
}

/**
 * Metadata for InterpreterService
 */
interface TransformationMetadata {
  transformationPhase?: 'validation' | 'resolution' | 'handler-processing' | 'node-replacement' | 'complete';
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
  handlerResult?: {                                   // Separate directive processing results from transformation
    success: boolean;
    processingTime?: number;
    errorDetails?: string;
  };
  featureFlags?: {                                    // Critical feature flags for transformation
    resolveVariablesInOutput: boolean;
    enableTransformation: boolean;
    transformDirectiveDefinitions: boolean;
  };
  phaseErrors?: {                                     // Error tracking by phase
    validation?: string[];
    resolution?: string[];
    processing?: string[];
    replacement?: string[];
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
  architectureModel: 'traditional' | 'delegated';     // Support for different architecture models
  delegatedResolution?: {                             // For delegated architecture
    useResolutionServiceClient: boolean;
    clientFactoryToken?: string;
  };
  resolutionContext?: {                               // Context for variable resolution
    disablePathPrefixing: boolean;
    allowHtmlEscaping: boolean;
    scopedStateId?: string;
    variableTypes: {
      text: boolean;
      data: boolean;
      path: boolean;
      command: boolean;
    };
  };
}

/**
 * Metadata for ValidationService
 */
interface ValidationMetadata {
  validationStatus: 'pending' | 'valid' | 'invalid';
  validationErrors?: string[];
  validationRules?: Array<{                           // Enhanced validation rules
    ruleName: string;
    ruleType: 'syntax' | 'semantic' | 'security';
    severity: 'error' | 'warning';
    context?: Record<string, any>;
  }>;
  embedTypeValidation?: {                             // Type-specific validation rules
    // For embedPath
    path?: {
      allowedPrefixes?: string[];
      disallowedPrefixes?: string[];
      requiredExtensions?: string[];
      maxPathLength?: number;
    };
    // For embedVariable
    variable?: {
      allowedVariableNames?: string[];
      allowedValueTypes?: ('text' | 'data')[];
      restrictedAccessPaths?: string[];
    };
    // For embedTemplate
    template?: {
      maxLength?: number;
      maxVariableReferences?: number;
      allowNestedTemplates?: boolean;
    };
  };
}

/**
 * Metadata for EventService
 */
interface EventMetadata {
  eventTypes: string[];                               // Event types this directive can trigger
  eventSubscribers: string[];                         // Components subscribed to these events
  shouldTriggerEvents: boolean;                       // Whether events should be triggered
  suppressEvents?: boolean;                           // For temporarily disabling events
  
  // Specific event types based on embed subtype
  baseEventTypes?: Array<
    | 'embed:beforeProcess' 
    | 'embed:afterProcess'
    | 'embed:beforeTransform'
    | 'embed:afterTransform'
    | 'embed:error'
  >;
  
  // Event propagation rules
  propagation: {
    bubbleEvents: boolean;                            // Whether events bubble up to parent
    captureEvents: boolean;                           // Whether events propagate down to children
    crossBoundary: boolean;                           // Whether events cross state boundaries
    excludedEventTypes?: string[];                    // Events that should not propagate
  };
  
  // Event lifecycle hooks
  lifecycle: {
    beforeProcessing?: string[];                      // Events to trigger before processing
    afterProcessing?: string[];                       // Events to trigger after processing
    onError?: string[];                               // Events to trigger on error
  };
}

// ==============================
// DEBUG LAYER (Optional, for development only)
// ==============================

/**
 * Combined debug metadata
 */
interface DebugMetadata {
  // Debug configuration
  debugControls: {
    enabled: boolean;                                 // Master switch for debugging
    logLevel: 'error' | 'warn' | 'info' | 'debug' | 'trace';
    debugLevel: 'minimal' | 'standard' | 'verbose' | 'complete';
    enabledFeatures: Array<                           // Selective feature enabling
      | 'stateTracking'
      | 'variableTracking'
      | 'performanceMetrics'
      | 'visualization'
      | 'executionTrace'
    >;
  };
  
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
      resolutionStart?: number;
      resolutionEnd?: number;
      validationStart?: number;
      validationEnd?: number;
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
    stateTree?: {                                     // For state hierarchy visualization
      nodes: Array<{
        id: string;
        label: string;
        type: 'root' | 'child' | 'imported';
        metadata?: Record<string, any>;
      }>;
      edges: Array<{
        source: string;
        target: string;
        type: 'parent-child' | 'sibling' | 'reference';
        label?: string;
      }>;
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

// ==============================
// METADATA REGISTRY (For type-safe metadata access)
// ==============================

/**
 * Define all possible metadata types for registry lookup
 */
interface EmbedMetadataTypes {
  resolutionMetadata: ResolutionMetadata;
  transformationMetadata: TransformationMetadata;
  outputMetadata: OutputMetadata;
  validationMetadata: ValidationMetadata;
  eventMetadata: EventMetadata;
  debugMetadata: DebugMetadata;
}

/**
 * Type guard utility for safe metadata access
 */
function hasMetadata<T extends keyof EmbedMetadataTypes>(
  node: BaseEmbedDirective, 
  metadataType: T
): node is BaseEmbedDirective & { [K in T]: EmbedMetadataTypes[T] } {
  return metadataType in node;
}

/**
 * Utility to safely get metadata, creating it if missing
 */
function getOrCreateMetadata<T extends keyof EmbedMetadataTypes>(
  node: BaseEmbedDirective,
  metadataType: T,
  factory: MetadataFactory<EmbedMetadataTypes[T]>
): EmbedMetadataTypes[T] {
  if (hasMetadata(node, metadataType)) {
    return node[metadataType];
  } else {
    const metadata = factory.create();
    (node as any)[metadataType] = metadata;
    return metadata;
  }
}

// ==============================
// ARCHITECTURAL NOTES AND IMPLEMENTATION GUIDANCE
// ==============================

/**
 * ARCHITECTURAL DECISIONS
 * 
 * 1. Type Discrimination
 *    - Used discriminated union pattern with 'subtype' field
 *    - Added originalAstNode for connection to AST
 *    - Enhanced location tracking for precise error reporting
 * 
 * 2. Transformation Status
 *    - Kept main transformStatus at root level
 *    - Added detailed transformationPhase in metadata
 *    - Separated handler results from transformation results
 * 
 * 3. State Management
 *    - Enhanced stateInfo with childStateId and basic inheritance config
 *    - Kept extensive state tracking in service metadata
 * 
 * 4. Event System
 *    - Created dedicated EventMetadata interface
 *    - Kept as service metadata for separation of concerns
 * 
 * 5. Resolution and Output Architecture
 *    - Added architecture model support to OutputMetadata
 *    - Enhanced ResolutionMetadata with critical context fields
 * 
 * 6. Backward Compatibility
 *    - Added utility functions for type-safe metadata access
 *    - Provided registry mechanism for metadata lookup
 * 
 * IMPLEMENTATION ROADMAP
 * 
 * Phase 1: Core Structure
 * - Implement discriminated union types
 * - Create service metadata interfaces
 * - Build utility functions for backward compatibility
 * 
 * Phase 2: Service Integration
 * - Update service implementations to use new types
 * - Create factory methods for metadata creation
 * - Implement type guards and conversion utilities
 * 
 * Phase 3: Advanced Features
 * - Add performance tracking
 * - Enhance debugging capabilities
 * - Build visualization tools
 */