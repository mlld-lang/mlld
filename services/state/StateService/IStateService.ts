import type { MeldNode } from '@core/syntax/types/index.js';
import type { IStateEventService } from '@services/state/StateEventService/IStateEventService.js';
import type { IStateTrackingService } from '@tests/utils/debug/StateTrackingService/IStateTrackingService.js';
import type { StateNode } from './types.js';
import type {
  JsonValue,
  TextVariable,
  DataVariable,
  IPathVariable,
  CommandVariable,
  MeldVariable,
  VariableType,
  VariableMetadata,
  VariableCopyOptions,
  TransformationOptions,
  IFilesystemPathState,
  IUrlPathState,
  ICommandDefinition,
  MeldPath
} from '@core/types/index.js';

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
interface IStateService {
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
   * Gets all document nodes (original or transformed depending on mode).
   * 
   * @returns An array of document nodes
   */
  getNodes(): MeldNode[];
  
  /**
   * Adds a node to the document.
   * 
   * @param node - The node to add
   * @returns A promise resolving to the updated state service instance.
   * @throws {MeldStateError} If the state is immutable
   */
  addNode(node: MeldNode): Promise<IStateService>;
  
  /**
   * Appends raw content to the document.
   * 
   * @param content - The content to append
   * @returns A promise resolving to the updated state service instance.
   * @throws {MeldStateError} If the state is immutable
   */
  appendContent(content: string): Promise<IStateService>;

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
   * @returns A promise resolving to the updated state service instance.
   * @throws {MeldStateError} If the state is immutable
   */
  setTransformedNodes(nodes: MeldNode[]): Promise<IStateService>;
  
  /**
   * Replaces the node at the specified index in the transformed nodes array.
   * 
   * @param index - The index of the node to replace
   * @param replacement - The node or nodes to insert
   * @returns A promise resolving to the updated state service instance.
   * @throws {MeldStateError} If the state is immutable or index is out of bounds
   */
  transformNode(index: number, replacement: MeldNode | MeldNode[] | undefined): Promise<IStateService>;
  
  /**
   * Checks if transformation is enabled.
   * 
   * @returns true if transformation is enabled, false otherwise
   */
  isTransformationEnabled(): boolean;
  
  /**
   * Enables or disables transformation.
   * 
   * @param enabled - Whether to enable transformation
   * @returns A promise resolving to the updated state service instance.
   */
  setTransformationEnabled(enabled: boolean): Promise<IStateService>;
  
  /**
   * Gets the current transformation options.
   * 
   * @returns The current transformation options
   */
  getTransformationOptions(): TransformationOptions;
  
  /**
   * Sets the transformation options.
   * 
   * @param options - The transformation options to set
   * @returns A promise resolving to the updated state service instance.
   */
  setTransformationOptions(options: TransformationOptions): Promise<IStateService>;
  
  /**
   * Registers an imported file path.
   * 
   * @param path - The path of the imported file
   * @returns A promise resolving to the updated state service instance.
   * @throws {MeldStateError} If the state is immutable
   */
  addImport(path: string): Promise<IStateService>;
  
  /**
   * Removes an imported file path.
   * 
   * @param path - The path of the imported file to remove
   * @returns A promise resolving to the updated state service instance.
   * @throws {MeldStateError} If the state is immutable
   */
  removeImport(path: string): Promise<IStateService>;
  
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
   * @returns A promise resolving to the updated state service instance.
   */
  setCurrentFilePath(path: string): Promise<IStateService>;

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
   * @param options - Optional configuration for variable copying
   * @returns A new child state
   */
  createChildState(options?: Partial<VariableCopyOptions>): IStateService;
  
  /**
   * Merges changes from a child state into this state.
   * 
   * @param childState - The child state to merge
   * @returns A promise resolving to the updated state service instance (this instance after merge).
   * @throws {MeldStateError} If the state is immutable or the child state is invalid
   */
  mergeChildState(childState: IStateService): Promise<IStateService>;
  
  /**
   * Creates a deep clone of this state.
   * 
   * @returns A new state with the same values
   */
  clone(): IStateService;

  /**
   * Gets the parent state, if this state is a child.
   * 
   * @returns The parent IStateService or undefined
   */
  getParentState(): IStateService | undefined;

  /**
   * Gets a variable by name, optionally specifying the expected type.
   *
   * @param name - The name of the variable.
   * @param type - Optional variable type to filter by.
   * @returns The MeldVariable object, or undefined if not found or type mismatch.
   */
  getVariable(name: string, type?: VariableType): MeldVariable | undefined;

  /**
   * Sets a variable using a pre-constructed MeldVariable object.
   *
   * @param variable - The MeldVariable object to set.
   * @returns A promise resolving to the updated state service instance.
   * @throws {MeldStateError} If the state is immutable.
   */
  setVariable(variable: MeldVariable): Promise<IStateService>;

  /**
   * Checks if a variable exists, optionally specifying the type.
   *
   * @param name - The name of the variable.
   * @param type - Optional variable type to check for.
   * @returns True if the variable exists (and matches the type, if specified).
   */
  hasVariable(name: string, type?: VariableType): boolean;

  /**
   * Removes a variable, optionally specifying the type.
   *
   * @param name - The name of the variable to remove.
   * @param type - Optional variable type to target.
   * @returns A promise resolving to the updated state service instance.
   * @throws {MeldStateError} If the state is immutable.
   */
  removeVariable(name: string, type?: VariableType): Promise<IStateService>;

  /**
   * Gets the output of a previously executed command (If state tracks this).
   * @param command - The command string or identifier.
   * @returns The command's stdout or undefined.
   */
  getCommandOutput(command: string): string | undefined;

  /**
   * Checks if the state implementation supports transformation features.
   * @returns true if transformation is supported.
   */
  hasTransformationSupport(): boolean;

  /**
   * Gets the underlying StateNode object. 
   * 
   * WARNING: This provides access to internal state representation and 
   * should be used sparingly, primarily for operations like state merging 
   * or cloning that inherently require access to the full internal structure.
   * 
   * @returns The internal StateNode object.
   */
  getInternalStateNode(): StateNode;

  /**
   * Checks if a specific transformation type should be applied.
   * Note: This seems less relevant if transformation is always enabled.
   * 
   * @param type - The transformation type string (e.g., 'directive', 'variable')
   * @returns true if the transformation should occur.
   */
  shouldTransform(type: string): boolean;

  // Type-specific getters from StateServiceLike
  getTextVar(name: string): TextVariable | undefined;
  getDataVar(name: string): DataVariable | undefined;
  getPathVar(name: string): IPathVariable | undefined;
  getCommandVar(name: string): CommandVariable | undefined;

  // Type-specific setters from StateServiceLike
  setTextVar(name: string, value: string, metadata?: Partial<VariableMetadata>): Promise<IStateService>;
  setDataVar(name: string, value: JsonValue, metadata?: Partial<VariableMetadata>): Promise<IStateService>;
  setPathVar(name: string, value: IFilesystemPathState | IUrlPathState, metadata?: Partial<VariableMetadata>): Promise<IStateService>;
  setCommandVar(name: string, value: ICommandDefinition, metadata?: Partial<VariableMetadata>): Promise<IStateService>;

  // Get all variables by type from StateServiceLike
  getAllTextVars(): Map<string, TextVariable>;
  getAllDataVars(): Map<string, DataVariable>;
  getAllPathVars(): Map<string, IPathVariable>;
  getAllCommands(): Map<string, CommandVariable>;

  // Get local variables by type from StateServiceLike
  getLocalTextVars(): Map<string, TextVariable>;
  getLocalDataVars(): Map<string, DataVariable>;

  /**
   * Applies the given state changes to the current state, returning a new state instance.
   * @param changes The state changes to apply.
   * @returns A new IStateService instance reflecting the applied changes.
   * @throws MeldError if changes are invalid or cannot be applied.
   */
  applyStateChanges(changes: StateChanges): Promise<IStateService>;
}

export type { TransformationOptions, IStateService, DataVariable }; 