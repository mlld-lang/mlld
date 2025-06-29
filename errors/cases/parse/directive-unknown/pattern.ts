import type { ErrorPattern } from '@core/errors/patterns/types';
import { MlldParseError } from '@core/errors/MlldParseError';

export const pattern: ErrorPattern = {
  name: 'directive-unknown',
  
  test(error, ctx) {
    // Check if the error is at the start of a line with '/'
    return (
      error.found === '/' && 
      ctx.line.startsWith('/') &&
      !ctx.line.match(/^\/(var|show|run|exe|import|output|when|path|foreach)/)
    );
  },
  
  enhance(error, ctx) {
    // Try to extract what directive was attempted
    const attempt = ctx.line.match(/^\/(\w+)/)?.[1] || 'unknown';
    
    return new MlldParseError(
      `Unknown directive '/${attempt}'. Available directives: /var, /show, /run, /exe, /import, /output, /when, /path, /foreach`,
      error.location
    );
  }
};