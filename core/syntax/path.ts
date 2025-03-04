import { 
  MeldParseError, 
  ErrorSeverity 
} from '../errors';
import { 
  createExample, 
  createInvalidExample, 
  combineExamples,
  SyntaxExampleGroup 
} from './helpers';

/**
 * Collection of atomic @path directive examples
 * 
 * These are the most basic examples that serve as building blocks for more complex examples
 * NOTE: Valid paths must follow these rules:
 * 1. Simple paths (no slashes) are always valid
 * 2. Paths with slashes must be rooted in a special variable
 * 3. Special variables can be $PROJECTPATH/$. or $HOMEPATH/$~
 */
export const atomic = {
  // Simple path - no slashes (implicitly uses current directory)
  simplePath: createExample(
    'Simple path (no slashes)',
    `@path file = "file.meld"`
  ),
  
  // Project-relative paths
  projectPath: createExample(
    'Project-relative path (standard format)',
    `@path docs = "$PROJECTPATH/docs"`
  ),
  
  relativePath: createExample(
    'Project-relative path (shorthand format)',
    `@path config = "$./config"`
  ),
  
  // Home-relative paths
  homePath: createExample(
    'Home directory path (standard format)',
    `@path home = "$HOMEPATH/meld"`
  ),
  
  shorthandHome: createExample(
    'Home directory path (shorthand format)',
    `@path data = "$~/data"`
  ),
  
  // Additional examples
  templates: createExample(
    'Templates path for imports',
    `@path templates = "$PROJECTPATH/templates"`
  ),
  
  // Special path variables used alone
  projectPathRoot: createExample(
    'Project root path',
    `@path root = "$PROJECTPATH"`
  ),
  
  homePathRoot: createExample(
    'Home root path',
    `@path homedir = "$HOMEPATH"`
  ),
  
  projectPathDotRoot: createExample(
    'Project root path (shorthand)',
    `@path root = "$./"`
  ),
  
  homePathTildeRoot: createExample(
    'Home root path (shorthand)',
    `@path homedir = "$~"`
  )
};

/**
 * Collection of combined @path directive examples
 * 
 * These examples demonstrate more complex path scenarios
 */
export const combinations = {
  multiplePathTypes: combineExamples(
    'Multiple path types',
    atomic.projectPath,
    atomic.relativePath,
    atomic.homePath,
    atomic.shorthandHome
  ),
  
  pathWithVariables: combineExamples(
    'Path with variable substitution',
    createExample(
      'Project name variable',
      `@text project = "meld"`
    ),
    createExample(
      'Path with variable interpolation',
      `@path customPath = "$PROJECTPATH/{{project}}/docs"`
    )
  )
};

/**
 * Collection of invalid @path directive examples
 * 
 * These examples demonstrate invalid path syntax that should be rejected
 */
export const invalid = {
  absolutePath: createInvalidExample(
    'Absolute path without variable',
    `@path bad = "/absolute/path"`,
    {
      type: MeldParseError,
      severity: ErrorSeverity.Fatal,
      code: 'INVALID_PATH',
      message: 'Absolute paths must use path variables'
    }
  ),
  
  traversalPath: createInvalidExample(
    'Path with parent directory traversal',
    `@path bad = "../path/with/dot"`,
    {
      type: MeldParseError,
      severity: ErrorSeverity.Fatal,
      code: 'INVALID_PATH',
      message: 'Path traversal is not allowed'
    }
  ),
  
  invalidSyntax: createInvalidExample(
    'Invalid path syntax',
    `@path invalid = "missing $ prefix/path"`,
    {
      type: MeldParseError,
      severity: ErrorSeverity.Fatal,
      code: 'SYNTAX_ERROR', 
      message: 'Invalid path format'
    }
  ),
  
  pathWithSlashNoVar: createInvalidExample(
    'Path with slash but no path variable',
    `@path invalid = "foo/file.meld"`,
    {
      type: MeldParseError,
      severity: ErrorSeverity.Fatal,
      code: 'INVALID_PATH',
      message: 'Paths with segments must start with $. or $~ or $PROJECTPATH or $HOMEPATH'
    }
  )
};

/**
 * Complete collection of @path directive examples
 */
export const pathDirectiveExamples: SyntaxExampleGroup = {
  atomic,
  combinations,
  invalid
}; 