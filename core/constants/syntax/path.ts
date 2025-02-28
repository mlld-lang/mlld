import { 
  MeldParseError, 
  ErrorSeverity 
} from '../../errors';
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
 */
export const atomic = {
  projectPath: createExample(
    'Project-relative path',
    `@path docs = "$PROJECTPATH/docs"`
  ),
  
  relativePath: createExample(
    'Relative path',
    `@path config = "$./config"`
  ),
  
  homePath: createExample(
    'Home directory path',
    `@path home = "$HOMEPATH/meld"`
  ),
  
  shorthandHome: createExample(
    'Shorthand home path',
    `@path data = "$~/data"`
  ),
  
  templates: createExample(
    'Templates path for imports',
    `@path templates = "$PROJECTPATH/templates"`
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