# Mlld Grammar Code Comments Standardization

This document defines standards for code comments throughout the Mlld grammar system to ensure consistency, improve readability, and facilitate maintenance.

## 1. Comment Purpose and Goals

Good grammar comments should:
- Explain the **purpose** of rules and patterns
- Clarify **relationships** between components
- Document **design decisions** and trade-offs
- Provide **context** for complex patterns
- Aid in **navigation** and understanding
- Support **maintenance** and evolution

## 2. Standardized Comment Structure

### File Header Comments

Every grammar file should begin with a standardized header:

```peggy
// COMPONENT NAME (ALL CAPS)
// One-line description of the component's purpose

/* 
# Detailed Documentation

Detailed multi-line explanation of:
- What this component does
- How it's used in the broader system
- Key abstractions it provides
- Design principles

NOTE: Important implementation details or warnings

@see Related documentation files
*/
```

Example:
```peggy
// PATH DIRECTIVE
// Implementation of the @path directive for defining path variables

/* 
# Path Directive

The path directive defines variables containing filesystem paths with
security restrictions. It handles both literal paths and template paths
with variable interpolation.

NOTE: All paths are subject to security validation before resolution

@see /grammar/docs/path.md for complete documentation
*/
```

### Section Divider Comments

Use standardized section dividers to organize code into logical groups:

```peggy
// -------------------------------------------------------------
// SECTION NAME (ALL CAPS)
// -------------------------------------------------------------
```

Example:
```peggy
// -------------------------------------------------------------
// CORE PATH PATTERNS
// -------------------------------------------------------------
```

### Rule Comments

Each grammar rule should have a standardized comment:

```peggy
// Purpose-focused description of what this rule handles and returns
RuleName "Human-readable label"
  = ...
```

Example:
```peggy
// Captures a path with variable interpolation, supporting both bracketed and quoted formats
PathWithInterpolation "Path with variable interpolation"
  = ...
```

### Action Block Comments

Inside JavaScript action blocks, use:

```peggy
{
  // Step 1: Extract key components
  const parts = ...
  
  // Step 2: Process and transform
  const processedValue = ...
  
  // Step 3: Create and return result
  return helpers.createNode(...);
}
```

### Debug Statement Format

For consistency, all debug statements should follow this format:

```peggy
helpers.debug('RuleName: Action or matching context', {
  // Organized debug data
  contextVar1,
  contextVar2,
  details: 'Additional information'
});
```

## 3. Comment Content Guidelines

### Rule Purpose Comments

Rule purpose comments should explain:
1. What the rule matches
2. What transforms or processing it performs
3. What it returns or produces
4. Any important edge cases or limitations

Good:
```peggy
// Matches a command string with variable interpolation, processes escape sequences,
// and returns an array of text and variable nodes
```

Bad:
```peggy
// Command rule
```

### Multiple Rule Variants

When a rule has multiple variants (alternatives), comment each significant variant:

```peggy
RuleName
  // First variant - handles quoted strings with escapes
  = '"' content:$(!'"' .)* '"' { 
      return helpers.createNode(NodeType.Text, { content }, location());
    }
  
  // Second variant - handles bracketed content with interpolation
  / '[' parts:(BracketVar / TextSegment)* ']' {
      return parts;
    }
```

### Comment Placement

Place comments:
- **Above** rules, variables, and functions
- **Inside** actions blocks for steps
- **After** important blocks for clarifications when necessary

```peggy
// Match an identifier followed by arguments
CommandReference
  = name:Identifier args:ArgumentList? {
      // Process arguments if present
      const processedArgs = args || [];
      
      return {
        name: name,
        args: processedArgs
      };
    } // End of command reference processing
```

## 4. Documentation Quotes

Each rule should include a descriptive quote (string literal) that appears in the grammar as a tooltip:

```peggy
RuleName "Human-readable description of what this matches"
  = ...
```

Guidelines for documentation quotes:
- Keep under 50 characters
- Begin with capital letter, no trailing period
- Focus on what it matches, not implementation details
- Be specific enough to distinguish from similar rules

Examples:
- `StringLiteral "String literal value"`
- `PathReference "Path with variable interpolation"`
- `CommandBlock "Command in brackets with variables"`

## 5. Examples of Well-Commented Rules

### Simple Rule with Basic Comment

```peggy
// Base identifier pattern for variables and directive names
BaseIdentifier "Identifier"
  = first:[a-zA-Z_] rest:[a-zA-Z0-9_]* {
      return first + rest.join('');
    }
```

### Complex Rule with Detailed Comments

```peggy
// Template content with variable interpolation using double brackets
// Supports both {{var}} directly in content and within [[...]] blocks
DoubleBracketContent "Content with {{var}} interpolation"
  = '[[' parts:(InterpolationVar / TemplateTextSegment)* ']]' {
      helpers.debug('DoubleBracketContent matched [[...]]', { 
        parts,
        isArray: Array.isArray(parts),
        length: Array.isArray(parts) ? parts.length : 'not array'
      });
      
      // Return only the content within double brackets, not the brackets themselves
      return parts;
    }
  
  // Support direct {{var}} without requiring [[ ]] wrapper
  / parts:InterpolationVar {
      helpers.debug('DoubleBracketContent matched {{var}}', { 
        parts,
        type: parts ? parts.type : 'unknown'
      });
      
      // Return single variable as array for consistency with multiple parts
      return [parts];
    }
```

### Directive Implementation with Comprehensive Comments

```peggy
// -------------------------------------------------------------
// TEXT DIRECTIVE IMPLEMENTATION
// -------------------------------------------------------------

// Text directive for creating text variables with content from various sources
// Supports literal strings, templates with interpolation, and nested directives
AtText "Text directive"
  // Direct assignment with quoted or bracketed content
  = DirectiveContext "@text" _ id:BaseIdentifier _ "=" _ template:TemplateCore {
      helpers.debug('AtText matched with template content', { id, template });
      
      // Determine if this is a template based on either variables or syntax
      const isTemplate = template.meta.hasVariables || template.meta.isTemplateContent;
      
      // Set subtype and sourceType based on template detection
      const subtype = isTemplate ? 'textTemplate' : 'textAssignment';
      const sourceType = isTemplate ? 'template' : 'literal';
      
      // Create meta object with template information
      const meta = { 
        sourceType,
        hasVariables: template.meta.hasVariables,
        isTemplateContent: template.meta.isTemplateContent
      };
      
      return helpers.createStructuredDirective(
        'text',
        subtype,
        {
          identifier: [helpers.createVariableReferenceNode('identifier', { identifier: id })],
          content: template.values.content
        },
        {
          identifier: id,
          content: template.raw.content
        },
        meta,
        location(),
        sourceType
      );
    }
    
  // Assignment with nested run directive
  / DirectiveContext "@text" _ id:BaseIdentifier _ "=" _ "@run" _ command:CommandCore {
      helpers.debug('AtText matched @run with CommandCore', { id, command });
      
      // Set standard values for this variant
      const subtype = 'textAssignment';
      const sourceType = 'directive';
      
      // Create meta object with run information
      const meta = { 
        sourceType,
        directive: 'run',
        hasVariables: command.meta.hasVariables || false,
        run: {
          isCommand: true
        }
      };
      
      return helpers.createStructuredDirective(
        'text',
        subtype,
        {
          identifier: [helpers.createVariableReferenceNode('identifier', { identifier: id })],
          content: command.values.command
        },
        {
          identifier: id,
          content: `@run ${command.raw.command}`
        },
        meta,
        location(),
        'run'
      );
    }
```

## 6. Implementation Plan

### Phase 1: Create Comment Conventions
1. Establish comment format standards
2. Document the standards in this file
3. Create examples for each grammar component type

### Phase 2: Update Core Components
1. Update base components first (tokens, whitespace, etc.)
2. Apply standards to pattern components next
3. Update core components (template, command, path)

### Phase 3: Update Directive Components
1. Update each directive component
2. Ensure consistency across similar directives
3. Verify cross-references and links

### Phase 4: Review and Refine
1. Conduct peer review of updated comments
2. Check for consistency and compliance with standards
3. Refine standards based on implementation experience

### Phase 5: Documentation and Reference
1. Update documentation to reference standard comments
2. Create examples of good commenting practice
3. Add comment standards to contributor guidelines

## 7. Comment Review Checklist

When reviewing code comments, verify:

- [ ] File has standardized header comment
- [ ] All rule definitions have purpose comments
- [ ] Documentation quotes are present and descriptive
- [ ] Section dividers organize the code logically
- [ ] Complex logic has step-by-step comments
- [ ] Debug statements follow standard format
- [ ] Important design decisions are documented
- [ ] Cross-references to documentation exist

## 8. References

The following files exemplify good commenting practice and should be used as references:

1. `/grammar/base/tokens.peggy` - Good basic rule comments
2. `/grammar/patterns/content.peggy` - Good pattern organization 
3. `/grammar/directives/run.peggy` - Good directive implementation comments