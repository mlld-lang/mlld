import { MeldError } from './MeldError.js';

export class MeldFileNotFoundError extends MeldError {
  constructor(filePath: string, cause?: Error) {
    super('File not found', {
      cause,
      context: {
        filePath,
        errorType: 'FILE_NOT_FOUND'
      }
    });
  }
} 