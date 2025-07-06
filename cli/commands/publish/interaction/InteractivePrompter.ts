/**
 * Interactive decision manager for publishing workflow
 */

import { DecisionPoint } from '../types/PublishingStrategy';
import { PublishContext } from '../types/PublishingTypes';
import { MetadataCommitDecision } from './MetadataCommitDecision';
import { PublishingMethodDecision } from './PublishingMethodDecision';

export class InteractivePrompter {
  private decisions: DecisionPoint[];

  constructor() {
    this.decisions = [
      new MetadataCommitDecision(),
      new PublishingMethodDecision()
    ];
  }

  async collectDecisions(context: PublishContext): Promise<PublishContext> {
    let currentContext = context;

    for (const decision of this.decisions) {
      if (decision.shouldPrompt(currentContext)) {
        const choice = await decision.prompt(currentContext);
        
        if (decision.validate && !decision.validate(choice)) {
          throw new Error(`Invalid choice for ${decision.name}`);
        }
        
        currentContext = decision.applyChoice(choice, currentContext);
      }
    }

    return currentContext;
  }

  addDecision(decision: DecisionPoint): void {
    this.decisions.push(decision);
  }
}