import type { Location } from 'meld-spec';

/**
 * Base class for all Meld errors
 */
export class MeldError extends Error {
  constructor(
    message: string,
    public location?: Location['start']
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * Error thrown during parsing of Meld content
 */
export class MeldParseError extends MeldError {
  constructor(message: string, location?: Location['start']) {
    super(message, location);
  }
}

/**
 * Error thrown during interpretation of Meld content
 */
export class MeldInterpretError extends MeldError {
  constructor(
    message: string,
    public nodeType?: string,
    location?: Location['start']
  ) {
    super(message, location);
  }
}

/**
 * Error thrown during import operations
 */
export class MeldImportError extends MeldError {
  constructor(message: string, location?: Location['start']) {
    super(message, location);
  }
}

/**
 * Error thrown for directive-specific validation failures
 */
export class MeldDirectiveError extends MeldError {
  constructor(
    message: string,
    public directiveKind: string,
    location?: Location['start']
  ) {
    super(message, location);
  }
}

/**
 * Error thrown during embed operations
 */
export class MeldEmbedError extends MeldError {
  constructor(message: string, location?: Location['start']) {
    super(message, location);
  }
} 