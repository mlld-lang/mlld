import type { ErrorPattern } from '@core/errors/patterns/types';
import { MlldParseError } from '@core/errors/MlldParseError';

export const pattern: ErrorPattern = {
  name: 'import-wildcard',
  
  test(error, ctx) {
    // This pattern is already handled by the grammar itself
    // We check if the error message is the one from import.peggy line 355
    return error.message.includes('Wildcard imports must have an alias');
  },
  
  enhance(error, ctx) {
    // The grammar already provides a good error message, just pass it through
    // with the MlldParseError wrapper
    return new MlldParseError(
      error.message,
      error.location
    );
  }
};