import * as shellQuote from 'shell-quote';

/**
 * CommandUtils provides utilities for command validation, parsing, and enhancement.
 * These are pure utility functions with no state dependencies.
 */
export class CommandUtils {
  
  /**
   * Validate and parse command for security
   * Blocks dangerous shell operators that could be used maliciously
   * Uses shell-quote library for accurate operator detection
   */
  static validateAndParseCommand(command: string): string {
    // Use shell-quote to parse the command and detect operators
    const parsed = shellQuote.parse(command);
    
    // List of allowed operators (pipes are OK for command chaining)
    const allowedOperators = new Set(['|']);
    
    // List of banned operators that could be dangerous
    const bannedOperators = new Set([
      '&&',  // AND operator
      '||',  // OR operator
      ';',   // Command separator
      // '>',   // Output redirect - Allowed: just writes to local files
      // '>>',  // Append redirect - Allowed: just appends to local files  
      // '<',   // Input redirect - Allowed: just reads from local files
      '&'    // Background execution - Still dangerous (zombie processes)
    ]);
    
    // Check for dangerous operators
    for (const token of parsed) {
      if (typeof token === 'object' && 'op' in token) {
        const operator = token.op;
        if (bannedOperators.has(operator)) {
          // Create a helpful error message with the actual command and operator
          const operatorDescriptions: Record<string, string> = {
            '&&': 'AND operator (&&)',
            '||': 'OR operator (||)',
            ';': 'semicolon (;)',
            '&': 'background execution (&)'
          };
          
          const description = operatorDescriptions[operator] || `operator (${operator})`;
          
          // Build a detailed error message
          const errorMessage = [
            `Shell ${description} is not allowed in /run commands`,
            '',
            'Command rejected:',
            `  ${command}`,
            '',
            `The ${description} character is not allowed in the /run context.`,
            'Use a full shell command with /run sh { ... } for less restrictive execution,',
            'or split into separate /run commands.'
          ].join('\n');
          
          throw new Error(errorMessage);
        }
      }
    }
    
    // Command passed validation, return as-is
    return command;
  }

  /**
   * Enhance shell code for command substitution
   * Adds stderr capture and output normalization for problematic patterns
   */
  static enhanceShellCodeForCommandSubstitution(code: string): string {
    // Pattern to match command substitution that doesn't already have stderr redirection
    // Matches: $(...) where ... doesn't contain "2>&1" or "2>/dev/null"
    const commandSubstitutionPattern = /\$\(([^)]*)\)/g;
    
    const enhancedCode = code.replace(commandSubstitutionPattern, (match, innerCommand) => {
      if (typeof innerCommand !== 'string') {
        return match;
      }
      // Check if this looks like an interactive command pattern that might write to stderr
      const interactivePatterns = [
        /if\s*\[\s*-t\s+[01]\s*\]/,  // TTY detection: if [ -t 0 ] or if [ -t 1 ]
        /echo\s+.*\s+>&2/,           // Direct stderr output: echo "..." >&2
        /\|\|\s*echo/,               // Fallback pattern: command || echo
        /python3?\s+-c/,             // Python scripts that might detect TTY
        /node\s+-e/,                 // Node scripts that might detect TTY
        /sh\s+-c\s+.*>&2/,           // Shell commands with stderr: sh -c '... >&2'
        /echo.*&&.*echo.*>&2/,       // Commands with multiple echo, one to stderr
      ];
      
      const needsStderrCapture = interactivePatterns.some(pattern => pattern.test(innerCommand));
      const hasStderrRedirection = innerCommand.includes('2>&1') || innerCommand.includes('2>/dev/null') || innerCommand.includes('2>');
      
      // Check if stderr redirection is at the end of the command (common pattern)
      const hasTrailingStderrRedirection = /\s+2>&1\s*$/.test(innerCommand);
      
      if (needsStderrCapture && !hasStderrRedirection) {
        // Add stderr capture to the command substitution and normalize whitespace
        return `$(${innerCommand.trim()} 2>&1 | tr '\\n' ' ' | sed 's/[[:space:]]*$//')`;
      } else if (hasStderrRedirection && (needsStderrCapture || hasTrailingStderrRedirection)) {
        // For commands that already capture stderr but might have multi-line output, normalize whitespace
        // Remove the trailing 2>&1 and re-add it after normalization
        const cleanCommand = innerCommand.replace(/\s+2>&1\s*$/, '').trim();
        return `$(${cleanCommand} 2>&1 | tr '\\n' ' ' | sed 's/[[:space:]]*$//')`;
      } else if (innerCommand.includes('&&') || innerCommand.includes('||')) {
        // For commands with && or || that might produce multi-line output, normalize whitespace
        // Wrap the command in parentheses to ensure proper precedence
        return `$({ ${innerCommand.trim()}; } | tr '\\n' ' ' | sed 's/[[:space:]]*$//')`;
      }
      
      return match;
    });
    
    // Also add stderr capture for direct commands that might write to stderr when no TTY
    // This helps with direct execution cases
    const hasDirectStderrPattern = /echo\s+.*\s+>&2/;
    if (hasDirectStderrPattern.test(code) && !code.includes('2>&1')) {
      // For direct commands that write to stderr, we need to ensure they're captured
      // But we need to be careful not to break existing functionality
      // This is more complex and should be handled case by case
    }
    
    return enhancedCode;
  }

  /**
   * Check if a command appears to be safe for execution
   * This is a basic heuristic check, not a comprehensive security analysis
   */
  static isSafeCommand(command: string): boolean {
    try {
      CommandUtils.validateAndParseCommand(command);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Extract command name from a command string
   * Returns the first word (command) from the command string
   */
  static extractCommandName(command: string): string {
    const trimmed = command.trim();
    const firstSpace = trimmed.indexOf(' ');
    return firstSpace === -1 ? trimmed : trimmed.substring(0, firstSpace);
  }

  /**
   * Check if command requires shell enhancement
   */
  static requiresShellEnhancement(command: string): boolean {
    const stderrProducers = [
      /curl\s+/,
      /wget\s+/,
      /git\s+/,
      /npm\s+/,
      /yarn\s+/,
      /pip\s+/,
      /docker\s+/,
      /kubectl\s+/,
      /python\s+[^|&;]+\.py/,
      /node\s+[^|&;]+\.js/
    ];

    return stderrProducers.some(pattern => pattern.test(command));
  }

  /**
   * Check if command contains an actual pipe operator (quote-aware)
   * Uses shell-quote to properly detect pipes vs pipe characters in strings
   */
  static hasPipeOperator(command: string): boolean {
    const parsed = shellQuote.parse(command);
    return parsed.some(token =>
      typeof token === 'object' &&
      'op' in token &&
      token.op === '|'
    );
  }
}