/**
 * Publishing strategy pattern interface
 */

import { PublishContext, PublishResult } from './PublishingTypes';

export interface PublishingStrategy {
  name: string;
  
  /**
   * Determines if this strategy can handle the given context
   */
  canHandle(context: PublishContext): boolean;
  
  /**
   * Executes the publishing strategy
   */
  execute(context: PublishContext): Promise<PublishResult>;
  
  /**
   * Rollback changes if execution fails
   */
  rollback?(context: PublishContext): Promise<void>;
  
  /**
   * Validate context before execution
   */
  validate?(context: PublishContext): Promise<void>;
}

export interface ValidationStep {
  name: string;
  
  /**
   * Validates the module data
   */
  validate(module: any): Promise<any>; // Will be properly typed once we extract ModuleData
  
  /**
   * Enhances the module data if validation passes
   */
  enhance?(module: any): Promise<any>;
}

export interface DecisionPoint<T = any> {
  name: string;
  
  /**
   * Determines if this decision point should prompt the user
   */
  shouldPrompt(context: PublishContext): boolean;
  
  /**
   * Prompts the user for a decision
   */
  prompt(context: PublishContext): Promise<T>;
  
  /**
   * Applies the user's choice to the context
   */
  applyChoice(choice: T, context: PublishContext): PublishContext;
  
  /**
   * Validates the user's choice
   */
  validate?(choice: T): boolean;
}