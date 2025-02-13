export interface ImportErrorDetails {
  importChain?: string[];
  filePath?: string;
  cause?: Error;
}

export class MeldImportError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: ImportErrorDetails
  ) {
    const importChainStr = details?.importChain 
      ? ` (chain: ${details.importChain.join(' → ')})`
      : '';
    super(`Import error (${code}): ${message}${importChainStr}`);
    
    this.name = 'MeldImportError';
    
    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, MeldImportError.prototype);
  }
} 