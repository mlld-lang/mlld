/**
 * Utilities for resolving shell aliases in command execution
 * 
 * This helps mlld work with shell aliases by attempting to resolve them
 * to their actual commands before execution.
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import path from 'path';
import * as shellQuote from 'shell-quote';

export interface AliasResolutionResult {
  /** Whether the command was resolved as an alias */
  wasAlias: boolean;
  /** The resolved command (full path if alias, original if not) */
  resolvedCommand: string;
  /** The original command that was attempted */
  originalCommand: string;
}

function replaceCommandPrefix(command: string, replacement: string): string {
  const match = command.match(/^(\s*)\S+(.*)$/s);
  if (!match) {
    return replacement;
  }
  const [, leadingWhitespace, rest] = match;
  return `${leadingWhitespace}${replacement}${rest}`;
}

function parseShebang(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('#!')) {
    return null;
  }

  const raw = trimmed.slice(2).trim();
  if (!raw) {
    return null;
  }

  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return null;
  }

  if (path.basename(parts[0]) === 'env') {
    let envArgs = parts.slice(1);
    if (envArgs[0] === '-S') {
      envArgs = envArgs.slice(1);
    }
    return envArgs.length > 0 ? envArgs : null;
  }

  return parts;
}

function readShebangCommand(executablePath: string): string[] | null {
  try {
    const firstLine = readFileSync(executablePath, 'utf8').split(/\r?\n/, 1)[0] ?? '';
    return parseShebang(firstLine);
  } catch {
    return null;
  }
}

function resolveCommandPath(commandName: string): string | null {
  try {
    const userShell = process.env.SHELL || '/bin/bash';
    const whichResult = execSync(`${userShell} -lc "command -v ${commandName}"`, {
      encoding: 'utf8',
      timeout: 1000,
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();

    if (whichResult && whichResult !== commandName) {
      return whichResult;
    }
  } catch {
    // command -v failed, fall through to common paths
  }

  return tryCommonAliasLocations(commandName);
}

function expandExecutableTokens(
  executablePath: string,
  visited: Set<string> = new Set()
): string[] {
  const shebang = readShebangCommand(executablePath);
  if (!shebang || shebang.length === 0) {
    return [executablePath];
  }

  const [interpreter, ...interpreterArgs] = shebang;
  let interpreterTokens: string[] | null = null;

  if (path.isAbsolute(interpreter)) {
    interpreterTokens = existsSync(interpreter) ? [interpreter] : null;
  } else if (!visited.has(interpreter)) {
    const nextVisited = new Set(visited);
    nextVisited.add(interpreter);
    const resolvedInterpreterPath = resolveCommandPath(interpreter);
    if (resolvedInterpreterPath) {
      interpreterTokens = expandExecutableTokens(resolvedInterpreterPath, nextVisited);
    }
  }

  if (!interpreterTokens || interpreterTokens.length === 0) {
    return [executablePath];
  }

  return [...interpreterTokens, ...interpreterArgs, executablePath];
}

function resolveExecutablePrefix(prefixCommand: string): string {
  const parsed = shellQuote.parse(prefixCommand);
  if (parsed.length === 0 || parsed.some(part => typeof part !== 'string')) {
    return prefixCommand;
  }

  const tokens = parsed as string[];
  const [firstToken, ...restTokens] = tokens;

  if (path.isAbsolute(firstToken) && existsSync(firstToken)) {
    return shellQuote.quote([...expandExecutableTokens(firstToken), ...restTokens]);
  }

  return prefixCommand;
}

/**
 * Attempts to resolve a command through shell aliases
 * 
 * @param command - The command to resolve
 * @returns Resolution result with the resolved command
 */
const SHELL_BUILTINS = new Set([
  'echo', 'cd', 'pwd', 'test', '[', 'true', 'false', 'exit',
  'export', 'unset', 'set', 'source', '.', 'eval', 'exec',
  'read', 'printf', 'kill', 'jobs', 'bg', 'fg', 'wait',
  'type', 'hash', 'alias', 'unalias', 'history', 'fc',
  'times', 'trap', 'ulimit', 'umask', 'getopts', 'shift',
  'break', 'continue', 'return', 'local', 'declare', 'typeset'
]);

// just-bash already implements these commands inside workspace-backed sh {}
// sessions. Re-aliasing them to host binaries breaks box/VFS execution.
const SHELL_SESSION_NATIVE_COMMANDS = new Set([
  'echo', 'cat', 'printf', 'ls', 'mkdir', 'rmdir', 'touch', 'rm', 'cp', 'mv',
  'ln', 'chmod', 'pwd', 'readlink', 'head', 'tail', 'wc', 'stat', 'grep',
  'fgrep', 'egrep', 'rg', 'sed', 'awk', 'sort', 'uniq', 'comm', 'cut', 'paste',
  'tr', 'rev', 'nl', 'fold', 'expand', 'unexpand', 'strings', 'split', 'column',
  'join', 'tee', 'find', 'basename', 'dirname', 'tree', 'du', 'env', 'printenv',
  'alias', 'unalias', 'history', 'xargs', 'true', 'false', 'clear', 'bash', 'sh',
  'jq', 'base64', 'diff', 'date', 'sleep', 'timeout', 'time', 'seq', 'expr',
  'md5sum', 'sha1sum', 'sha256sum', 'file', 'html-to-markdown', 'help', 'which',
  'tac', 'hostname', 'whoami', 'od', 'gzip', 'gunzip', 'zcat', 'tar', 'yq',
  'xan', 'sqlite3', 'python3', 'python', 'curl'
]);

function normalizeCommandCandidate(candidate: string): string {
  const trimmed = candidate.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function requiresHostShellExecution(code: string): boolean {
  const candidates = extractCommandCandidates(code);
  return candidates.some(candidate => {
    const normalized = normalizeCommandCandidate(candidate);
    return (
      normalized.length > 0 &&
      !SHELL_BUILTINS.has(normalized) &&
      !SHELL_SESSION_NATIVE_COMMANDS.has(normalized)
    );
  });
}

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

  if (SHELL_BUILTINS.has(commandName)) {
    return {
      wasAlias: false,
      resolvedCommand: command,
      originalCommand
    };
  }
  
  try {
    // Method 1: Try to get alias definition using the user's actual shell
    // Use -l (login) to source profile/rc files for full PATH and aliases.
    // DO NOT use -i (interactive) — interactive shells call tcsetpgrp() for
    // job control, which sends SIGTTIN in non-foreground process groups
    // (e.g. vitest workers), causing "zsh: suspended (tty input)".
    // Using $SHELL ensures zsh users get their .zshrc PATH entries.
    const userShell = process.env.SHELL || '/bin/bash';
    const aliasResult = execSync(`${userShell} -lc "alias ${commandName} 2>/dev/null || echo 'NOT_FOUND'"`, {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    
    if (aliasResult && aliasResult !== 'NOT_FOUND' && aliasResult.includes('=')) {
      // Parse alias definition: "alias claude='/Users/adam/.claude/local/claude'"
      const match = aliasResult.match(/alias\s+\w+='([^']+)'/);
      if (match) {
        const aliasTarget = resolveExecutablePrefix(match[1]);
        const resolvedCommand = replaceCommandPrefix(command, aliasTarget);
        
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
  
  // Method 2/3: Try command -v and common executable locations.
  const resolvedPath = resolveCommandPath(commandName);
  if (resolvedPath) {
    const executableTokens = expandExecutableTokens(resolvedPath);
    const resolvedPrefix = shellQuote.quote(executableTokens);
    const resolvedCommand = replaceCommandPrefix(command, resolvedPrefix);
    return {
      wasAlias: false,
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
    path.join(home, '.bun', 'bin', commandName),
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

/**
 * Extract command-position words from bash code.
 * Splits on newlines and command separators, takes the first word of each
 * segment, and filters out builtins, assignments, comments, and variables.
 */
export function extractCommandCandidates(code: string): string[] {
  const candidates = new Set<string>();
  for (const line of code.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    // Split on command separators: |, &&, ||, ;
    for (const segment of trimmed.split(/\|{1,2}|&&|;/)) {
      const word = segment.trim().split(/\s+/)[0];
      if (
        !word ||
        word.startsWith('#') ||
        word.startsWith('$') ||
        word.startsWith('(') ||
        word.includes('=') ||
        SHELL_BUILTINS.has(word)
      ) continue;
      // Skip bash keywords
      if (['if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'until',
           'do', 'done', 'case', 'esac', 'in', 'function', '{', '}',
           '!', 'select', 'coproc', 'time'].includes(word)) continue;
      candidates.add(word);
    }
  }
  return Array.from(candidates);
}

/**
 * Build a bash preamble that enables alias expansion and defines aliases
 * for any command candidates that resolve to a different executable path.
 *
 * This keeps sh {} blocks working inside PATH-restricted environments such
 * as boxes: we resolve the binary on the host, then alias the bare command
 * name to that absolute path inside the sandboxed shell.
 */
export function buildAliasPreamble(code: string): string {
  if (process.env.MLLD_RESOLVE_ALIASES === 'false' || process.env.NODE_ENV === 'test') return '';
  const candidates = extractCommandCandidates(code);
  const aliases: string[] = [];
  for (const cmd of candidates) {
    const result = resolveAliasWithCache(cmd, { timeout: 2000, cache: true });
    const shouldAlias =
      result.wasAlias ||
      (
        result.resolvedCommand !== result.originalCommand &&
        !SHELL_SESSION_NATIVE_COMMANDS.has(cmd)
      );
    if (shouldAlias) {
      // Escape single quotes in the resolved path
      const escaped = result.resolvedCommand.replace(/'/g, "'\\''");
      aliases.push(`alias ${cmd}='${escaped}'`);
    }
  }
  if (aliases.length === 0) return '';
  return `shopt -s expand_aliases\n${aliases.join('\n')}\n`;
}
