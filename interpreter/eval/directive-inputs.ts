import type { DirectiveNode } from '@core/types';
import type { Environment } from '../env/Environment';

/**
 * Extract and evaluate directive inputs for hook consumption.
 * Phase 3.5 scaffolding: returns an empty array placeholder until
 * directive-specific extraction logic lands in later phases.
 */
export async function extractDirectiveInputs(
  _directive: DirectiveNode,
  _env: Environment
): Promise<readonly unknown[]> {
  return [];
}
