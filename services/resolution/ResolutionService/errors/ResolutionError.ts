import { ResolutionContext, ResolutionErrorCode } from '@services/resolution/ResolutionService/IResolutionService';

/**
 * Error thrown when variable resolution fails
 */
export class ResolutionError extends Error {
  constructor(
    message: string,
    public readonly code: ResolutionErrorCode,
    public readonly details?: {
      value?: string;
      context?: ResolutionContext;
      cause?: Error;
      location?: {
        filePath?: string;
        line?: number;
        column?: number;
      };
    }
  ) {
    super(`Resolution error (${code}): ${message}`);
    this.name = 'ResolutionError';
  }
} 