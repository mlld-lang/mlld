import { MeldError } from './MeldError.js';
import { Location } from '@core/types/index.js';

export interface ResolutionErrorDetails {
  value?: string;
  context?: string;
  location?: Location;
}

/**
 * Error thrown when variable resolution fails
 */
export class MeldResolutionError extends MeldError {
  constructor(
    message: string,
    public readonly details?: ResolutionErrorDetails
  ) {
    super(message);
    this.name = 'MeldResolutionError';
  }

  /**
   * Get a formatted error message including details
   */
  formatMessage(): string {
    let msg = `Resolution error: ${this.message}`;
    if (this.details?.value) {
      msg += `\nValue: ${this.details.value}`;
    }
    if (this.details?.context) {
      msg += `\nContext: ${this.details.context}`;
    }
    return msg;
  }
} 