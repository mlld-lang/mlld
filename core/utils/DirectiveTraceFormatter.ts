import type { DirectiveTrace } from '@core/types/trace';

/**
 * Formats directive traces for display in error messages
 */
export class DirectiveTraceFormatter {
  private readonly LINE_WIDTH = 80;
  
  // ANSI color codes
  private readonly colors = {
    dim: '\x1b[90m',       // gray for dots/lines
    directive: '\x1b[36m',  // cyan for @directives  
    variable: '\x1b[33m',   // yellow for variable names
    file: '\x1b[90m',       // gray for files
    blue: '\x1b[34m',       // blue for header
    red: '\x1b[31m',        // red for errors
    reset: '\x1b[0m'
  };

  /**
   * Format a directive trace for display
   */
  format(trace: DirectiveTrace[], useColors = true, errorMessage?: string): string {
    if (trace.length === 0) return '';
    
    const c = useColors ? this.colors : {
      dim: '', directive: '', variable: '', file: '', blue: '', red: '', reset: ''
    };
    
    const lines: string[] = [];
    
    // Header with centered "mlld error" text
    const headerText = ' mlld error ';
    const headerPadding = Math.floor((this.LINE_WIDTH - headerText.length) / 2);
    const leftPad = '━'.repeat(headerPadding);
    const rightPad = '━'.repeat(this.LINE_WIDTH - headerPadding - headerText.length);
    
    lines.push(c.dim + leftPad + c.reset + c.blue + headerText + c.reset + c.dim + rightPad + c.reset);
    
    // If we have an error message and no failed entries, show it at the top
    if (errorMessage && !trace.some(t => t.failed)) {
      lines.push('');
      lines.push(c.red + '✘' + c.reset + '  ' + c.red + 'Error: ' + c.reset + errorMessage);
      lines.push('');
    }
    
    // Format each entry
    trace.forEach((entry, i) => {
      const indent = '    '.repeat(entry.depth);
      const prefix = i === 0 ? '' : '└── ';
      
      // Build colored parts
      const directive = c.directive + entry.directive + c.reset;
      const variable = entry.varName ? 
        ' ' + c.variable + entry.varName + c.reset : '';
      const location = c.file + entry.location + c.reset;
      
      // Calculate dots needed
      const leftPart = indent + prefix + directive + variable + ' ';
      const rightPart = ' ' + location;
      
      // Strip ANSI codes for length calculation
      const leftLength = this.stripAnsi(leftPart).length;
      const rightLength = this.stripAnsi(rightPart).length;
      
      const dotsNeeded = this.LINE_WIDTH - leftLength - rightLength;
      const dots = c.dim + '.'.repeat(Math.max(dotsNeeded, 3)) + c.reset;
      
      lines.push(leftPart + dots + rightPart);
      
      // If this entry failed, show the error
      if (entry.failed && entry.errorMessage) {
        const errorIndent = entry.depth === 0 ? '' : '    '.repeat(entry.depth);
        const errorPrefix = '└── ' + c.red + '✘' + c.reset + ' ';
        
        // Split the error message to show file info and error details separately
        const match = entry.errorMessage.match(/^(.+?\.mld failed to parse at line \d+): (.+)$/);
        if (match) {
          const [_, fileInfo, errorDetails] = match;
          lines.push(errorIndent + errorPrefix + c.red + fileInfo + ':' + c.reset);
          lines.push(errorIndent + '      ' + c.reset + errorDetails);
        } else {
          // Fallback for other error formats
          lines.push(errorIndent + errorPrefix + c.red + entry.errorMessage + c.reset);
        }
      }
    });
    
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