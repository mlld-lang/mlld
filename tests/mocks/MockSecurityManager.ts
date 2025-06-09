import type { SecurityConfig } from '../utils/EnvironmentFactory';

// Type definitions for mock SecurityManager
export interface SecurityDecision {
  allowed: boolean;
  requiresApproval?: boolean;
  blocked?: boolean;
  reason?: string;
  risks?: Array<{
    level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    type: string;
    description: string;
  }>;
}

export interface SecurityContext {
  file?: string;
  line?: number;
  directive?: string;
  user?: string;
  metadata?: {
    ttl?: number;
    trust?: 'high' | 'medium' | 'low' | 'verify' | 'block';
    requireHash?: boolean;
  };
}

export enum TaintLevel {
  TRUSTED = 'trusted',
  USER_INPUT = 'user_input',
  FILE_SYSTEM = 'file_system',
  NETWORK = 'network',
  LLM_OUTPUT = 'llm_output',
  COMMAND_OUTPUT = 'command_output',
  MIXED = 'mixed'
}

/**
 * Mock SecurityManager for testing with comprehensive call tracking and verification
 * Provides configurable behavior and detailed operation logging
 */
export class MockSecurityManager {
  private config: SecurityConfig;
  
  // Decision overrides for testing
  private commandDecisions = new Map<string, SecurityDecision>();
  private pathDecisions = new Map<string, boolean>();
  private importDecisions = new Map<string, boolean>();
  private taintData = new Map<string, TaintLevel>();
  
  // Call tracking for verification
  private commandCheckCalls: Array<{
    command: string;
    context?: SecurityContext;
    result: SecurityDecision;
    timestamp: number;
  }> = [];
  
  private pathCheckCalls: Array<{
    path: string;
    operation: string;
    context?: SecurityContext;
    result: boolean;
    timestamp: number;
  }> = [];
  
  private taintOperations: Array<{
    value: any;
    source: string;
    taintLevel: TaintLevel;
    timestamp: number;
  }> = [];
  
  private policyEvaluations: Array<{
    type: 'command' | 'path' | 'import' | 'resolver';
    input: any;
    result: any;
    timestamp: number;
  }> = [];
  
  private importApprovals: Array<{
    url: string;
    content: string;
    advisories: any[];
    result: boolean;
    timestamp: number;
  }> = [];

  constructor(config: SecurityConfig) {
    this.config = config;
  }

  /**
   * Mock command security check with configurable behavior
   */
  async checkCommand(command: string, context?: SecurityContext, skipApproval: boolean = false): Promise<SecurityDecision> {
    // Check for explicit mock decision first
    if (this.commandDecisions.has(command)) {
      const decision = this.commandDecisions.get(command)!;
      this.commandCheckCalls.push({
        command,
        context,
        result: decision,
        timestamp: Date.now()
      });
      return decision;
    }

    // Default behavior based on config and command analysis
    const decision = this.evaluateDefaultCommandPolicy(command, context);
    
    this.commandCheckCalls.push({
      command,
      context,
      result: decision,
      timestamp: Date.now()
    });
    
    this.policyEvaluations.push({
      type: 'command',
      input: { command, context },
      result: decision,
      timestamp: Date.now()
    });

    return decision;
  }

  /**
   * Mock path access security check
   */
  async checkPath(path: string, operation: 'read' | 'write', context?: SecurityContext): Promise<boolean> {
    const key = `${path}:${operation}`;
    
    // Check for explicit mock decision
    const result = this.pathDecisions.get(key) ?? this.evaluateDefaultPathPolicy(path, operation, context);
    
    this.pathCheckCalls.push({
      path,
      operation,
      context,
      result,
      timestamp: Date.now()
    });
    
    this.policyEvaluations.push({
      type: 'path',
      input: { path, operation, context },
      result,
      timestamp: Date.now()
    });

    return result;
  }

  /**
   * Mock taint tracking
   */
  trackTaint(value: any, source: string): void {
    const taintLevel = this.convertSourceToTaintLevel(source);
    const id = typeof value === 'string' ? value : JSON.stringify(value);
    
    this.taintData.set(id, taintLevel);
    this.taintOperations.push({
      value,
      source,
      taintLevel,
      timestamp: Date.now()
    });
  }

  /**
   * Get taint information for a value
   */
  getTaint(value: any): { level: TaintLevel; source: string } | null {
    const id = typeof value === 'string' ? value : JSON.stringify(value);
    const level = this.taintData.get(id);
    
    if (level) {
      return {
        level,
        source: level // For simplicity, use level as source
      };
    }
    
    return null;
  }

  /**
   * Mock import approval check
   */
  async approveImport(url: string, content: string, advisories: any[] = [], context?: SecurityContext): Promise<boolean> {
    const result = this.importDecisions.get(url) ?? this.evaluateDefaultImportPolicy(url, content, advisories);
    
    this.importApprovals.push({
      url,
      content,
      advisories,
      result,
      timestamp: Date.now()
    });
    
    return result;
  }

  /**
   * Mock import resolution
   */
  async resolveImport(importURL: string): Promise<{
    resolvedURL: string;
    taint: TaintLevel;
    advisories: any[];
  }> {
    return {
      resolvedURL: importURL,
      taint: TaintLevel.NETWORK,
      advisories: []
    };
  }

  /**
   * Mock resolver check
   */
  async checkResolver(resolverName: string, context?: SecurityContext): Promise<boolean> {
    // Default: allow all resolvers in test mode
    return true;
  }

  // === Mock Configuration Methods ===

  /**
   * Configure command decision override
   */
  mockCommandDecision(command: string, decision: SecurityDecision): void {
    this.commandDecisions.set(command, decision);
  }

  /**
   * Configure path access decision override
   */
  mockPathDecision(path: string, operation: 'read' | 'write', allowed: boolean): void {
    this.pathDecisions.set(`${path}:${operation}`, allowed);
  }

  /**
   * Configure import decision override
   */
  mockImportDecision(url: string, allowed: boolean): void {
    this.importDecisions.set(url, allowed);
  }

  /**
   * Pre-populate taint data for testing
   */
  mockTaintData(value: any, taintLevel: TaintLevel): void {
    const id = typeof value === 'string' ? value : JSON.stringify(value);
    this.taintData.set(id, taintLevel);
  }

  // === Verification Methods ===

  /**
   * Get all command check calls for verification
   */
  getCommandCheckCalls(): typeof this.commandCheckCalls {
    return [...this.commandCheckCalls];
  }

  /**
   * Get all path check calls for verification
   */
  getPathCheckCalls(): typeof this.pathCheckCalls {
    return [...this.pathCheckCalls];
  }

  /**
   * Get all taint operations for verification
   */
  getTaintOperations(): typeof this.taintOperations {
    return [...this.taintOperations];
  }

  /**
   * Get all policy evaluations for verification
   */
  getPolicyEvaluations(): typeof this.policyEvaluations {
    return [...this.policyEvaluations];
  }

  /**
   * Get all import approvals for verification
   */
  getImportApprovals(): typeof this.importApprovals {
    return [...this.importApprovals];
  }

  /**
   * Check if a specific command was checked
   */
  wasCommandChecked(command: string): boolean {
    return this.commandCheckCalls.some(call => call.command === command);
  }

  /**
   * Get total number of command checks
   */
  getCommandCheckCount(): number {
    return this.commandCheckCalls.length;
  }

  /**
   * Check if a specific path was checked
   */
  wasPathChecked(path: string, operation?: 'read' | 'write'): boolean {
    return this.pathCheckCalls.some(call => 
      call.path === path && (operation ? call.operation === operation : true)
    );
  }

  /**
   * Check if taint was tracked for a specific value
   */
  wasTaintTracked(value: any): boolean {
    return this.taintOperations.some(op => 
      JSON.stringify(op.value) === JSON.stringify(value)
    );
  }

  /**
   * Reset all tracking data for test isolation
   */
  reset(): void {
    this.commandCheckCalls = [];
    this.pathCheckCalls = [];
    this.taintOperations = [];
    this.policyEvaluations = [];
    this.importApprovals = [];
    
    // Keep configured overrides but clear tracking data
    // Don't clear commandDecisions, pathDecisions, etc. as they're test configuration
  }

  /**
   * Clear all configuration and tracking data
   */
  fullReset(): void {
    this.reset();
    this.commandDecisions.clear();
    this.pathDecisions.clear();
    this.importDecisions.clear();
    this.taintData.clear();
  }

  // === Private Helper Methods ===

  private evaluateDefaultCommandPolicy(command: string, context?: SecurityContext): SecurityDecision {
    // Configurable default behavior
    if (this.config.defaultTrust === 'block') {
      return { allowed: false, reason: 'Blocked by default policy' };
    }

    // Check for dangerous patterns (customizable for testing)
    if (command.includes('dangerous') || command.includes('rm -rf') || command.includes('sudo')) {
      return { 
        allowed: false, 
        reason: 'Dangerous command detected',
        risks: [{
          level: 'HIGH',
          type: 'destructive',
          description: 'Command may be destructive'
        }]
      };
    }

    // Trust level from context
    const trust = context?.metadata?.trust;
    if (trust === 'block') {
      return { allowed: false, reason: 'Blocked by trust level' };
    }

    if (trust === 'verify' || this.config.defaultTrust === 'verify') {
      return { 
        allowed: true, 
        requiresApproval: true, 
        reason: 'Requires approval per trust level' 
      };
    }

    // Default: allow
    return { allowed: true, reason: 'Allowed by default policy' };
  }

  private evaluateDefaultPathPolicy(path: string, operation: string, context?: SecurityContext): boolean {
    // Block paths containing "blocked" for testing
    if (path.includes('blocked') || path.includes('/etc/') || path.includes('/root/')) {
      return false;
    }

    // Allow everything else by default in test mode
    return true;
  }

  private evaluateDefaultImportPolicy(url: string, content: string, advisories: any[]): boolean {
    // Block URLs containing "blocked" for testing
    if (url.includes('blocked') || url.includes('malicious')) {
      return false;
    }

    // Block if there are critical advisories
    if (advisories.some(adv => adv.severity === 'critical')) {
      return false;
    }

    return true;
  }

  private convertSourceToTaintLevel(source: string): TaintLevel {
    switch (source.toLowerCase()) {
      case 'trusted': return TaintLevel.TRUSTED;
      case 'user_input': return TaintLevel.USER_INPUT;
      case 'file_system': return TaintLevel.FILE_SYSTEM;
      case 'network': return TaintLevel.NETWORK;
      case 'llm_output': return TaintLevel.LLM_OUTPUT;
      case 'command_output': return TaintLevel.COMMAND_OUTPUT;
      default: return TaintLevel.MIXED;
    }
  }
}