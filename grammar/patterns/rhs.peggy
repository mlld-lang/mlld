// RHS (Right-Hand Side) PATTERNS
// This file defines patterns for right-hand side expressions in directive assignments

/* 
# RHS Pattern System

Handles right-hand side expressions in directive assignments like:
- @text name = "value"
- @text name = @run command
- @data obj = { "key": "value" }

Each RHS context needs specialized handling to properly disambiguate
nested directives from variable references within the assignment value.
*/


// -------------------------------------------------------------
// RHS DETECTION - Identify and mark RHS context
// -------------------------------------------------------------

// Predicate to check if we're in a RHS context (used by nested directives)
IsInRHS "In right-hand side of assignment"
  = &{
      const pos = offset();
      return helpers.isRHSContext(input, pos);
    }

// -------------------------------------------------------------
// TEXT RHS PATTERNS - Values for @text assignments
// -------------------------------------------------------------

// RHS value for @text directive
TextRHS
  = foreach:ForeachCommandExpression {
      // Handle foreach expression
      helpers.debug('TextRHS matched foreach', { foreach });
      return { 
        type: 'foreach',
        value: foreach.value
      };
    }
  / "@run" _ RunDirectiveRef {
      // Handle nested @run directive
      helpers.debug('TextRHS matched @run reference');
      return { type: 'directive', directive: 'run' };
    }
  / "@add" _ AddDirectiveRef {
      // Handle nested @add directive
      helpers.debug('TextRHS matched @add reference');
      return { type: 'directive', directive: 'add' };
    }
  / section:SectionExtractionCore {
      // Handle section extraction (e.g., "## Setup" from [file.md])
      helpers.debug('TextRHS matched section extraction', { section });
      return { 
        type: 'section',
        section: section.section,
        path: section.path,
        rename: section.rename,
        meta: section.meta
      };
    }
  / path:PathExpression {
      // Handle direct path content (e.g., [file.md] or https://example.com/file.md)
      helpers.debug('TextRHS matched path content', { path });
      return { 
        type: 'path',
        path: path
      };
    }
  / content:WrappedTemplateContent {
      // Handle template content
      helpers.debug('TextRHS matched template content');
      return { 
        type: 'template', 
        content: content.parts,
        raw: content.raw
      };
    }

// -------------------------------------------------------------
// DATA RHS PATTERNS - Values for @data assignments
// -------------------------------------------------------------

// RHS value for @data directive
DataRHS
  = foreach:ForeachCommandExpression {
      // Handle foreach expression
      helpers.debug('DataRHS matched foreach', { foreach });
      return { 
        type: 'foreach',
        value: foreach.value
      };
    }
  / "@run" IsInRHS _ RunDirectiveRef {
      // Handle nested @run directive
      return { type: 'directive', directive: 'run' };
    }
  / "{" _ properties:DataProperties? _ "}" {
      // Handle object literal
      return { 
        type: 'object',
        properties: properties || []
      };
    }
  / "[" _ items:DataItems? _ "]" {
      // Handle array literal
      return { 
        type: 'array',
        items: items || []
      };
    }
  / value:DataLiteral {
      // Handle primitive values
      return { 
        type: 'literal',
        value
      };
    }

// Object properties for data objects
DataProperties
  = first:DataProperty rest:(_ "," _ prop:DataProperty { return prop; })* {
      return [first, ...rest];
    }

// Single property in a data object
DataProperty
  = key:StringLiteral _ ":" _ value:DataValue {
      return { key, value };
    }
  / key:BaseIdentifier _ ":" _ value:DataValue {
      return { key, value };
    }

// Array items for data arrays
DataItems
  = first:DataValue rest:(_ "," _ item:DataValue { return item; })* {
      return [first, ...rest];
    }


// Primitive literal values for data
DataLiteral
  = value:StringLiteral { return value; }
  / value:NumberLiteral { return value; }
  / value:BooleanLiteral { return value; }
  / value:NullLiteral { return value; }

// -------------------------------------------------------------
// RUN RHS PATTERNS - Values for @run assignments
// -------------------------------------------------------------

// RHS value for @run directive
RunRHS
  = command:WrappedCommandContent {
      return {
        type: 'command',
        command: command.parts,
        raw: command.raw
      };
    }
  / code:WrappedCodeContent {
      return {
        type: 'code',
        code: code.parts,
        raw: code.raw
      };
    }

