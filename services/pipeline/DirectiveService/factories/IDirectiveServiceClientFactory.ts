import type { ClientFactory } from '@core/shared-service-types';
import type { IDirectiveServiceClient } from '../interfaces/IDirectiveServiceClient';

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