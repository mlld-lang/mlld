import type { 
  SecurityPolicy, 
  PolicyDecision, 
  CommandAnalysis,
  SecurityMetadata,
  TrustLevel
} from './types';

/**
 * Policy Manager interface - evaluates security rules based on policies
 */
export interface PolicyManager {
  /**
   * Load the global security policy from ~/.config/mlld/mlld.lock.json
   */
  loadGlobalPolicy(): Promise<SecurityPolicy>;
  
  /**
   * Load the project security policy from ./mlld.lock.json
   */
  loadProjectPolicy(): Promise<SecurityPolicy>;
  
  /**
   * Merge policies with proper precedence rules
   * Security flows down (restrictive wins), performance bubbles up (specific wins)
   */
  mergePolicy(
    global: SecurityPolicy, 
    project: SecurityPolicy, 
    inline?: SecurityMetadata
  ): SecurityPolicy;
  
  /**
   * Evaluate if a command is allowed to execute
   */
  evaluateCommand(command: string, analysis: CommandAnalysis, policy: SecurityPolicy): PolicyDecision;
  
  /**
   * Evaluate if a path operation is allowed
   */
  evaluatePath(path: string, operation: 'read' | 'write', policy: SecurityPolicy): PolicyDecision;
  
  /**
   * Evaluate if an import is allowed
   */
  evaluateImport(url: string, policy: SecurityPolicy): PolicyDecision;
  
  /**
   * Evaluate if a resolver is allowed
   */
  evaluateResolver(resolver: string, policy: SecurityPolicy): PolicyDecision;
  
  /**
   * Get the effective policy for the current context
   */
  getEffectivePolicy(context?: SecurityMetadata): Promise<SecurityPolicy>;
  
  /**
   * Check if a trust level is more restrictive than another
   */
  isMoreRestrictive(level1: TrustLevel, level2: TrustLevel): boolean;
}