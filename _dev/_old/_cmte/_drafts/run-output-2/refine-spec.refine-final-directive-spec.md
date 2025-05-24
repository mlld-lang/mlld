```typescript
/**
 * Source code range information for error reporting and debugging
 */
export interface ISourceRange {
  // This is a placeholder for the actual ISourceRange interface
  // which would be defined elsewhere in the codebase
}

/**
 * Defines the possible command types that can be executed in a run directive
 */
export enum RunCommandType {
  BASIC = "basic",
  LANGUAGE = "language",
  DEFINED = "defined",
  SERVICE = "service",
  SHELL = "shell",
  NODE = "node",
  PYTHON = "python"
}

/**
 * Defines how the output of the run command should be processed
 */
export enum RunOutputMode {
  RAW = "raw",
  TEXT = "text",
  JSON = "json",
  LINES = "lines",
  MARKDOWN = "markdown",
  NONE = "none"
}

/**
 * Determines what output streams should be captured
 */
export enum RunCaptureMode {
  STDOUT = "stdout",
  STDERR = "stderr",
  BOTH = "both",
  NONE = "none"
}

/**
 * Determines how the command should be executed
 */
export enum RunExecutionMode {
  SYNC = "sync",
  ASYNC = "async",
  STREAM = "stream"
}

/**
 * Determines behavior when command fails
 */
export enum RunErrorHandling {
  IGNORE = "ignore",
  WARN = "warn",
  ERROR = "error",
  RETRY = "retry"
}

/**
 * Determines how command results should be cached
 */
export enum RunCacheMode {
  ALWAYS = "always",
  NEVER = "never",
  DEFAULT = "default",
  IF_SUCCESS = "if-success"
}

/**
 * Determines how command results should be merged with existing state
 */
export enum RunStateMergeStrategy {
  REPLACE = "replace",
  DEEP_MERGE = "deep-merge",
  APPEND = "append"
}

/**
 * Defines the persistence level for stored state
 */
export enum RunStatePersistenceLevel {
  GLOBAL = "global",
  SESSION = "session",
  TEMPORARY = "temporary"
}

/**
 * Result of the command execution
 */
export interface RunExecutionResult {
  /** Standard output from the command */
  stdout: string;
  
  /** Standard error from the command */
  stderr: string;
  
  /** Exit code from the command */
  exitCode: number;
  
  /** Processed output after applying transformations */
  processedOutput?: any;
  
  /** Time when command execution started */
  startTime?: number;
  
  /** Time when command execution completed */
  endTime?: number;
}

/**
 * Options for retrying failed commands
 */
export interface RunRetryOptions {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  
  /** Delay between retry attempts in milliseconds */
  delayMs: number;
  
  /** Whether to use exponential backoff for retries */
  useExponentialBackoff?: boolean;
}

/**
 * Options for caching command results
 */
export interface RunCacheOptions {
  /** How command results should be cached */
  mode: RunCacheMode;
  
  /** Time-to-live for cached results in milliseconds */
  ttlMs?: number;
  
  /** Force re-execution even when cached results exist */
  forceRefresh?: boolean;
}

/**
 * Options for state storage
 */
export interface RunStateOptions {
  /** How command results should be merged with existing state */
  mergeStrategy?: RunStateMergeStrategy;
  
  /** Persistence level for stored state */
  persistenceLevel?: RunStatePersistenceLevel;
  
  /** Time after which state should be automatically expired */
  expirationMs?: number;
  
  /** Whether state should be persisted between sessions */
  persistBetweenSessions?: boolean;
}

/**
 * Options for variable resolution
 */
export interface RunResolutionOptions {
  /** Whether variable references should be resolved */
  resolveVariables?: boolean;
  
  /** Whether paths should be expanded */
  expandPaths?: boolean;
  
  /** Context for variable resolution */
  resolutionContext?: string | string[];
  
  /** Maximum depth for recursive resolution */
  maxResolutionDepth?: number;
}

/**
 * Structure for language-specific arguments
 */
export interface RunLanguageArguments {
  /** Language-specific flags */
  flags?: string[];
  
  /** Language-specific options */
  options?: Record<string, any>;
  
  /** Script content for inline execution */
  script?: string;
  
  /** Path to script file */
  scriptPath?: string;
}

/**
 * Structure for service-specific command configuration
 */
export interface RunServiceConfig {
  /** Service name */
  name: string;
  
  /** Service method to call */
  method: string;
  
  /** Service-specific parameters */
  params?: Record<string, any>;
  
  /** Service version */
  version?: string;
}

/**
 * Represents the core structure for a run directive in Meld.
 * This defines the parameters for executing commands through the run directive.
 */
export interface MeldRunDirective {
  /**
   * Identifies this as a run directive
   * Required by InterpreterService and StateService for directive type discrimination
   */
  directiveType: "run";
  
  /**
   * The command to be executed in the run directive
   * Required by all services (ParserService, InterpreterService, DirectiveService, ResolutionService)
   * @validation Must be a non-empty string and parseable by the ParserService
   */
  command: string;
  
  /**
   * Arguments to be passed to the command
   * Can be string array or structured objects depending on commandType
   * @validation Must be appropriate for the specified commandType
   */
  args?: string[] | RunLanguageArguments | RunServiceConfig | Record<string, any>;
  
  /**
   * Input to be piped to the command's standard input
   */
  stdin?: string;
  
  /**
   * Working directory for the command execution
   * @validation If provided, must be a valid directory path or resolvable to one and must exist and be accessible
   */
  cwd?: string;
  
  /**
   * Environment variables for the command execution
   * @validation All values must be strings or resolvable to strings
   * @validation Environment variable expansion is supported (e.g., $HOME)
   */
  env?: Record<string, string>;
  
  /**
   * Whether to run the command in a shell
   * Can be boolean or string for specific shell path
   * @default false
   */
  shell?: boolean | string;
  
  /**
   * Maximum execution time in milliseconds
   * @validation Must be a positive number and less than a reasonable maximum (e.g., 3600000ms/1hr)
   */
  timeout?: number;
  
  /**
   * Source code location information for error reporting and debugging
   */
  location?: ISourceRange;
  
  /**
   * Identifier to store execution result in StateService
   * @validation Must be a valid string identifier (no spaces, special chars limited to underscore and dot)
   * @validation Must not conflict with reserved state keys or protected namespaces
   */
  stateId?: string;
  
  /**
   * Hierarchical path for storing complex command results in state tree
   * @validation Must be a valid state path according to StateService requirements
   */
  statePath?: string | string[];
  
  /**
   * Distinguishes between different types of commands that can be executed
   * @default RunCommandType.BASIC
   */
  commandType?: RunCommandType;
  
  /**
   * Determines how the output of the run command should be processed
   * @default RunOutputMode.TEXT
   */
  outputMode?: RunOutputMode;
  
  /**
   * Determines what output streams should be captured
   * @default RunCaptureMode.STDOUT
   */
  captureMode