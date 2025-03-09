import { ErrorSeverity } from '../../errors';

/**
 * Standard error messages for path-related errors
 */
export const PathErrorMessages = {
  // Basic validation errors
  EMPTY_PATH: "Path cannot be empty",
  NULL_BYTE: "Path contains null bytes which is a security risk",
  INVALID_PATH: "Invalid path format",
  FILE_NOT_FOUND: "File not found: {path}",
  PATH_NOT_FOUND: "Path not found: {path}",
  
  // File type validation errors
  NOT_A_FILE: "Path is not a file: {path}",
  NOT_A_DIRECTORY: "Path is not a directory: {path}",
  
  // Meld-specific path rule errors
  CONTAINS_DOT_SEGMENTS: "Path cannot contain . or .. segments",
  INVALID_PATH_FORMAT: "Invalid path format - paths with slashes must use $. or $~",
  RAW_ABSOLUTE_PATH: "Raw absolute paths are not allowed - use $. or $~ instead",
  OUTSIDE_BASE_DIR: "Path is outside of the base directory",

  /**
   * Error for path validation issues
   */
  validation: {
    /**
     * Error message for raw absolute paths
     */
    rawAbsolutePath: {
      message: "Paths with segments must start with $. or $~ or $PROJECTPATH or $HOMEPATH - use $. or $PROJECTPATH for project-relative paths and $~ or $HOMEPATH for home-relative paths, or use a path variable ($variableName)",
      code: "PATH_VALIDATION_FAILED",
      severity: "recoverable" as ErrorSeverity
    },

    /**
     * Error message for paths with slashes but no path variable
     */
    slashesWithoutPathVariable: {
      message: "Paths with segments must start with $. or $~ or $PROJECTPATH or $HOMEPATH - use $. or $PROJECTPATH for project-relative paths and $~ or $HOMEPATH for home-relative paths, or use a path variable ($variableName)",
      code: "PATH_VALIDATION_FAILED",
      severity: "recoverable" as ErrorSeverity
    },

    /**
     * Error message for paths with dot segments
     */
    dotSegments: {
      message: "Paths with segments must start with $. or $~ or $PROJECTPATH or $HOMEPATH - use $. or $PROJECTPATH for project-relative paths and $~ or $HOMEPATH for home-relative paths, or use a path variable ($variableName)",
      code: "PATH_DOT_SEGMENTS",
      severity: "recoverable" as ErrorSeverity
    }
  },

  /**
   * Error messages for file access issues
   */
  fileAccess: {
    /**
     * Error message for file not found
     */
    fileNotFound: {
      message: "File not found: {filePath}",
      code: "FILE_NOT_FOUND",
      severity: "recoverable" as ErrorSeverity
    },

    /**
     * Error message for directory not found
     */
    directoryNotFound: {
      message: "Directory not found: {dirPath}",
      code: "DIRECTORY_NOT_FOUND",
      severity: "recoverable" as ErrorSeverity
    },

    /**
     * Error message for permission issues
     */
    permissionDenied: {
      message: "Permission denied when accessing file: {filePath}",
      code: "PERMISSION_DENIED",
      severity: "recoverable" as ErrorSeverity
    }
  },

  /**
   * Error messages for circular dependency issues
   */
  circular: {
    /**
     * Error message for circular imports
     */
    circularImport: {
      message: "Circular import detected in file: {filePath}",
      code: "CIRCULAR_IMPORT",
      severity: "recoverable" as ErrorSeverity
    }
  }
};
