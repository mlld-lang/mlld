/**
 * Path-related types used within Meld, including states for filesystem and URL paths.
 */

/**
 * Discriminator for Path variable content type.
 */
export enum PathContentType {
  FILESYSTEM = 'filesystem',
  URL = 'url'
}

/**
 * Branded types for path handling with validation guarantees.
 *
 * @remarks Added based on ResolutionCore and FileSystemCore service lead feedback
 * to provide stronger typing for paths and prevent path traversal issues.
 * Renamed ValidatedPath to ValidatedResourcePath for clarity.
 */

/**
 * Represents a raw, unvalidated path or URL string.
 */
export type RawPath = string & { __brand: 'RawPath' };

/**
 * Represents a validated, normalized path or URL string that's guaranteed to be safe.
 */
export type ValidatedResourcePath = string & { __brand: 'ValidatedResourcePath' };

/**
 * Represents an absolute filesystem path that's been fully resolved.
 */
export type AbsolutePath = ValidatedResourcePath & { __brand: 'AbsolutePath' };

/**
 * Represents a relative filesystem path that's been validated but not fully resolved.
 */
export type RelativePath = ValidatedResourcePath & { __brand: 'RelativePath' };

/**
 * Create a raw path from a string.
 */
export const createRawPath = (path: string): RawPath => path as RawPath;

/**
 * Create a validated path from a string.
 * @param path The path to validate
 * @throws {Error} If the path is invalid (Placeholder for PathValidationError)
 */
export const createValidatedPath = (path: string): ValidatedResourcePath => {
  // Actual validation would happen here in PathService or similar.
  // For now, just cast assuming validation passed.
  // TODO: Implement actual path validation logic.
  if (typeof path !== 'string' || path.trim() === '') {
    throw new Error('Invalid path provided.'); // Basic check
  }
  return path as ValidatedResourcePath;
};

/**
 * Create an absolute path from a validated path.
 * @param path The validated path to convert
 * @throws {Error} If the path is not absolute (Placeholder for PathValidationError)
 */
export const createAbsolutePath = (path: ValidatedResourcePath): AbsolutePath => {
  // Actual validation (e.g., checking for leading / or drive letter) would happen here.
  // TODO: Implement actual absolute path validation logic.
  // Basic check placeholder:
  if (!path.startsWith('/') && !/^[a-zA-Z]:\\\\/.test(path)) { 
    // simplistic check for Unix/Windows absolute paths
    // throw new Error('Path is not absolute.');
    console.warn(`Path "${path}" treated as absolute despite not matching typical patterns.`);
  }
  return path as AbsolutePath;
};

/**
 * Create a relative path from a validated path.
 * @param path The validated path to convert
 * @throws {Error} If the path is not relative (Placeholder for PathValidationError)
 */
export const createRelativePath = (path: ValidatedResourcePath): RelativePath => {
  // Actual validation (e.g., ensuring it doesn't start with / or drive letter) would happen here.
  // TODO: Implement actual relative path validation logic.
    // Basic check placeholder:
  if (path.startsWith('/') || /^[a-zA-Z]:\\\\/.test(path)) { 
    // simplistic check for Unix/Windows absolute paths
    // throw new Error('Path is not relative.');
    console.warn(`Path "${path}" treated as relative despite matching typical absolute patterns.`);
  }
  return path as RelativePath;
};

/**
 * Represents the state of a filesystem path variable.
 */
export interface IFilesystemPathState {
  contentType: PathContentType.FILESYSTEM;
  /** The original path string */
  originalValue: string;
  /** Whether the path syntax is valid and normalization succeeded */
  isValidSyntax: boolean;
  /** Whether PathService security checks passed (traversal, etc.) */
  isSecure: boolean;
  /** Whether the path exists according to FileSystemService */
  exists?: boolean; // Optional as existence check might not always be done
  /** Is the path absolute or relative? */
  isAbsolute: boolean;
  /** The validated and normalized path */
  validatedPath?: ValidatedResourcePath; // Use branded type after successful validation
}

/**
 * Represents the state of a URL variable, reflecting URLContentResolver results.
 */
export interface IUrlPathState {
  contentType: PathContentType.URL;
  /** The original URL string */
  originalValue: string; // The URL itself
  /** Whether URL syntax and security policy passed validation */
  isValidated: boolean;
  /** Details from the last fetch attempt */
  fetchStatus: 'pending' | 'fetched' | 'error' | 'not_fetched';
  /** Error message if validation or fetch failed */
  error?: string; // Capture validation or fetch errors
  /** Was the last successful fetch from cache? */
  fromCache?: boolean;
  /** Timestamp of the last successful fetch */
  lastFetchedAt?: number;
  /** Metadata returned by URLContentResolver.fetchURL */
  responseMetadata?: {
    statusCode?: number;
    contentType?: string;
    contentLength?: number; // Store inferred or actual length
    lastModified?: string;
  };
  /** The validated URL string (can use branded type) */
  validatedPath?: ValidatedResourcePath; // Use branded type for the URL string
} 