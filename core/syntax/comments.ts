import { 
  createExample, 
  combineExamples,
  SyntaxExampleGroup,
  createInvalidExample
} from '@core/syntax/helpers.js';
import { ErrorSeverity } from '@core/errors/index.js';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';

/**
 * Collection of atomic comment examples
 * 
 * These are the most basic examples of Meld comments
 */
export const atomic = {
  singleLineComment: createExample(
    'Single line comment',
    `>> This is a commented out line`
  ),
  
  multilineComment: createExample(
    'Multiline comment',
    `>> This
>> is a multi-line comment`
  ),
  
  indentedComment: createExample(
    'Indented comment',
    `    >> This comment is indented`
  )
};

/**
 * Collection of combined comment examples
 * 
 * These examples demonstrate more complex comment scenarios
 */
export const combinations = {
  commentsWithContent: combineExamples(
    'Comments with surrounding content',
    createExample(
      'Before comment',
      `# Document Title

This is the introduction.`
    ),
    createExample(
      'Comment',
      `>> This comment will not appear in the output`
    ),
    createExample(
      'After comment',
      `## Next Section

More content here.`
    )
  ),
  
  mixedComments: combineExamples(
    'Mixed comment types',
    createExample(
      'First comment',
      `>> First comment line`
    ),
    createExample(
      'Some content',
      `This is normal content between comments.`
    ),
    createExample(
      'Multiline comment',
      `>> This is the first line of a multi-line comment
>> This is the second line of the same comment`
    ),
    createExample(
      'More content',
      `More normal content after comments.`
    )
  )
};

/**
 * Collection of invalid comment examples
 * 
 * These examples demonstrate invalid comment syntax
 */
export const invalid = {
  missingPrefix: createInvalidExample(
    'Missing comment prefix',
    `This line is missing the >> prefix`,
    {
      type: DirectiveErrorCode.VALIDATION_FAILED,
      severity: ErrorSeverity.Fatal,
      code: DirectiveErrorCode.VALIDATION_FAILED,
      message: 'Invalid comment syntax'
    }
  ),
  
  incorrectPrefix: createInvalidExample(
    'Incorrect comment prefix',
    `> Single chevron instead of double`,
    {
      type: DirectiveErrorCode.VALIDATION_FAILED,
      severity: ErrorSeverity.Fatal,
      code: DirectiveErrorCode.VALIDATION_FAILED,
      message: 'Invalid comment syntax'
    }
  )
};

/**
 * Complete collection of comment examples
 */
export const commentExamples: SyntaxExampleGroup = {
  atomic,
  combinations,
  invalid
}; 