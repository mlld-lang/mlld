import type { ErrorPattern } from '../../../../core/errors/patterns/types';
import { MlldParseError } from '../../../../core/errors/MlldParseError';

export const pattern: ErrorPattern = {
  name: 'run-missing-braces',
  
  test(error, ctx) {
    // Check if error is on a /run line without braces or quotes
    return (
      ctx.line.startsWith('/run ') &&
      !ctx.line.includes('{') &&
      !ctx.line.includes('"') &&
      !ctx.line.includes("'") &&
      error.expected.some(e => e.text === '{' || e.text === '"')
    );
  },
  
  enhance(error, ctx) {
    // Extract the command they tried to run
    const command = ctx.line.substring(5).trim(); // Remove '/run '
    
    return new MlldParseError(
      `Commands in /run must be wrapped in braces or quotes:\n` +
      `  ❌ /run ${command}\n` +
      `  ✅ /run {${command}}\n` +
      `  ✅ /run "${command}"`,
      error.location
    );
  }
};