import * as shellQuote from 'shell-quote';
import type { Variable } from '@core/types/variable';

export type CommandGuidanceContext = 'run' | 'exe' | 'generic';

/**
 * CommandUtils provides utilities for command validation, parsing, and enhancement.
 * These are pure utility functions with no state dependencies.
 */
export class CommandUtils {
  private static readonly COMMAND_FRAGMENT_WARNING_PREFIX = '[cmd warning]';

  static resolveGuidanceContext(directiveType?: string): CommandGuidanceContext {
    const normalized = (directiveType || '').toLowerCase();
    if (normalized === 'run') {
      return 'run';
    }
    if (normalized === 'exec' || normalized === 'exe') {
      return 'exe';
    }
    return 'generic';
  }

  static buildShellBlockGuidance(context: CommandGuidanceContext): string[] {
    const runLines = [
      'Run context:',
      '  run sh(@path) { ... }'
    ];
    const exeLines = [
      'Exe context:',
      '  exe @fn(path) = sh { ... }',
      '',
      'In exe definitions, function parameters are available as shell variables automatically:',
      '  exe @deploy(path) = sh { echo "$path" > out.txt }'
    ];

    if (context === 'run') {
      return runLines;
    }
    if (context === 'exe') {
      return exeLines;
    }
    return [...runLines, ...exeLines];
  }
  
  /**
   * Validate and parse command for security
   * Blocks dangerous shell operators that could be used maliciously
   * Uses shell-quote library for accurate operator detection
   */
  static validateAndParseCommand(
    command: string,
    guidanceContext: CommandGuidanceContext = 'generic'
  ): string {
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
          const guidanceLines = CommandUtils.buildShellBlockGuidance(guidanceContext);
          const errorMessage = [
            `Shell ${description} is not allowed in cmd { } commands`,
            '',
            'Command rejected:',
            `  ${command}`,
            '',
            'Use shell blocks instead of cmd when operators are required.',
            ...guidanceLines
          ].join('\n');
          
          throw new Error(errorMessage);
        }
      }
    }

    const suspiciousFragment = CommandUtils.findSuspiciousEscapedQuotedFragment(command, parsed);
    if (suspiciousFragment) {
      const errorMessage = [
        'Escaped quoted fragment is not allowed in cmd { } commands',
        '',
        'Command rejected:',
        `  ${command}`,
        '',
        'Suspicious fragment:',
        `  ${suspiciousFragment}`,
        '',
        'This usually means a quoted string variable was interpolated back into cmd { }.',
        'Inline the arguments directly in cmd { ... } or use a shell block when you need shell parsing.'
      ].join('\n');

      throw new Error(errorMessage);
    }
    
    // Command passed validation, return as-is
    return command;
  }

  static collectUnsafeInterpolatedFragmentWarnings(
    commandNodes: readonly unknown[] | unknown,
    resolveVariable: (name: string) => Variable | undefined
  ): string[] {
    const warnings: string[] = [];
    const seen = new Set<string>();
    const nodes = Array.isArray(commandNodes)
      ? commandNodes
      : commandNodes === undefined || commandNodes === null
        ? []
        : [commandNodes];

    for (const node of nodes) {
      const identifier = CommandUtils.getInterpolatedVariableIdentifier(node);
      if (!identifier || seen.has(identifier)) {
        continue;
      }

      const variable = resolveVariable(identifier);
      if (!variable) {
        continue;
      }

      const templateRaw = typeof variable.internal?.templateRaw === 'string'
        ? variable.internal.templateRaw
        : undefined;
      const value = typeof variable.value === 'string' ? variable.value : undefined;
      const hasQuotedTemplate = Boolean(templateRaw && /["']/.test(templateRaw));
      const hasQuotedValue = Boolean(value && /["']/.test(value));
      const hasInterpolation = Boolean(variable.source?.hasInterpolation);
      const looksLikeFragment =
        Boolean((templateRaw && /\s/.test(templateRaw)) || (value && /\s/.test(value)));

      if (!hasInterpolation || !looksLikeFragment || (!hasQuotedTemplate && !hasQuotedValue)) {
        continue;
      }

      const templatePreview = CommandUtils.truncateForDisplay(templateRaw ?? value ?? '', 120);
      warnings.push(
        [
          `${CommandUtils.COMMAND_FRAGMENT_WARNING_PREFIX} @${identifier} is being reused as a cmd fragment,`,
          'but it was built from an interpolated quoted template:',
          '',
          `  \`${templatePreview}\``,
          '',
          'Interpolated values with quotes (etc) can break the command.',
          'Pipe the value in instead: `@var | cmd { ... }`.'
        ].join('\n')
      );
      seen.add(identifier);
    }

    return warnings;
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
   * Parse a validated simple command into argv for direct spawn/execFile usage.
   * Returns null when the command still depends on shell semantics such as
   * redirection, pipes, env assignment objects, or other non-string tokens.
   */
  static parseDirectCommand(
    command: string
  ): { command: string; args: string[] } | null {
    const parsed = shellQuote.parse(command);
    const tokens: string[] = [];

    for (const token of parsed) {
      if (typeof token === 'string') {
        // Preserve explicit empty-string argv entries from quoted interpolation:
        // `--flag "" --next value` must keep the empty slot.
        tokens.push(token);
        continue;
      }

      if (typeof token === 'number') {
        tokens.push(String(token));
        continue;
      }

      return null;
    }

    if (tokens.length === 0) {
      return null;
    }

    if (tokens[0].length === 0) {
      return null;
    }

    return {
      command: tokens[0],
      args: tokens.slice(1)
    };
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

  private static getInterpolatedVariableIdentifier(node: unknown): string | null {
    if (!node || typeof node !== 'object') {
      return null;
    }

    const typed = node as {
      type?: string;
      identifier?: string;
      variable?: { identifier?: string };
    };

    if ((typed.type === 'VariableReference' || typed.type === 'TemplateVariable') && typed.identifier) {
      return typed.identifier;
    }

    if (typed.type === 'VariableReferenceWithTail' && typed.variable?.identifier) {
      return typed.variable.identifier;
    }

    return null;
  }

  private static truncateForDisplay(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return `${text.slice(0, maxLength - 3)}...`;
  }

  private static findSuspiciousEscapedQuotedFragment(
    command: string,
    parsedTokens: ReturnType<typeof shellQuote.parse>
  ): string | null {
    if (!/\\["']/.test(command)) {
      return null;
    }

    let activeQuote: '"' | '\'' | null = null;
    let fragmentTokens: string[] = [];

    const flushFragment = (): string | null => {
      if (activeQuote && fragmentTokens.length > 1) {
        return fragmentTokens.join(' ');
      }
      activeQuote = null;
      fragmentTokens = [];
      return null;
    };

    for (const token of parsedTokens) {
      if (typeof token !== 'string' && typeof token !== 'number') {
        const suspicious = flushFragment();
        if (suspicious) {
          return suspicious;
        }
        continue;
      }

      const text = String(token);
      if (!activeQuote) {
        const firstChar = text[0];
        if ((firstChar === '"' || firstChar === '\'') && !text.endsWith(firstChar)) {
          activeQuote = firstChar;
          fragmentTokens = [text];
        }
        continue;
      }

      fragmentTokens.push(text);
      if (text.endsWith(activeQuote)) {
        const suspicious = flushFragment();
        if (suspicious) {
          return suspicious;
        }
      }
    }

    return flushFragment();
  }
}
