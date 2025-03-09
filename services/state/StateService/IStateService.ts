import type { MeldNode } from 'meld-spec';
import type { IStateEventService } from '../StateEventService/IStateEventService.js';
import type { IStateTrackingService } from '../../../tests/utils/debug/StateTrackingService/IStateTrackingService.js';

/**
 * Options for selective transformation
 */
export interface TransformationOptions {
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
 * Service responsible for managing state in Meld documents.
 * Acts as a central store for variables, commands, and document nodes.
 * Manages state hierarchy, transformation, and immutability controls.
 * 
 * @remarks
 * StateService is a core service that maintains all state information during 
 * Meld document processing. It handles variable storage, command registration,
 * node tracking, transformation state, and parent-child relationships.
 * 
 * Dependencies:
 * - IStateEventService: For state change event notifications
 * - IStateTrackingService: For debugging and tracking state operations
 */
export interface IStateService {
  /**
   * Sets the event service for state change notifications.
   * 
   * @param eventService - The event service to use
   */
  setEventService(eventService: IStateEventService): void;

  /**
   * Sets the tracking service for state debugging and analysis.
   * 
   * @param trackingService - The tracking service to use
   */
  setTrackingService(trackingService: IStateTrackingService): void;
  
  /**
   * Gets the unique identifier for this state instance.
   * 
   * @returns The state ID, if assigned, or undefined
   */
  getStateId(): string | undefined;

  /**
   * Gets a text variable by name.
   * 
   * @param name - The name of the variable to retrieve
   * @returns The variable value, or undefined if not found
   */
  getTextVar(name: string): string | undefined;
  
  /**
   * Sets a text variable.
   * 
   * @param name - The name of the variable to set
   * @param value - The value to assign to the variable
   * @throws {MeldStateError} If the state is immutable
   */
  setTextVar(name: string, value: string): void;
  
  /**
   * Gets all text variables, including inherited ones from parent states.
   * 
   * @returns A map of all text variables
   */
  getAllTextVars(): Map<string, string>;
  
  /**
   * Gets only locally defined text variables (not inherited from parent states).
   * 
   * @returns A map of local text variables
   */
  getLocalTextVars(): Map<string, string>;

  /**
   * Gets a data variable by name.
   * 
   * @param name - The name of the variable to retrieve
   * @returns The variable value, or undefined if not found
   */
  getDataVar(name: string): unknown;
  
  /**
   * Sets a data variable.
   * 
   * @param name - The name of the variable to set
   * @param value - The value to assign to the variable
   * @throws {MeldStateError} If the state is immutable
   */
  setDataVar(name: string, value: unknown): void;
  
  /**
   * Gets all data variables, including inherited ones from parent states.
   * 
   * @returns A map of all data variables
   */
  getAllDataVars(): Map<string, unknown>;
  
  /**
   * Gets only locally defined data variables (not inherited from parent states).
   * 
   * @returns A map of local data variables
   */
  getLocalDataVars(): Map<string, unknown>;

  /**
   * Gets a path variable by name.
   * 
   * @param name - The name of the variable to retrieve
   * @returns The variable value, or undefined if not found
   */
  getPathVar(name: string): string | undefined;
  
  /**
   * Sets a path variable.
   * 
   * @param name - The name of the variable to set
   * @param value - The value to assign to the variable
   * @throws {MeldStateError} If the state is immutable
   */
  setPathVar(name: string, value: string): void;
  
  /**
   * Gets all path variables, including inherited ones from parent states.
   * 
   * @returns A map of all path variables
   */
  getAllPathVars(): Map<string, string>;

  /**
   * Gets a command by name.
   * 
   * @param name - The name of the command to retrieve
   * @returns The command details, or undefined if not found
   */
  getCommand(name: string): { command: string; options?: Record<string, unknown> } | undefined;
  
  /**
   * Sets a command with optional options.
   * 
   * @param name - The name of the command to set
   * @param command - The command string or command object with options
   * @throws {MeldStateError} If the state is immutable
   */
  setCommand(name: string, command: string | { command: string; options?: Record<string, unknown> }): void;
  
  /**
   * Gets all commands, including inherited ones from parent states.
   * 
   * @returns A map of all commands
   */
  getAllCommands(): Map<string, { command: string; options?: Record<string, unknown> }>;

  /**
   * Gets all original document nodes in order.
   * 
   * @returns An array of document nodes
   */
  getNodes(): MeldNode[];
  
  /**
   * Adds a node to the document.
   * 
   * @param node - The node to add
   * @throws {MeldStateError} If the state is immutable
   */
  addNode(node: MeldNode): void;
  
  /**
   * Appends raw content to the document.
   * 
   * @param content - The content to append
   * @throws {MeldStateError} If the state is immutable
   */
  appendContent(content: string): void;

  /**
   * Gets transformed nodes for output generation.
   * 
   * @returns An array of transformed nodes
   */
  getTransformedNodes(): MeldNode[];
  
  /**
   * Sets the complete array of transformed nodes.
   * 
   * @param nodes - The transformed nodes to set
   * @throws {MeldStateError} If the state is immutable
   */
  setTransformedNodes(nodes: MeldNode[]): void;
  
  /**
   * Records a transformation relationship between nodes.
   * 
   * @param original - The original node
   * @param transformed - The transformed node
   * @throws {MeldStateError} If the state is immutable
   */
  transformNode(original: MeldNode, transformed: MeldNode): void;
  
  /**
   * Checks if transformation is enabled.
   * 
   * @returns true if transformation is enabled, false otherwise
   */
  isTransformationEnabled(): boolean;
  
  /**
   * Enables transformation with optional settings.
   * 
   * @param options - Transformation options or boolean to enable/disable all
   */
  enableTransformation(options?: TransformationOptions | boolean): void;
  
  /**
   * Checks if a specific transformation type is enabled.
   * 
   * @param type - The transformation type to check
   * @returns true if the transformation type is enabled, false otherwise
   */
  shouldTransform(type: keyof TransformationOptions): boolean;
  
  /**
   * Gets the current transformation options.
   * 
   * @returns Current transformation options
   */
  getTransformationOptions(): TransformationOptions;
  
  /**
   * Gets the output of a previously executed command.
   * 
   * @param command - The command to get output for
   * @returns The command output, or undefined if not found
   */
  getCommandOutput(command: string): string | undefined;
  
  /**
   * Checks if the state implementation supports transformation.
   * 
   * @returns true if transformation is supported, false otherwise
   */
  hasTransformationSupport(): boolean;

  /**
   * Registers an imported file path.
   * 
   * @param path - The path of the imported file
   * @throws {MeldStateError} If the state is immutable
   */
  addImport(path: string): void;
  
  /**
   * Removes an imported file path.
   * 
   * @param path - The path of the imported file to remove
   * @throws {MeldStateError} If the state is immutable
   */
  removeImport(path: string): void;
  
  /**
   * Checks if a file has been imported.
   * 
   * @param path - The path to check
   * @returns true if the file has been imported, false otherwise
   */
  hasImport(path: string): boolean;
  
  /**
   * Gets all imported file paths.
   * 
   * @returns A set of all imported file paths
   */
  getImports(): Set<string>;

  /**
   * Gets the path of the current file being processed.
   * 
   * @returns The current file path, or null if not set
   */
  getCurrentFilePath(): string | null;
  
  /**
   * Sets the path of the current file being processed.
   * 
   * @param path - The current file path
   */
  setCurrentFilePath(path: string): void;

  /**
   * Checks if the state has local changes that haven't been merged.
   * 
   * @returns true if there are local changes, false otherwise
   */
  hasLocalChanges(): boolean;
  
  /**
   * Gets a list of local changes.
   * 
   * @returns An array of change descriptions
   */
  getLocalChanges(): string[];
  
  /**
   * Makes the state immutable, preventing further changes.
   */
  setImmutable(): void;
  
  /**
   * Whether the state is immutable.
   */
  readonly isImmutable: boolean;
  
  /**
   * Creates a child state that inherits from this state.
   * 
   * @returns A new child state
   */
  createChildState(): IStateService;
  
  /**
   * Merges changes from a child state into this state.
   * 
   * @param childState - The child state to merge
   * @throws {MeldStateError} If the state is immutable or the child state is invalid
   */
  mergeChildState(childState: IStateService): void;
  
  /**
   * Creates a deep clone of this state.
   * 
   * @returns A new state with the same values
   */
  clone(): IStateService;
} 