/**
 * Handler interfaces for directive processing
 */
import { MeldNode } from '@core/types/nodes';
import { StateChanges } from './state';
import { ProcessingContext } from './context';

/**
 * Base interface for all directive handlers
 */
export interface IDirectiveHandler {
  /** The directive kinds this handler processes */
  readonly directiveKinds: string[];
  
  /** Process a directive node and return state changes */
  execute(node: MeldNode, context: ProcessingContext): Promise<StateChanges>;
  
  /** Check if this handler can process a node */
  canHandle(node: MeldNode): boolean;
  
  /** Initialize the handler with dependencies */
  initialize(dependencies: HandlerDependencies): Promise<void>;
}

/**
 * Dependencies available to directive handlers
 */
export interface HandlerDependencies {
  /** Access to other services if needed */
  services: {
    [key: string]: any;
  };
}