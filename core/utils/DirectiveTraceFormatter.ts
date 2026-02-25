import type { DirectiveTrace } from '@core/types/trace';

/**
 * Formats directive traces and error content inside a framed box for display
 */
export class DirectiveTraceFormatter {
  private readonly LINE_WIDTH = 80;

  // ANSI color codes
  private readonly colors = {
    dim: '\x1b[90m',       // gray for dots/lines
    directive: '\x1b[36m',  // cyan for directives
    variable: '\x1b[33m',   // yellow for variable names
    file: '\x1b[90m',       // gray for files
    blue: '\x1b[34m',       // blue for header
    red: '\x1b[31m',        // red for errors
    reset: '\x1b[0m'
  };

  /**
   * Format a directive trace and optional rich content inside a framed box.
   * When richContent is provided, inline error messages on failed trace entries
   * are suppressed (the rich content has full details).
   */
  format(trace: DirectiveTrace[], useColors = true, errorMessage?: string, richContent?: string): string {
    if (trace.length === 0 && !errorMessage && !richContent) return '';

    const c = useColors ? this.colors : {
      dim: '', directive: '', variable: '', file: '', blue: '', red: '', reset: ''
    };

    const lines: string[] = [];

    // Header
    const headerText = ' mlld error ';
    const headerPadding = Math.floor((this.LINE_WIDTH - headerText.length) / 2);
    const leftPad = '━'.repeat(headerPadding);
    const rightPad = '━'.repeat(this.LINE_WIDTH - headerPadding - headerText.length);

    lines.push(c.dim + leftPad + c.reset + c.blue + headerText + c.reset + c.dim + rightPad + c.reset);

    // Legacy: standalone error message at top (only when no richContent)
    if (!richContent && errorMessage && !trace.some(t => t.failed)) {
      lines.push('');
      lines.push(c.red + '✘' + c.reset + '  ' + c.red + 'Error: ' + c.reset + errorMessage);
      lines.push('');
    }

    // Trace chain entries
    if (trace.length > 0) {
      trace.forEach((entry, i) => {
        const indent = '    '.repeat(entry.depth);
        const prefix = i === 0 ? '' : '└── ';

        // Strip leading / from directive names (/ is only for markdown disambiguation)
        const directiveName = entry.directive.startsWith('/') ? entry.directive.slice(1) : entry.directive;
        const directive = c.directive + directiveName + c.reset;
        const variable = entry.varName ?
          ' ' + c.variable + entry.varName + c.reset : '';
        const location = c.file + entry.location + c.reset;

        const leftPart = indent + prefix + directive + variable + ' ';
        const rightPart = ' ' + location;

        const leftLength = this.stripAnsi(leftPart).length;
        const rightLength = this.stripAnsi(rightPart).length;

        const dotsNeeded = this.LINE_WIDTH - leftLength - rightLength;
        const dots = c.dim + '.'.repeat(Math.max(dotsNeeded, 3)) + c.reset;

        // Mark failed entries with ✘ but only show inline error when no richContent
        if (entry.failed) {
          lines.push(leftPart + dots + rightPart + ' ' + c.red + '✘' + c.reset);

          if (!richContent && entry.errorMessage) {
            const errorIndent = entry.depth === 0 ? '' : '    '.repeat(entry.depth);
            const errorPrefix = '└── ' + c.red + '✘' + c.reset + ' ';

            const match = entry.errorMessage.match(/^(.+?\.mld failed to parse at line \d+): (.+)$/);
            if (match) {
              const [_, fileInfo, errorDetails] = match;
              lines.push(errorIndent + errorPrefix + c.red + fileInfo + ':' + c.reset);
              lines.push(errorIndent + '      ' + c.reset + errorDetails);
            } else {
              lines.push(errorIndent + errorPrefix + c.red + entry.errorMessage + c.reset);
            }
          }
        } else {
          lines.push(leftPart + dots + rightPart);
        }
      });
    }

    // Rich content section (indented inside the box)
    if (richContent) {
      if (trace.length > 0) {
        lines.push('');
      }
      for (const line of richContent.split('\n')) {
        lines.push('  ' + line);
      }
    }

    // Footer
    lines.push(c.dim + '━'.repeat(this.LINE_WIDTH) + c.reset);

    return lines.join('\n');
  }

  /**
   * Strip ANSI escape codes from a string
   */
  private stripAnsi(str: string): string {
    return str.replace(/\x1b\[[0-9;]*m/g, '');
  }
}
