import { ErrorPattern } from '@core/errors/patterns/types';
import { MlldParseError } from '@core/errors/MlldParseError';

export const pattern: ErrorPattern = {
  name: 'TODO-name-this',
  
  test(error, ctx) {
    // TODO: Add detection logic
    // Examples:
    // - error.found === '?'
    // - ctx.line.includes('?')
    // - error.expected.some(e => e.text === 'something')
    return false;
  },
  
  enhance(error, ctx) {
    // TODO: Write helpful message
    return new MlldParseError(
      'TODO: Helpful error message here',
      error.location
    );
  }
};