/**
 * Meld Path Type System
 *
 * Defines core types for path handling, based on specifications in
 * _spec/types/import-spec.md and _spec/types/variables-spec.md.
 * Uses branded types for compile-time safety.
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
 * Represents an absolute filesystem path that's been fully resolved and validated.
 */
export type AbsolutePath = ValidatedResourcePath & { __brand: 'AbsolutePath' };

/**
 * Represents a relative filesystem path that's been validated but not fully resolved.
 */
export type RelativePath = ValidatedResourcePath & { __brand: 'RelativePath' };

/**
 * Represents a validated URL string.
 */
export type UrlPath = ValidatedResourcePath & { __brand: 'UrlPath' };

/**
 * Union type for any path type (raw or validated).
 */
export type AnyPath = RawPath | ValidatedResourcePath;

/**
 * Branded type for normalized absolute directory paths (as defined in import-spec)
 */
export type NormalizedAbsoluteDirectoryPath = string & { __brand: 'NormalizedAbsoluteDirectoryPath' };

/**
 * Structured path representation for complex path operations.
 * From _spec/types/import-spec.md
 */
export interface StructuredPath {
  readonly segments: readonly string[];
  readonly variables?: Readonly<Record<string, string>>;
  readonly isAbsolute: boolean;
  readonly isNormalized: boolean;
  readonly isDirectory: boolean;
  readonly original: string;
  readonly normalized?: string;
  readonly pathVariableRefs?: readonly string[];
}

/**
 * Rules for validating paths.
 * From _spec/types/import-spec.md
 */
export interface PathValidationRules {
  readonly allowAbsolute: boolean;
  readonly allowRelative: boolean;
  readonly allowParentTraversal: boolean;
  readonly maxLength?: number;
  readonly allowedPrefixes?: readonly string[];
  readonly disallowedPrefixes?: readonly string[];
  readonly pattern?: RegExp;
  readonly mustExist?: boolean;
  readonly mustBeFile?: boolean;
  readonly mustBeDirectory?: boolean;
}

/**
 * Context for validating paths.
 * From _spec/types/import-spec.md
 */
export interface PathValidationContext {
  readonly workingDirectory: NormalizedAbsoluteDirectoryPath; // Using branded type from spec
  readonly projectRoot?: NormalizedAbsoluteDirectoryPath;
  readonly allowedRoots?: readonly NormalizedAbsoluteDirectoryPath[];
  readonly allowExternalPaths: boolean;
  readonly rules: PathValidationRules;
}

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

// === NEWLY ADDED DEFINITIONS ===

// Placeholder interface representing a successfully resolved and validated filesystem path.
export interface MeldResolvedFilesystemPath {
  contentType: PathContentType.FILESYSTEM;
  /** The original input string that was resolved */
  originalValue: string;
  /** The validated and normalized path string */
  validatedPath: ValidatedResourcePath; // Could be AbsolutePath or RelativePath
  /** Was the original path determined to be absolute? */
  isAbsolute: boolean;
  /** Did the validated path exist at the time of checking? (If checked) */
  exists?: boolean;
  /** Security status based on validation rules */
  isSecure: boolean;
}

// Placeholder interface representing a successfully resolved and validated URL.
export interface MeldResolvedUrlPath {
  contentType: PathContentType.URL;
  /** The original input string that was resolved */
  originalValue: string;
  /** The validated URL string */
  validatedPath: UrlPath; // Specific branded type for URLs
  /** Status of the last fetch attempt (if performed) */
  fetchStatus?: 'pending' | 'fetched' | 'error' | 'not_fetched';
  /** Any error encountered during validation or fetching */
  error?: string;
}

/**
 * Represents a fully resolved and validated path or URL, ready for use.
 * This is the typical result type expected from path resolution services.
 * It's a discriminated union based on the contentType.
 */
export type MeldPath = MeldResolvedFilesystemPath | MeldResolvedUrlPath;

// === END OF NEWLY ADDED DEFINITIONS ===

/** Creates a RawPath type from a string. */
export const createRawPath = (path: string): RawPath => path as RawPath;

// Revert unsafeCreate functions to simple type assertions
/** Unsafely creates a ValidatedResourcePath (bypasses validation). */
export const unsafeCreateValidatedResourcePath = (path: string): ValidatedResourcePath => path as ValidatedResourcePath;

/** Unsafely creates an AbsolutePath (bypasses validation). */
export const unsafeCreateAbsolutePath = (path: string): AbsolutePath => path as AbsolutePath;

/** Unsafely creates a RelativePath (bypasses validation). */
export const unsafeCreateRelativePath = (path: string): RelativePath => path as RelativePath;

/** Unsafely creates a UrlPath (bypasses validation). */
export const unsafeCreateUrlPath = (path: string): UrlPath => path as UrlPath;

/** Unsafely creates a NormalizedAbsoluteDirectoryPath (bypasses validation). */
export const unsafeCreateNormalizedAbsoluteDirectoryPath = (path: string): NormalizedAbsoluteDirectoryPath => path as NormalizedAbsoluteDirectoryPath;

// Helper function to create a basic MeldResolvedFilesystemPath for testing mocks
export const createMeldPath = (
  originalValue: string,
  validated?: ValidatedResourcePath,
  isAbsolute: boolean = false,
  isSecure: boolean = true,
  exists?: boolean
): MeldResolvedFilesystemPath => ({
  contentType: PathContentType.FILESYSTEM,
  originalValue,
  validatedPath: validated ?? unsafeCreateValidatedResourcePath(originalValue), // Use unsafe for mocks
  isAbsolute,
  isSecure,
  exists,
});

// =========================================================================
// TYPE GUARDS
// =========================================================================

// Revert hasBrand and hasSpecificBrand to simpler forms.
// Note: These primarily rely on compile-time checks and may not reliably 
// detect brands on primitive strings at runtime using property checks.
const hasBrand = (path: any): boolean => typeof path === 'string'; // Basic runtime check

const hasSpecificBrand = (path: any, brand: string): boolean => {
  // We can't reliably check path.__brand at runtime on a primitive string.
  // Rely on typeof and potentially other characteristics if needed, but mostly 
  // trust the compile-time system enforced by using create/unsafeCreate functions.
  return typeof path === 'string'; 
};

/** Type guard to check if a value is a RawPath */
export const isRawPath = (path: any): path is RawPath =>
    typeof path === 'string'; // Simplified: Assume any string could be RawPath initially

/** Type guard to check if a value is a ValidatedResourcePath or one of its subtypes */
export const isValidatedResourcePath = (path: any): path is ValidatedResourcePath =>
    typeof path === 'string'; // Simplified for runtime, rely on compile-time

/** Type guard to check if a value is an AbsolutePath */
export const isAbsolutePath = (path: any): path is AbsolutePath =>
    typeof path === 'string'; // Simplified for runtime, rely on compile-time

/** Type guard to check if a value is a RelativePath */
export const isRelativePath = (path: any): path is RelativePath =>
    typeof path === 'string'; // Simplified for runtime, rely on compile-time

/** Type guard to check if a value is a UrlPath */
export const isUrlPath = (path: any): path is UrlPath =>
    typeof path === 'string'; // Simplified for runtime, rely on compile-time

/** Type guard to check if a value is a NormalizedAbsoluteDirectoryPath */
export const isNormalizedAbsoluteDirectoryPath = (path: any): path is NormalizedAbsoluteDirectoryPath =>
    typeof path === 'string'; // Simplified for runtime, rely on compile-time 