import { 
  createExample, 
  combineExamples,
  SyntaxExampleGroup 
} from './helpers';

/**
 * Collection of atomic comment examples
 * 
 * These are the most basic examples of Meld comments
 */
export const atomic = {
  inlineComment: createExample(
    'Inline comment',
    `<!-- This is an inline comment -->`
  ),
  
  multilineComment: createExample(
    'Multiline comment',
    `<!--
This is a multiline comment
spanning multiple lines
-->`
  ),
  
  indentedComment: createExample(
    'Indented comment',
    `    <!-- This comment is indented -->`
  ),
  
  meldSpecificComment: createExample(
    'Meld-specific comment',
    `<!-- @meld-hidden -->`
  ),
  
  conditionalComment: createExample(
    'Conditional comment',
    `<!-- @meld-if {{condition}} -->`
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
      `<!-- This comment will not appear in the output -->`
    ),
    createExample(
      'After comment',
      `## Next Section

More content here.`
    )
  ),
  
  conditionalBlocks: combineExamples(
    'Conditional content blocks',
    createExample(
      'Variable definition',
      `@text showAdvanced = true`
    ),
    createExample(
      'Conditional start',
      `<!-- @meld-if {{showAdvanced}} -->`
    ),
    createExample(
      'Conditional content',
      `## Advanced Section

This content only appears when showAdvanced is true.`
    ),
    createExample(
      'Conditional end',
      `<!-- @meld-endif -->`
    )
  ),
  
  nestedConditionals: combineExamples(
    'Nested conditional blocks',
    createExample(
      'Variable definitions',
      `@text isLoggedIn = true
@text isPremium = true`
    ),
    createExample(
      'Outer conditional start',
      `<!-- @meld-if {{isLoggedIn}} -->`
    ),
    createExample(
      'Content for logged in users',
      `## Welcome back!

You are logged in.`
    ),
    createExample(
      'Inner conditional start',
      `<!-- @meld-if {{isPremium}} -->`
    ),
    createExample(
      'Premium content',
      `### Premium Content

This content is only for premium users.`
    ),
    createExample(
      'Inner conditional end',
      `<!-- @meld-endif -->`
    ),
    createExample(
      'More logged in content',
      `## Other Features

These features are available to all logged in users.`
    ),
    createExample(
      'Outer conditional end',
      `<!-- @meld-endif -->`
    )
  )
};

/**
 * Collection of Meld-specific comment directives
 * 
 * These examples demonstrate special Meld comment directives
 */
export const meldDirectives = {
  hidden: createExample(
    'Hidden content',
    `<!-- @meld-hidden -->
This content will not be included in the output.`
  ),
  
  include: createExample(
    'Conditional include',
    `<!-- @meld-include {{includeDebug}} -->`
  ),
  
  exclude: createExample(
    'Conditional exclude',
    `<!-- @meld-exclude {{isProduction}} -->`
  ),
  
  rawBlock: createExample(
    'Raw content block',
    `<!-- @meld-raw -->
This content will not be processed for Meld directives.
@text variable = "This will be shown as literal text"
<!-- @meld-endraw -->`
  ),
  
  metadata: createExample(
    'Metadata comment',
    `<!-- @meld-meta title="Document Title" author="Example Author" -->`
  )
};

/**
 * Complete collection of comment examples
 */
export const commentExamples: SyntaxExampleGroup = {
  atomic,
  combinations,
  meldDirectives
}; 