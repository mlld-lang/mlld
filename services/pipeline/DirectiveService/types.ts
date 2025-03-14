import type { MeldNode } from '@core/syntax/types.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';

/**
 * Result of directive execution
 */
export interface DirectiveResult {
  /** The updated state after directive execution */
  state: IStateService;
  /** Optional replacement node for transformation */
  replacement?: MeldNode;
} 