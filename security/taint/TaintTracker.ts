/**
 * Taint tracking system for mlld
 * Tracks the trust level of data based on its origin
 */

export enum TaintLevel {
  TRUSTED = 'trusted',                  // Literal strings in .mld files
  REGISTRY_SAFE = 'registry_safe',      // Registry import with no advisories
  REGISTRY_WARNING = 'registry_warning', // Registry import with advisories
  GIST_DIRECT = 'gist_direct',         // Direct gist import
  USER_INPUT = 'user_input',           // From user prompts
  FILE_SYSTEM = 'file_system',         // From local files
  NETWORK = 'network',                 // From URLs
  LLM_OUTPUT = 'llm_output',           // From LLM responses - HIGHEST RISK
  COMMAND_OUTPUT = 'command_output',   // From command execution
  MIXED = 'mixed'                      // Combined sources
}

export interface TaintedValue<T = unknown> {
  value: T;
  taint: TaintLevel;
  sources: string[];  // Track origin for forensics
  advisories?: string[]; // Advisory IDs if any
}

/**
 * Tracks taint levels for values throughout execution
 */
export class TaintTracker {
  private taintMap = new Map<string, TaintedValue>();
  
  /**
   * Mark a value with a taint level
   */
  mark<T = unknown>(
    id: string, 
    value: T, 
    taint: TaintLevel, 
    source: string,
    advisoryIds?: string[]
  ): void {
    this.taintMap.set(id, {
      value,
      taint,
      sources: [source],
      advisories: advisoryIds
    });
  }
  
  /**
   * Get taint info for a value
   */
  getTaint<T = unknown>(id: string): TaintedValue<T> | undefined {
    return this.taintMap.get(id) as TaintedValue<T> | undefined;
  }
  
  /**
   * Mark an import based on its source and advisories
   */
  markImport(
    id: string,
    content: string, 
    source: string, 
    advisories: Array<{ id: string }>
  ): TaintLevel {
    let taint: TaintLevel;
    
    if (source.startsWith('mlld://registry/')) {
      taint = advisories.length > 0 
        ? TaintLevel.REGISTRY_WARNING 
        : TaintLevel.REGISTRY_SAFE;
    } else if (source.startsWith('mlld://gist/')) {
      taint = TaintLevel.GIST_DIRECT;
    } else if (source.startsWith('http://') || source.startsWith('https://')) {
      taint = TaintLevel.NETWORK;
    } else {
      taint = TaintLevel.FILE_SYSTEM;
    }
    
    this.mark(
      id, 
      content, 
      taint, 
      source,
      advisories.map(a => a.id)
    );
    
    return taint;
  }
  
  /**
   * Check if a command comes from an LLM
   */
  isLLMCommand(command: string): boolean {
    const llmPatterns = [
      /^(claude|anthropic|ai)/i,
      /^(gpt|openai|chatgpt)/i,
      /^(llm|ai-|ml-)/i,
      /^(bard|gemini|palm)/i,
      /^(mistral|llama|alpaca)/i,
    ];
    
    const baseCommand = command.split(/\s+/)[0];
    return llmPatterns.some(pattern => pattern.test(baseCommand));
  }
  
  /**
   * Mark command output with appropriate taint
   */
  markCommandOutput(
    id: string,
    output: string,
    command: string,
    source: string
  ): TaintLevel {
    // If command is an LLM, mark as LLM_OUTPUT (highest risk)
    const taint = this.isLLMCommand(command) 
      ? TaintLevel.LLM_OUTPUT 
      : TaintLevel.COMMAND_OUTPUT;
    
    this.mark(id, output, taint, `cmd:${command}`);
    return taint;
  }
  
  /**
   * Combine taint levels (always use the most restrictive)
   */
  combineTaint(taints: TaintLevel[]): TaintLevel {
    // Priority order (highest risk first)
    const priority = [
      TaintLevel.LLM_OUTPUT,
      TaintLevel.REGISTRY_WARNING,
      TaintLevel.NETWORK,
      TaintLevel.GIST_DIRECT,
      TaintLevel.COMMAND_OUTPUT,
      TaintLevel.USER_INPUT,
      TaintLevel.REGISTRY_SAFE,
      TaintLevel.FILE_SYSTEM,
      TaintLevel.TRUSTED
    ];
    
    // Find the highest risk taint
    for (const level of priority) {
      if (taints.includes(level)) {
        return level;
      }
    }
    
    return TaintLevel.MIXED;
  }
  
  /**
   * Check if a taint level requires approval for command execution
   */
  requiresApprovalForExecution(taint: TaintLevel): boolean {
    return [
      TaintLevel.LLM_OUTPUT,
      TaintLevel.REGISTRY_WARNING,
      TaintLevel.NETWORK,
      TaintLevel.GIST_DIRECT
    ].includes(taint);
  }
  
  /**
   * Get human-readable description of taint level
   */
  describeTaint(taint: TaintLevel): string {
    const descriptions: Record<TaintLevel, string> = {
      [TaintLevel.TRUSTED]: 'Trusted (literal in source)',
      [TaintLevel.REGISTRY_SAFE]: 'Registry module (no advisories)',
      [TaintLevel.REGISTRY_WARNING]: '⚠️ Registry module with security advisories',
      [TaintLevel.GIST_DIRECT]: 'Direct gist import',
      [TaintLevel.USER_INPUT]: 'User input',
      [TaintLevel.FILE_SYSTEM]: 'Local file',
      [TaintLevel.NETWORK]: 'Network content',
      [TaintLevel.LLM_OUTPUT]: '🚨 LLM-generated content',
      [TaintLevel.COMMAND_OUTPUT]: 'Command output',
      [TaintLevel.MIXED]: 'Mixed sources'
    };
    
    return descriptions[taint] || taint;
  }
}