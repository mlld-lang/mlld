import { MeldError, type MeldErrorOptions } from './MeldError.js';

export interface MeldFileSystemErrorOptions extends MeldErrorOptions {
  command?: string;
  cwd?: string;
}

export class MeldFileSystemError extends MeldError {
  public readonly command?: string;
  public readonly cwd?: string;

  constructor(message: string, options: MeldFileSystemErrorOptions = {}) {
    super(message, options);
    this.name = 'MeldFileSystemError';
    this.command = options.command;
    this.cwd = options.cwd;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      command: this.command,
      cwd: this.cwd
    };
  }
} 