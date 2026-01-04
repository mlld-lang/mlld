/**
 * ANSI Color Processing
 *
 * Handles `%color%` syntax for terminal colors in mlld output.
 * Colors are processed at the effect handler level, not during interpolation.
 *
 * Supported codes:
 * - Colors: %red%, %green%, %blue%, %yellow%, %cyan%, %magenta%, %white%, %black%
 * - Bright colors: %bright_red%, %bright_green%, etc.
 * - Backgrounds: %bg_red%, %bg_green%, etc.
 * - Modifiers: %bold%, %dim%, %italic%, %underline%, %blink%, %inverse%, %hidden%, %strikethrough%
 * - Reset: %reset%
 *
 * Environment variables:
 * - MLLD_NO_COLOR=true: Strip all ANSI codes
 * - MLLD_FORCE_COLOR=true: Force ANSI codes even when not TTY
 * - NO_COLOR: Standard no-color env var
 */

const ANSI_CODES: Record<string, string> = {
  // Reset
  reset: '\x1b[0m',

  // Modifiers
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  blink: '\x1b[5m',
  inverse: '\x1b[7m',
  hidden: '\x1b[8m',
  strikethrough: '\x1b[9m',

  // Regular colors (foreground)
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',

  // Bright colors (foreground)
  bright_black: '\x1b[90m',
  bright_red: '\x1b[91m',
  bright_green: '\x1b[92m',
  bright_yellow: '\x1b[93m',
  bright_blue: '\x1b[94m',
  bright_magenta: '\x1b[95m',
  bright_cyan: '\x1b[96m',
  bright_white: '\x1b[97m',

  // Background colors
  bg_black: '\x1b[40m',
  bg_red: '\x1b[41m',
  bg_green: '\x1b[42m',
  bg_yellow: '\x1b[43m',
  bg_blue: '\x1b[44m',
  bg_magenta: '\x1b[45m',
  bg_cyan: '\x1b[46m',
  bg_white: '\x1b[47m',

  // Bright background colors
  bg_bright_black: '\x1b[100m',
  bg_bright_red: '\x1b[101m',
  bg_bright_green: '\x1b[102m',
  bg_bright_yellow: '\x1b[103m',
  bg_bright_blue: '\x1b[104m',
  bg_bright_magenta: '\x1b[105m',
  bg_bright_cyan: '\x1b[106m',
  bg_bright_white: '\x1b[107m',

  // Aliases for convenience
  gray: '\x1b[90m',
  grey: '\x1b[90m',
  bg_gray: '\x1b[100m',
  bg_grey: '\x1b[100m',

  // Aliases without underscores
  brightblack: '\x1b[90m',
  brightred: '\x1b[91m',
  brightgreen: '\x1b[92m',
  brightyellow: '\x1b[93m',
  brightblue: '\x1b[94m',
  brightmagenta: '\x1b[95m',
  brightcyan: '\x1b[96m',
  brightwhite: '\x1b[97m',
  bgblack: '\x1b[40m',
  bgred: '\x1b[41m',
  bggreen: '\x1b[42m',
  bgyellow: '\x1b[43m',
  bgblue: '\x1b[44m',
  bgmagenta: '\x1b[45m',
  bgcyan: '\x1b[46m',
  bgwhite: '\x1b[47m'
};

// Pattern to match %code% sequences
const CODE_PATTERN = /%([a-z_]+)%/gi;

// Pattern to match actual ANSI escape sequences
const ANSI_ESCAPE_PATTERN = /\x1b\[[0-9;]*m/g;

export interface AnsiProcessingOptions {
  enabled?: boolean;
  forceTTY?: boolean;
}

/**
 * Check if ANSI processing should be enabled for a target
 */
export function shouldProcessAnsi(
  target: 'stdout' | 'stderr' | 'file' | 'doc',
  options?: AnsiProcessingOptions
): boolean {
  // Check environment variables
  if (process.env.NO_COLOR || process.env.MLLD_NO_COLOR === 'true') {
    return false;
  }

  // Force option overrides
  if (options?.enabled === false) {
    return false;
  }
  if (options?.forceTTY || process.env.MLLD_FORCE_COLOR === 'true') {
    return true;
  }

  // File output never gets ANSI
  if (target === 'file') {
    return false;
  }

  // Doc buffer doesn't get ANSI by default (preserved for later processing)
  if (target === 'doc') {
    return false;
  }

  // Check TTY status
  if (target === 'stdout') {
    return process.stdout.isTTY === true;
  }
  if (target === 'stderr') {
    return process.stderr.isTTY === true;
  }

  return false;
}

/**
 * Expand %color% codes to ANSI escape sequences
 */
export function expandAnsiCodes(text: string): string {
  return text.replace(CODE_PATTERN, (match, code) => {
    const lowerCode = code.toLowerCase();
    return ANSI_CODES[lowerCode] ?? match;
  });
}

/**
 * Strip %color% codes from text (removes the markers without replacing)
 */
export function stripAnsiMarkers(text: string): string {
  return text.replace(CODE_PATTERN, '');
}

/**
 * Strip actual ANSI escape sequences from text
 */
export function stripAnsiEscapes(text: string): string {
  return text.replace(ANSI_ESCAPE_PATTERN, '');
}

/**
 * Check if text contains %color% markers
 */
export function hasAnsiMarkers(text: string): boolean {
  return CODE_PATTERN.test(text);
}

/**
 * Check if text contains actual ANSI escape sequences
 */
export function hasAnsiEscapes(text: string): boolean {
  return ANSI_ESCAPE_PATTERN.test(text);
}

/**
 * Process text for a specific output target
 *
 * - For TTY stdout/stderr: Expands %color% to ANSI codes
 * - For non-TTY or file: Strips %color% markers
 */
export function processAnsi(
  text: string,
  target: 'stdout' | 'stderr' | 'file' | 'doc',
  options?: AnsiProcessingOptions
): string {
  if (shouldProcessAnsi(target, options)) {
    return expandAnsiCodes(text);
  }
  return stripAnsiMarkers(text);
}

/**
 * Get both plain and formatted versions of text
 */
export function getFormattedText(text: string): { plain: string; ansi: string } {
  return {
    plain: stripAnsiMarkers(text),
    ansi: expandAnsiCodes(text)
  };
}

/**
 * List all available ANSI codes
 */
export function getAvailableCodes(): string[] {
  return Object.keys(ANSI_CODES);
}
