import { ErrorPattern } from '@core/errors/patterns/types';
import { MlldParseError } from '@core/errors/MlldParseError';

export const pattern: ErrorPattern = {
  name: 'TODO-name-this',
  
  test(error, mx) {
    // TODO: Add detection logic
    // Examples:
    // - error.found === '?'
    // - mx.line.includes('?')
    // - error.expected.some(e => e.text === 'something')
    return false;
  },
  
  enhance(error, mx) {
    // TODO: Write helpful message
    return new MlldParseError(
      'TODO: Helpful error message here',
      error.location
    );
  }
};