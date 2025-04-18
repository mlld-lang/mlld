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
   * Checks if transformation is enabled.
   * 
   * @returns true if transformation is enabled, false otherwise
   */
  isTransformationEnabled(): boolean;
} 

export type { IStateServiceClient }; 