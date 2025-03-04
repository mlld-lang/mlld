import { 
  MeldParseError
} from '@core/errors';
import { 
  DirectiveError,
  DirectiveErrorCode
} from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { ErrorSeverity } from '@core/errors';
import { 
  createExample, 
  createInvalidExample, 
  combineExamples,
  SyntaxExampleGroup 
} from '@core/syntax/helpers';

/**
 * Collection of atomic @embed directive examples
 * 
 * These are the most basic examples that serve as building blocks for more complex examples
 */
export const atomic = {
  simpleEmbed: createExample(
    'Simple file embed',
    `@embed [embed.md]`
  ),
  
  withSection: createExample(
    'Embed with section',
    `@embed [sections.md # Section Two]`
  ),
  
  withVariablePath: createExample(
    'Embed with variable path',
    `@path templates = "$PROJECTPATH/templates"
@embed [$templates/header.md]`
  ),
  
  withProjectPath: createExample(
    'Embed with project path',
    `@embed "$PROJECTPATH/README.md"`
  ),
  
  withProjectPathAndSection: createExample(
    'Embed with project path and section',
    `@embed "$PROJECTPATH/README.md#section"`
  ),
  
  withVariableContent: createExample(
    'Embed with variable content',
    `@text content = "# Content to embed"
@embed {{content}}`
  ),
  
  withDataVariableContent: createExample(
    'Embed with data variable field',
    `@data role = {
  "architect": "You are a senior architect skilled in TypeScript.",
  "security": "You are a security expert."
}
@embed {{role.architect}}`
  )
};

/**
 * Collection of combined @embed directive examples
 * 
 * These examples demonstrate more complex @embed scenarios
 */
export const combinations = {
  multipleEmbeds: combineExamples(
    'Multiple embeds in sequence',
    createExample(
      'Path setup',
      `@path templates = "$PROJECTPATH/templates"`
    ),
    createExample(
      'Header embed',
      `@embed [$templates/header.md]`
    ),
    createExample(
      'Content embed',
      `
This is some content between embeds.
      `
    ),
    createExample(
      'Footer embed',
      `@embed [$templates/footer.md]`
    )
  ),
  
  nestedSections: combineExamples(
    'Nested section embedding',
    createExample(
      'Main document embed',
      `@embed [document.md]`
    ),
    createExample(
      'Section embed',
      `@embed [document.md # First Section]`
    ),
    createExample(
      'Subsection embed',
      `@embed [document.md # First Section ## Subsection]`
    )
  )
};

/**
 * Collection of invalid @embed directive examples
 * 
 * These examples demonstrate invalid @embed syntax that should be rejected
 */
export const invalid = {
  fileNotFound: createInvalidExample(
    'Non-existent file',
    `@embed [non-existent-file.md]`,
    {
      type: DirectiveError,
      severity: ErrorSeverity.Recoverable,
      code: DirectiveErrorCode.FILE_NOT_FOUND,
      message: 'File not found'
    }
  ),
  
  sectionNotFound: createInvalidExample(
    'Non-existent section',
    `@embed [document.md # Non-Existent Section]`,
    {
      type: DirectiveError,
      severity: ErrorSeverity.Recoverable,
      code: DirectiveErrorCode.SECTION_NOT_FOUND,
      message: 'Section not found'
    }
  ),
  
  invalidSyntax: createInvalidExample(
    'Invalid embed syntax',
    `@embed without-brackets.md`,
    {
      type: MeldParseError,
      severity: ErrorSeverity.Fatal,
      code: 'SYNTAX_ERROR',
      message: 'Invalid embed syntax'
    }
  ),
  
  invalidOptionFormat: createInvalidExample(
    'Invalid option format',
    `@embed [ path: "file.md", section: "Section" ]`,
    {
      type: MeldParseError,
      severity: ErrorSeverity.Fatal,
      code: 'SYNTAX_ERROR',
      message: 'Invalid option format'
    }
  )
};

/**
 * Complete collection of @embed directive examples
 */
export const embedDirectiveExamples: SyntaxExampleGroup = {
  atomic,
  combinations,
  invalid
}; 