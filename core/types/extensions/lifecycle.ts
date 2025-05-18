/**
 * Lifecycle stage extension patterns
 */
import { MeldNode } from '@core/types/nodes';
import { ProcessingContext } from '@core/types/services/context';

/**
 * Lifecycle stages for node processing
 */
export enum NodeLifecycle {
  PARSED = 'parsed',
  VALIDATED = 'validated',
  RESOLVED = 'resolved',
  EXECUTED = 'executed',
  TRANSFORMED = 'transformed'
}

/**
 * Lifecycle metadata attached to nodes
 */
export interface LifecycleMetadata {
  /** Current lifecycle stage */
  stage: NodeLifecycle;
  
  /** When the node entered this stage */
  enteredAt: Date;
  
  /** Processing history */
  history: LifecycleTransition[];
}

/**
 * Transition between lifecycle stages
 */
export interface LifecycleTransition {
  /** Previous stage */
  from: NodeLifecycle;
  
  /** New stage */
  to: NodeLifecycle;
  
  /** When the transition occurred */
  timestamp: Date;
  
  /** What triggered the transition */
  trigger: string;
}

/**
 * Extension interface for lifecycle management
 */
export interface ILifecycleExtension {
  /** Called when a node enters a new stage */
  onStageEnter(node: MeldNode, stage: NodeLifecycle, context: ProcessingContext): Promise<void>;
  
  /** Called when a node exits a stage */
  onStageExit(node: MeldNode, stage: NodeLifecycle, context: ProcessingContext): Promise<void>;
  
  /** Get lifecycle metadata for a node */
  getLifecycleMetadata(node: MeldNode): LifecycleMetadata | undefined;
}