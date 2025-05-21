/**
 * Types related to State management (IStateService, options).
 */

import type { JsonValue } from './common';
import type { VariableType, VariableMetadata, MeldVariable, TextVariable, DataVariable, IPathVariable, CommandVariable } from './variables';
import type { IFilesystemPathState, IUrlPathState } from './paths';
import type { ICommandDefinition } from './define';

// Import MeldNode from the AST types
import type { DirectiveKind, MeldNode } from '@core/ast/types';

/**
 * Options for variable copying between states.
 *
 * @remarks Added based on InterpreterCore service lead feedback to formalize
 * the options used during state variable copying between parent and child states.
 */
export interface VariableCopyOptions {
  /** Whether to copy text variables */
  copyTextVars: boolean;
  
  /** Whether to copy data variables */
  copyDataVars: boolean;
  
  /** Whether to copy path variables */
  copyPathVars: boolean;
  
  /** Whether to copy command variables */
  copyCommandVars: boolean;
  
  /** Whether to overwrite existing variables */
  overwrite: boolean;
  
  /** Filter function to determine which variables to copy */
  filter?: (variable: MeldVariable) => boolean;
  
  /** Transform function to modify variables during copying */
  transform?: (variable: MeldVariable) => MeldVariable;
}

/**
 * Interface for state storage service.
 *
 * @remarks Enhanced based on feedback from multiple service leads to support
 * transformation, variable inheritance, and comprehensive type safety.
 * Updated setPathVar and setCommandVar signatures based on variables-spec.md.
 */
export interface IStateService {
  // Type-specific getters
  getTextVar(name: string): TextVariable | undefined;
  getDataVar(name: string): DataVariable | undefined;
  getPathVar(name: string): IPathVariable | undefined; // Updated return type
  getCommandVar(name: string): CommandVariable | undefined;
  
  // Type-specific setters
  setTextVar(name: string, value: string, metadata?: Partial<VariableMetadata>): TextVariable;
  setDataVar(name: string, value: JsonValue, metadata?: Partial<VariableMetadata>): DataVariable;
  // Updated setPathVar to accept the union state type
  setPathVar(name: string, value: IFilesystemPathState | IUrlPathState, metadata?: Partial<VariableMetadata>): IPathVariable;
  // Updated setCommandVar to accept the structured ICommandDefinition
  setCommandVar(name: string, value: ICommandDefinition, metadata?: Partial<VariableMetadata>): CommandVariable;
  
  // Generic methods
  getVariable(name: string, type?: VariableType): MeldVariable | undefined;
  setVariable(variable: MeldVariable): MeldVariable;
  
  // Variable existence checks
  hasVariable(name: string, type?: VariableType): boolean;
  
  // Variable removal
  removeVariable(name: string, type?: VariableType): boolean;
  
  // Get all variables of a specific type
  getAllTextVars(): Map<string, TextVariable>;
  getAllDataVars(): Map<string, DataVariable>;
  getAllPathVars(): Map<string, IPathVariable>;
  getAllCommands(): Map<string, CommandVariable>;

  // State management
  createChildState(options?: Partial<VariableCopyOptions>): IStateService;
  clone(): IStateService;
  getParentState(): IStateService | undefined;
  
  // Copy variables between states
  copyVariablesTo(targetState: IStateService, options?: Partial<VariableCopyOptions>): void;
  copyVariablesFrom(sourceState: IStateService, options?: Partial<VariableCopyOptions>): void;
  
  // Original and transformed nodes
  getOriginalNodes(): MeldNode[];
  getTransformedNodes(): MeldNode[];
  setOriginalNodes(nodes: MeldNode[]): void;
  setTransformedNodes(nodes: MeldNode[]): void;
  transformNode(index: number, replacement: MeldNode | MeldNode[]): void;
  
  // Transformation state
  isTransformationEnabled(): boolean;
  setTransformationEnabled(enabled: boolean): void;
  getTransformationOptions(): TransformationOptions;
  setTransformationOptions(options: TransformationOptions): void;

  // -- Additional methods from existing IStateService (to be reconciled) --
  // These may need review/updating based on the new type system

  setEventService?(eventService: any): void; // Type needs update
  setTrackingService?(trackingService: any): void; // Type needs update
  getStateId?(): string | undefined;
  getLocalTextVars?(): Map<string, TextVariable>; // Assuming return type update
  getLocalDataVars?(): Map<string, DataVariable>; // Assuming return type update
  // getLocalPathVars?(): Map<string, IPathVariable>; // Add if needed
  // getLocalCommands?(): Map<string, CommandVariable>; // Add if needed
  addNode?(node: MeldNode): void;
  appendContent?(content: string): void;
  getCommandOutput?(command: string): string | undefined;
  hasTransformationSupport?(): boolean;
  addImport?(path: string): void;
  removeImport?(path: string): void;
  hasImport?(path: string): boolean;
  getImports?(): Set<string>;
  getCurrentFilePath?(): string | null;
  setCurrentFilePath?(path: string): void;
  hasLocalChanges?(): boolean;
  getLocalChanges?(): string[];
  setImmutable?(): void;
  readonly isImmutable?: boolean;
  mergeChildState?(childState: IStateService): void;
}

/**
 * Options for controlling transformation behavior.
 *
 * @remarks Added based on InterpreterCore and StateManagement service lead feedback
 * to formalize transformation options and tracking.
 */
export interface TransformationOptions {
  /** Whether transformation is enabled */
  enabled: boolean;
  
  /** Types of directives to transform */
  directiveTypes?: string[];
  
  /** Whether to preserve original nodes */
  preserveOriginal: boolean;
  
  /** Whether to transform nested content */
  transformNested: boolean;
} 