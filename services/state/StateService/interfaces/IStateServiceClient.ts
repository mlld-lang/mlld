/**
 * Client interface for StateService functionality needed by StateTrackingService
 * This interface is used to break the circular dependency between StateService and StateTrackingService
 * 
 * @remarks
 * This client interface exposes only the methods that StateTrackingService needs from StateService.
 * It is implemented by a factory to avoid circular dependencies.
 */
interface IStateServiceClient {
  /**
   * Gets the unique identifier for this state instance.
   * 
   * @returns The state ID, if assigned, or undefined
   */
  getStateId(): string | undefined;
  
  /**
   * Gets the path of the current file being processed.
   * 
   * @returns The current file path, or null if not set
   */
  getCurrentFilePath(): string | null;
  
  /**
   * Gets all text variables, including inherited ones from parent states.
   * 
   * @returns A map of all text variables
   */
  getAllTextVars(): Map<string, string>;
  
  /**
   * Gets all data variables, including inherited ones from parent states.
   * 
   * @returns A map of all data variables
   */
  getAllDataVars(): Map<string, unknown>;
  
  /**
   * Gets all path variables, including inherited ones from parent states.
   * 
   * @returns A map of all path variables
   */
  getAllPathVars(): Map<string, string>;
  
  /**
   * Gets all commands, including inherited ones from parent states.
   * 
   * @returns A map of all commands
   */
  getAllCommands(): Map<string, { command: string; options?: Record<string, unknown> }>;
  
  /**
   * Checks if transformation is enabled.
   * 
   * @returns true if transformation is enabled, false otherwise
   */
  isTransformationEnabled(): boolean;
} 

export type { IStateServiceClient }; 