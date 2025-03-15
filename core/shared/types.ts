/**
 * Shared basic types with no dependencies
 * 
 * This file provides fundamental type definitions with no imports.
 * It serves as the foundation for breaking circular dependencies
 * between services.
 * 
 * IMPORTANT: This file must NOT have any imports to prevent circular
 * dependencies. Add only standalone type definitions here.
 */

/**
 * Options for selective state transformation
 */
interface StateTransformationOptions {
  /** Whether to transform variable references */
  variables?: boolean;    
  /** Whether to transform directive content */
  directives?: boolean;   
  /** Whether to execute commands */
  commands?: boolean;     
  /** Whether to process imports */
  imports?: boolean;      
}

/**
 * Core state event types for lifecycle operations
 */
type StateEventType = 'create' | 'clone' | 'transform' | 'merge' | 'error';

/**
 * Base state event interface
 */
interface StateEventBase {
  /** The type of state event */
  type: StateEventType;
  /** Unique identifier of the state that triggered the event */
  stateId: string;
  /** Source of the event (usually a service or operation name) */
  source: string;
  /** Timestamp when the event occurred (milliseconds since epoch) */
  timestamp: number;
  /** Optional location information for debugging */
  location?: {
    /** File where the event occurred */
    file?: string;
    /** Line number in the file */
    line?: number;
    /** Column number in the file */
    column?: number;
  };
}

/**
 * Event handler function type for processing state events
 */
type StateEventHandlerBase = (event: StateEventBase) => void | Promise<void>;

/**
 * Event filter predicate for selective event handling
 */
type StateEventFilterBase = (event: StateEventBase) => boolean;

/**
 * Handler registration options for configuring event subscription
 */
interface StateEventHandlerOptionsBase {
  /** Optional filter to selectively process events */
  filter?: StateEventFilterBase;
}

/**
 * Core state event service interface
 */
interface StateEventServiceBase {
  /** Register an event handler */
  on(type: StateEventType, handler: StateEventHandlerBase, options?: StateEventHandlerOptionsBase): void;
  /** Remove an event handler */
  off(type: StateEventType, handler: StateEventHandlerBase): void;
  /** Emit a state event */
  emit(event: StateEventBase): Promise<void>;
}

/**
 * Basic state metadata for tracking
 */
interface StateMetadataBase {
  /** Unique state identifier */
  id: string;
  /** Parent state identifier if any */
  parentId?: string;
  /** Source of the state creation */
  source: 'new' | 'clone' | 'child' | 'merge' | 'implicit';
  /** Optional file path associated with this state */
  filePath?: string;
  /** Whether transformation is enabled for this state */
  transformationEnabled: boolean;
  /** Creation timestamp */
  createdAt: number;
  /** Last modification timestamp */
  lastModified?: number;
}

/**
 * Basic relationship between states
 */
interface StateRelationshipBase {
  /** Source state identifier (optional for root states) */
  sourceId?: string;
  /** Target state identifier */
  targetId: string;
  /** Type of relationship */
  type: 'parent-child' | 'merge-source' | 'merge-target';
}

/**
 * Basic state tracking service interface
 */
interface StateTrackingServiceBase {
  /** Register a state with the tracking service */
  registerState(metadata: Partial<StateMetadataBase>): void;
  
  /** Add a relationship between two states */
  addRelationship(sourceId: string, targetId: string, type: 'parent-child' | 'merge-source' | 'merge-target'): void;
  
  /** Get metadata for a specific state */
  getStateMetadata(stateId: string): StateMetadataBase | undefined;
}

/**
 * Core state service interface without implementation details
 */
interface StateServiceBase {
  /** Get a data variable by name */
  getDataVar(name: string): unknown;
  /** Get a text variable by name */
  getTextVar(name: string): string | undefined;
  /** Get a path variable by name */
  getPathVar(name: string): string | undefined;
  /** Check if a variable with the given name and type exists */
  hasVariable(type: string, name: string): boolean;
  /** Get the state identifier */
  getStateId(): string | undefined;
  /** Check if the state is immutable */
  readonly isImmutable: boolean;
  /** Get the current file path being processed */
  getCurrentFilePath(): string | null;
}

/**
 * Core file system operations without implementation details
 */
interface FileSystemBase {
  /** Check if a file exists */
  fileExists(path: string): Promise<boolean>;
  /** Read a file as text */
  readFile(path: string): Promise<string>;
  /** Resolve a path */
  resolvePath(path: string): string;
}

/**
 * Basic path service operations without dependencies
 */
interface PathServiceBase {
  /** Validate a path */
  validatePath(path: string): Promise<string>;
  /** Resolve a path */
  resolvePath(path: string): string;
  /** Join path segments */
  joinPaths(...paths: string[]): string;
}

/**
 * Resolution context base information
 */
interface ResolutionContextBase {
  /** Current file path for resolution */
  currentFilePath?: string;
  /** Working directory for resolution */
  workingDirectory?: string;
  /** Whether transformation mode is enabled */
  transformationMode?: boolean;
  /** Whether to include path validation */
  validatePaths?: boolean;
}

/**
 * Base directive context
 */
interface DirectiveContextBase {
  /** Current file being processed */
  currentFilePath?: string;
  /** Working directory for command execution */
  workingDirectory?: string;
  /** Resolution context for variable resolution */
  resolutionContext?: ResolutionContextBase;
}

/**
 * AST node position
 */
interface Position {
  /** Line number (1-based) */
  line: number; 
  /** Column number (1-based) */
  column: number;
}

/**
 * Source location in a file
 */
interface SourceLocation {
  /** Start position */
  start: Position;
  /** End position */
  end: Position;
}

/**
 * Node types in Meld AST
 */
export enum NodeType {
  ROOT = 'Root',
  FRAGMENT = 'Fragment',
  DIRECTIVE = 'Directive',
  TEXT = 'Text',
  VARIABLE_REFERENCE = 'VariableReference',
  COMMENT = 'Comment'
}

/**
 * Base node interface for all AST nodes
 */
interface BaseNode {
  /** Type of node */
  type: NodeType;
  /** Source location */
  location?: SourceLocation;
}

// Type-only exports for all interfaces and types
export type {
  StateTransformationOptions,
  StateEventType,
  StateEventBase,
  StateEventHandlerBase,
  StateEventFilterBase,
  StateEventHandlerOptionsBase,
  StateEventServiceBase,
  StateMetadataBase,
  StateRelationshipBase,
  StateTrackingServiceBase,
  StateServiceBase,
  FileSystemBase,
  PathServiceBase,
  ResolutionContextBase,
  DirectiveContextBase,
  Position,
  SourceLocation,
  BaseNode
};