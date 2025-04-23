import { MeldError } from '@core/errors/MeldError';

/**
 * Base error class for URL operations
 */
export class URLError extends MeldError {
  constructor(message: string, cause?: Error) {
    super(message, { cause });
    this.name = 'URLError';
  }
}