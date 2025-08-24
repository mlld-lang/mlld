/**
 * Utilities for resolving shell aliases in command execution
 * 
 * This helps mlld work with shell aliases by attempting to resolve them
 * to their actual commands before execution.
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { homedir } from 'os';
import path from 'path';

export interface AliasResolutionResult {
  /** Whether the command was resolved as an alias */
  wasAlias: boolean;
  /** The resolved command (full path if alias, original if not) */
  resolvedCommand: string;
  /** The original command that was attempted */
  originalCommand: string;
}

/**
 * Attempts to resolve a command through shell aliases
 * 
 * @param command - The command to resolve
 * @returns Resolution result with the resolved command
 */
export function resolveAlias(command: string): AliasResolutionResult {
  const originalCommand = command;
  
  // Extract just the command name (first word)
  const commandName = command.trim().split(/\s+/)[0];
  
  if (!commandName) {
    return {
      wasAlias: false,
      resolvedCommand: command,
      originalCommand
    };
  }
  
  // Don't resolve shell built-in commands - they have specific shell behavior
  // that differs from their external binary counterparts
  const shellBuiltins = [
    'echo', 'cd', 'pwd', 'test', '[', 'true', 'false', 'exit',
    'export', 'unset', 'set', 'source', '.', 'eval', 'exec',
    'read', 'printf', 'kill', 'jobs', 'bg', 'fg', 'wait',
    'type', 'hash', 'alias', 'unalias', 'history', 'fc',
    'times', 'trap', 'ulimit', 'umask', 'getopts', 'shift',
    'break', 'continue', 'return', 'local', 'declare', 'typeset'
  ];
  
  if (shellBuiltins.includes(commandName)) {
    return {
      wasAlias: false,
      resolvedCommand: command,
      originalCommand
    };
  }
  
  try {
    // Method 1: Try to get alias definition using bash -c
    // This runs in an interactive-like context that loads aliases
    const aliasResult = execSync(`bash -ic "alias ${commandName} 2>/dev/null || echo 'NOT_FOUND'"`, {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    
    if (aliasResult && aliasResult !== 'NOT_FOUND' && aliasResult.includes('=')) {
      // Parse alias definition: "alias claude='/Users/adam/.claude/local/claude'"
      const match = aliasResult.match(/alias\s+\w+='([^']+)'/);
      if (match) {
        const aliasTarget = match[1];
        // Replace the command name with the alias target
        const resolvedCommand = command.replace(commandName, aliasTarget);
        
        return {
          wasAlias: true,
          resolvedCommand,
          originalCommand
        };
      }
    }
  } catch (error) {
    // Alias resolution failed, try other methods
  }
  
  try {
    // Method 2: Try which command to see if it's in PATH
    const whichResult = execSync(`which ${commandName}`, {
      encoding: 'utf8',
      timeout: 1000,
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    
    if (whichResult && whichResult !== commandName) {
      // which found a different path, use it
      const resolvedCommand = command.replace(commandName, whichResult);
      return {
        wasAlias: false, // Not technically an alias, but resolved
        resolvedCommand,
        originalCommand
      };
    }
  } catch (error) {
    // which failed, command might not exist
  }
  
  // Method 3: Check common alias locations
  const aliasPath = tryCommonAliasLocations(commandName);
  if (aliasPath) {
    const resolvedCommand = command.replace(commandName, aliasPath);
    return {
      wasAlias: true,
      resolvedCommand,
      originalCommand
    };
  }
  
  // No resolution found, return original
  return {
    wasAlias: false,
    resolvedCommand: command,
    originalCommand
  };
}

/**
 * Check common locations where aliases might point to executables
 */
function tryCommonAliasLocations(commandName: string): string | null {
  const home = homedir();
  
  // Common alias target patterns
  const commonPaths = [
    path.join(home, `.${commandName}`, 'local', commandName),
    path.join(home, `.${commandName}`, commandName),
    path.join(home, '.local', 'bin', commandName),
    path.join(home, 'bin', commandName),
    path.join(home, '.cargo', 'bin', commandName),
    path.join(home, '.npm-global', 'bin', commandName),
    `/opt/homebrew/bin/${commandName}`,
    `/usr/local/bin/${commandName}`
  ];
  
  for (const candidatePath of commonPaths) {
    if (existsSync(candidatePath)) {
      return candidatePath;
    }
  }
  
  return null;
}

/**
 * Configuration for alias resolution behavior
 */
export interface AliasResolutionConfig {
  /** Whether to enable alias resolution (default: true) */
  enabled: boolean;
  /** Timeout for alias resolution in ms (default: 2000) */
  timeout: number;
  /** Whether to cache resolved aliases (default: true) */
  cache: boolean;
}

/**
 * Simple cache for resolved aliases to avoid repeated shell calls
 */
const aliasCache = new Map<string, AliasResolutionResult>();

/**
 * Resolve alias with caching support
 */
export function resolveAliasWithCache(
  command: string, 
  config: Partial<AliasResolutionConfig> = {}
): AliasResolutionResult {
  const fullConfig: AliasResolutionConfig = {
    enabled: true,
    timeout: 2000,
    cache: true,
    ...config
  };
  
  if (!fullConfig.enabled) {
    return {
      wasAlias: false,
      resolvedCommand: command,
      originalCommand: command
    };
  }
  
  const cacheKey = command.trim();
  
  if (fullConfig.cache && aliasCache.has(cacheKey)) {
    return aliasCache.get(cacheKey)!;
  }
  
  const result = resolveAlias(command);
  
  if (fullConfig.cache) {
    aliasCache.set(cacheKey, result);
  }
  
  return result;
}

/**
 * Clear the alias resolution cache
 */
export function clearAliasCache(): void {
  aliasCache.clear();
}
