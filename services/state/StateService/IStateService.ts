import type { MeldNode } from '@core/syntax/types/index';
import type { IStateEventService } from '@services/state/StateEventService/IStateEventService';
import type { IStateTrackingService } from '@tests/utils/debug/StateTrackingService/IStateTrackingService';
import type { StateNode } from './types';
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
} from '@core/types/index';
import type { StateChanges } from '@core/directives/DirectiveHandler';

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
   */
  setEventService(eventService: IStateEventService): void;

  /**
   * Sets the tracking service for state debugging and analysis.
   */
  setTrackingService(trackingService: IStateTrackingService): void;
  
  /**
   * Gets the unique identifier for this state instance.
   */
  getStateId(): string | undefined;

  /**
   * Gets the minimal state data needed for parent-child relationships.
   * This method returns only the essential data needed for state inheritance,
   * excluding nodes and transformation data to prevent memory issues.
   * @internal
   */
  getInternalStateNode(): Pick<StateNode, 'stateId' | 'variables' | 'commands' | 'imports'>;

  /**
   * Gets all document nodes (original or transformed depending on mode).
   */
  getNodes(): MeldNode[];
  
  /**
   * Adds a node to the document.
   * @throws {MeldStateError} If the state is immutable
   */
  addNode(node: MeldNode): Promise<void>;
  
  /**
   * Appends raw content to the document.
   * @throws {MeldStateError} If the state is immutable
   */
  appendContent(content: string): Promise<void>;

  /**
   * Gets transformed nodes for output generation.
   */
  getTransformedNodes(): MeldNode[];
  
  /**
   * Sets the complete array of transformed nodes.
   * @throws {MeldStateError} If the state is immutable
   */
  setTransformedNodes(nodes: MeldNode[]): Promise<void>;
  
  /**
   * Replaces the node at the specified index in the transformed nodes array.
   * @throws {MeldStateError} If the state is immutable or index is out of bounds
   */
  transformNode(index: number, replacement: MeldNode | MeldNode[] | undefined): Promise<void>;
  
  /**
   * Checks if transformation is enabled.
   */
  isTransformationEnabled(): boolean;
  
  /**
   * Enables or disables transformation.
   */
  setTransformationEnabled(enabled: boolean): Promise<void>;
  
  /**
   * Gets the current transformation options.
   */
  getTransformationOptions(): TransformationOptions;
  
  /**
   * Sets the transformation options.
   */
  setTransformationOptions(options: TransformationOptions): Promise<void>;
  
  /**
   * Registers an imported file path.
   * @throws {MeldStateError} If the state is immutable
   */
  addImport(path: string): Promise<void>;
  
  /**
   * Removes an imported file path.
   * @throws {MeldStateError} If the state is immutable
   */
  removeImport(path: string): Promise<void>;
  
  /**
   * Checks if a file has been imported.
   */
  hasImport(path: string): boolean;
  
  /**
   * Gets all imported file paths.
   */
  getImports(): Set<string>;

  /**
   * Gets the path of the current file being processed.
   */
  getCurrentFilePath(): string | null;
  
  /**
   * Sets the path of the current file being processed.
   */
  setCurrentFilePath(path: string): Promise<void>;

  /**
   * Checks if the state has local changes that haven't been merged.
   */
  hasLocalChanges(): boolean;
  
  /**
   * Gets a list of local changes.
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
   */
  createChildState(options?: Partial<VariableCopyOptions>): IStateService;
  
  /**
   * Merges changes from a child state into this state.
   * @throws {MeldStateError} If the state is immutable or the child state is invalid
   */
  mergeChildState(childState: IStateService): Promise<void>;
  
  /**
   * Creates a deep clone of this state.
   */
  clone(): IStateService;

  /**
   * Gets the parent state, if this state is a child.
   */
  getParentState(): IStateService | undefined;

  // Variable Management Methods

  /**
   * Gets a variable by name, optionally specifying the expected type.
   */
  getVariable(name: string, type?: VariableType): MeldVariable | undefined;

  /**
   * Sets a variable using a pre-constructed MeldVariable object.
   * @throws {MeldStateError} If the state is immutable
   */
  setVariable(variable: MeldVariable): Promise<MeldVariable>;

  /**
   * Gets a text variable by name.
   */
  getTextVar(name: string): TextVariable | undefined;

  /**
   * Gets a data variable by name.
   */
  getDataVar(name: string): DataVariable | undefined;

  /**
   * Gets a path variable by name.
   */
  getPathVar(name: string): IPathVariable | undefined;

  /**
   * Gets a command variable by name.
   */
  getCommandVar(name: string): CommandVariable | undefined;

  /**
   * Sets a text variable.
   * @throws {MeldStateError} If the state is immutable
   */
  setTextVar(name: string, value: string, metadata?: Partial<VariableMetadata>): Promise<void>;

  /**
   * Sets a data variable.
   * @throws {MeldStateError} If the state is immutable
   */
  setDataVar(name: string, value: JsonValue, metadata?: Partial<VariableMetadata>): Promise<void>;

  /**
   * Sets a path variable.
   * @throws {MeldStateError} If the state is immutable
   */
  setPathVar(name: string, value: IFilesystemPathState | IUrlPathState, metadata?: Partial<VariableMetadata>): Promise<void>;

  /**
   * Sets a command variable.
   * @throws {MeldStateError} If the state is immutable
   */
  setCommandVar(name: string, value: ICommandDefinition, metadata?: Partial<VariableMetadata>): Promise<void>;

  /**
   * Gets all text variables.
   */
  getAllTextVars(): Map<string, TextVariable>;

  /**
   * Gets all data variables.
   */
  getAllDataVars(): Map<string, DataVariable>;

  /**
   * Gets all path variables.
   */
  getAllPathVars(): Map<string, IPathVariable>;

  /**
   * Gets all command variables.
   */
  getAllCommands(): Map<string, CommandVariable>;

  /**
   * Gets local text variables (not inherited from parent).
   */
  getLocalTextVars(): Map<string, TextVariable>;

  /**
   * Gets local data variables (not inherited from parent).
   */
  getLocalDataVars(): Map<string, DataVariable>;

  /**
   * Applies state changes to the current state.
   * @throws {MeldError} If changes are invalid or cannot be applied
   */
  applyStateChanges(changes: StateChanges): Promise<IStateService>;
}

export type { TransformationOptions, DataVariable }; 