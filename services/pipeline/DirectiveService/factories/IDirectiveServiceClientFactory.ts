import type { ClientFactory } from '@core/shared-service-types.js';
import type { IDirectiveServiceClient } from '../interfaces/IDirectiveServiceClient.js';

/**
 * Factory interface for creating DirectiveServiceClient instances.
 * 
 * This interface defines the contract for creating clients that interact
 * with the DirectiveService. It allows for different implementations or
 * configurations of the client creation process.
 */
export interface IDirectiveServiceClientFactory extends ClientFactory<IDirectiveServiceClient> {
  /**
   * Creates a new instance of the DirectiveServiceClient.
   * 
   * @returns An instance of IDirectiveServiceClient.
   */
  createClient(): IDirectiveServiceClient;
} 