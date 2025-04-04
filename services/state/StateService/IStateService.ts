import type { MeldNode } from '@core/syntax/types/index.js';
import type { IStateEventService } from '@services/state/StateEventService/IStateEventService.js';
import type { IStateTrackingService } from '@tests/utils/debug/StateTrackingService/IStateTrackingService.js';
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
  ICommandDefinition
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
   * Gets a text variable by name.
   * 
   * @param name - The name of the variable to retrieve
   * @returns The full TextVariable object, or undefined if not found
   */
  getTextVar(name: string): TextVariable | undefined;
  
  /**
   * Sets a text variable.
   * 
   * @param name - The name of the variable to set
   * @param value - The string value to assign
   * @param metadata - Optional metadata for the variable
   * @returns The created TextVariable object
   * @throws {MeldStateError} If the state is immutable
   */
  setTextVar(name: string, value: string, metadata?: Partial<VariableMetadata>): TextVariable;
  
  /**
   * Gets all text variables, including inherited ones from parent states.
   * 
   * @returns A map of all text variables (name -> TextVariable)
   */
  getAllTextVars(): Map<string, TextVariable>;
  
  /**
   * Gets only locally defined text variables (not inherited from parent states).
   * 
   * @returns A map of local text variables (name -> TextVariable)
   */
  getLocalTextVars(): Map<string, TextVariable>;

  /**
   * Gets a data variable by name.
   * 
   * @param name - The name of the variable to retrieve
   * @returns The full DataVariable object, or undefined if not found
   */
  getDataVar(name: string): DataVariable | undefined;
  
  /**
   * Sets a data variable.
   * 
   * @param name - The name of the variable to set
   * @param value - The JSON-compatible value to assign
   * @param metadata - Optional metadata for the variable
   * @returns The created DataVariable object
   * @throws {MeldStateError} If the state is immutable
   */
  setDataVar(name: string, value: JsonValue, metadata?: Partial<VariableMetadata>): DataVariable;
  
  /**
   * Gets all data variables, including inherited ones from parent states.
   * 
   * @returns A map of all data variables (name -> DataVariable)
   */
  getAllDataVars(): Map<string, DataVariable>;
  
  /**
   * Gets only locally defined data variables (not inherited from parent states).
   * 
   * @returns A map of local data variables (name -> DataVariable)
   */
  getLocalDataVars(): Map<string, DataVariable>;

  /**
   * Gets a path variable by name.
   * 
   * @param name - The name of the variable to retrieve
   * @returns The full IPathVariable object, or undefined if not found
   */
  getPathVar(name: string): IPathVariable | undefined;
  
  /**
   * Sets a path variable.
   * 
   * @param name - The name of the variable to set
   * @param value - The filesystem or URL state object to assign
   * @param metadata - Optional metadata for the variable
   * @returns The created IPathVariable object
   * @throws {MeldStateError} If the state is immutable
   */
  setPathVar(name: string, value: IFilesystemPathState | IUrlPathState, metadata?: Partial<VariableMetadata>): IPathVariable;
  
  /**
   * Gets all path variables, including inherited ones from parent states.
   * 
   * @returns A map of all path variables (name -> IPathVariable)
   */
  getAllPathVars(): Map<string, IPathVariable>;

  /**
   * Gets a command variable by name.
   * 
   * @param name - The name of the command variable to retrieve
   * @returns The full CommandVariable object, or undefined if not found
   */
  getCommandVar(name: string): CommandVariable | undefined;

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
   * @returns A map of all commands (name -> CommandVariable)
   */
  getAllCommands(): Map<string, CommandVariable>;

  /**
   * Gets all original document nodes in order.
   * 
   * @returns An array of document nodes
   */
  getOriginalNodes(): MeldNode[];
  
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
   * Replaces the node at the specified index in the transformed nodes array.
   * 
   * @param index - The index of the node to replace
   * @param replacement - The node or nodes to insert
   * @throws {MeldStateError} If the state is immutable or index is out of bounds
   */
  transformNode(index: number, replacement: MeldNode | MeldNode[]): void;
  
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
   */
  setTransformationEnabled(enabled: boolean): void;
  
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
   */
  setTransformationOptions(options: TransformationOptions): void;
  
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
   * @param options - Optional configuration for variable copying
   * @returns A new child state
   */
  createChildState(options?: Partial<VariableCopyOptions>): IStateService;
  
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
   * @returns The set MeldVariable object.
   * @throws {MeldStateError} If the state is immutable.
   */
  setVariable(variable: MeldVariable): MeldVariable;

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
   * @returns True if a variable was removed.
   * @throws {MeldStateError} If the state is immutable.
   */
  removeVariable(name: string, type?: VariableType): boolean;

  /**
   * Gets the output of a previously executed command.
   * @deprecated Review if this is still needed or how it interacts with CommandVariable.
   */
  getCommandOutput?(command: string): string | undefined;

  /**
   * Checks if the state implementation supports transformation.
   * @deprecated Transformation is now implicitly supported.
   */
  hasTransformationSupport?(): boolean;

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
}

export type { TransformationOptions, IStateService }; 