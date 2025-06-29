import { Location } from 'peggy';
import { ErrorContext, PeggyError } from './types';

export function createErrorContext(error: PeggyError, source: string): ErrorContext {
  const lines = source.split('\n');
  
  // Guard against missing location
  if (!error.location || !error.location.start) {
    return {
      line: '',
      source,
      location: undefined as any // Will be handled by caller
    };
  }
  
  const lineIndex = error.location.start.line - 1;
  
  return {
    line: lines[lineIndex] || '',
    source,
    location: error.location
  };
}