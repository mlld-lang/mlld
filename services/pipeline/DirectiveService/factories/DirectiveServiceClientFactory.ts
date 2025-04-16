import { injectable, inject } from 'tsyringe';
import type { IDirectiveService } from '../IDirectiveService.js';
import type { IDirectiveServiceClient } from '../interfaces/IDirectiveServiceClient.js';
import type { IDirectiveServiceClientFactory } from './IDirectiveServiceClientFactory.js';
import { Service } from '@core/ServiceProvider.js';
import type { DirectiveProcessingContext } from '@core/types/index.js';
import type { MeldNode, DirectiveNode } from '@core/syntax/types/index.js';
import type { StateServiceLike } from '@core/shared-service-types.js';
import type { DirectiveResult } from '../interfaces/DirectiveTypes.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';

/**
 * Factory for creating DirectiveServiceClient instances.
 *
 * This factory provides a concrete implementation for creating clients
 * that interact with the DirectiveService. It resolves the actual
 * DirectiveService instance from the DI container and uses it to
 * implement the client interface methods.
 */
@injectable()
@Service({
  description: 'Factory for creating DirectiveService clients',
  dependencies: [
    { token: 'IDirectiveService', name: 'directiveService' }
  ]
})
export class DirectiveServiceClientFactory implements IDirectiveServiceClientFactory {
  constructor(
    @inject('IDirectiveService') private directiveService: IDirectiveService
  ) {}

  createClient(): IDirectiveServiceClient {
    // Return an object implementing the IDirectiveServiceClient interface
    return {
      supportsDirective: (kind: string): boolean => {
        return this.directiveService.supportsDirective(kind);
      },
      // Updated handleDirective signature
      handleDirective: (
        node: DirectiveNode,
        context: DirectiveProcessingContext
      ): Promise<IStateService | DirectiveResult> => {
        return this.directiveService.handleDirective(node, context);
      },
      validateDirective: (node: DirectiveNode): Promise<void> => {
        return this.directiveService.validateDirective(node);
      },
      getSupportedDirectives: () => this.directiveService.getSupportedDirectives()
    };
  }
} 