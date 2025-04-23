import { 
  DirectiveError,
  DirectiveErrorCode
} from '@services/pipeline/DirectiveService/errors/DirectiveError';
import { ErrorSeverity } from '@core/errors/index';
import { 
  createExample, 
  createInvalidExample, 
  combineExamples,
  SyntaxExampleGroup 
} from '@core/syntax/helpers/index';

/**
 * Collection of atomic @import directive examples
 * 
 * These are the most basic examples that serve as building blocks for more complex examples
 */
export const atomic = {
  basicImport: createExample(
    'Basic import directive',
    `@import [imported.meld]`
  ),
  
  projectPathImport: createExample(
    'Import with project path variable',
    `@import [$PROJECTPATH/samples/nested.meld]`
  ),
  
  projectPathShortImport: createExample(
    'Import with project path shorthand',
    `@import [$./samples/nested.meld]`
  ),
  
  homePathImport: createExample(
    'Import with home path variable',
    `@import [$HOMEPATH/examples/basic.meld]`
  ),
  
  homePathShortImport: createExample(
    'Import with home path shorthand',
    `@import [$~/examples/basic.meld]`
  ),
  
  homePathNestedImport: createExample(
    'Import with home path and deeply nested path',
    `@import [$~/dev/meld/examples/example-import.meld]`
  )
};

/**
 * Collection of combined @import directive examples
 * 
 * These examples demonstrate more complex import scenarios
 */
export const combinations = {
  variablePath: combineExamples(
    'Import with path variable',
    createExample(
      'Path definition',
      `@path templates = "$PROJECTPATH/templates"`
    ),
    createExample(
      'Import using path variable',
      `@import [$templates/variables.meld]`
    )
  ),
  
  multiLevelImports: combineExamples(
    'Multi-level imports',
    createExample(
      'Level 1 import',
      `@text level1 = "Level 1 imported"
@import [level2.meld]`
    ),
    createExample(
      'Level 2 import (in level2.meld)',
      `@text level2 = "Level 2 imported"
@import [level3.meld]`
    ),
    createExample(
      'Level 3 import (in level3.meld)',
      `@text level3 = "Level 3 imported"`
    )
  ),
  
  nestedImports: combineExamples(
    'Nested imports',
    createExample(
      'Top level import',
      `@import [utils.meld]`
    ),
    createExample(
      'Second level import',
      `@import [helpers.meld]`
    )
  ),
  
  circularity: combineExamples(
    'Circular reference examples',
    createExample(
      'circular1.meld',
      `@import [$./circular2.meld]`
    ),
    createExample(
      'circular2.meld',
      `@import [$./circular1.meld]`
    )
  )
};

/**
 * Collection of invalid @import directive examples
 * 
 * These examples demonstrate invalid import scenarios
 */
export const invalid = {
  fileNotFound: createInvalidExample(
    'Non-existent file path',
    `@import [non-existent-file.meld]`,
    {
      type: DirectiveError,
      severity: ErrorSeverity.Recoverable,
      code: DirectiveErrorCode.FILE_NOT_FOUND,
      message: 'File not found: non-existent-file.meld'
    }
  ),
  
  circularImport: createInvalidExample(
    'Circular import reference',
    `@import [circular1.meld]`,
    {
      type: DirectiveError,
      severity: ErrorSeverity.Fatal,
      code: DirectiveErrorCode.CIRCULAR_REFERENCE,
      message: 'Circular import detected'
    }
  ),
  
  invalidSyntax: createInvalidExample(
    'Invalid import syntax',
    `@import without-brackets.meld`,
    {
      type: DirectiveError,
      severity: ErrorSeverity.Fatal,
      code: DirectiveErrorCode.VALIDATION_FAILED,
      message: 'Invalid import syntax'
    }
  )
};

/**
 * Complete collection of @import directive examples
 */
export const importDirectiveExamples: SyntaxExampleGroup = {
  atomic,
  combinations,
  invalid
}; 