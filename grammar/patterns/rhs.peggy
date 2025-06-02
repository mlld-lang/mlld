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
  = "@run" _ RunDirectiveRef {
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
  = "@run" IsInRHS _ RunDirectiveRef {
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

// -------------------------------------------------------------
// EXEC RHS PATTERNS - Values for @exec assignments
// -------------------------------------------------------------

// EXEC RHS PATTERN - RHS content disambiguation for @exec directives
// Used by: AtExec directive (directives/exec.peggy)
// Purpose: Distinguishes between command content (with variable interpolation) and 
//          code content (language + code blob without interpolation) for exec assignments
ExecRHS "Exec directive right-hand side content"
  = "[" parts:ExecCommandParts "]" {
      // Semantic: bracket indicates command content with @var interpolation
      helpers.debug('ExecRHS matched bracketed command', { parts });
      
      const rawCommand = helpers.reconstructRawString(parts);
      
      return {
        type: 'command',
        command: parts,
        raw: rawCommand
      };
    }
  / language:RunCodeLanguage _ args:RunCodeArguments? _ code:DirectCodeContent {
      // Language + code pattern (e.g., "javascript [code]")
      // Produces execCode subtype with no variable interpolation (pure code blob)
      helpers.debug('ExecRHS matched language code pattern', { language, args, code });
      
      // Create language node
      const langNode = helpers.createNode(NodeType.Text, { content: language, location: location() });
      
      // Process code content - get from bracketed content
      const codeContent = code[0].content;
      
      return {
        type: 'code',
        lang: [langNode],
        args: args || [],
        code: code,
        rawLang: language,
        rawArgs: args ? args.map(arg => arg.identifier || '') : [],
        raw: codeContent
      };
    }

// -------------------------------------------------------------
// DIRECTIVE REFERENCE PLACEHOLDERS
// -------------------------------------------------------------

// These are simplified references to directives that might appear in RHS
// They will be replaced with actual implementations from core/

// Command parts for exec context - allows @var interpolation
ExecCommandParts
  = parts:(ExecCommandVariable / ExecCommandText)* {
      return parts;
    }

// Variable in exec command context
ExecCommandVariable
  = "@" id:BaseIdentifier fields:AnyFieldAccess* {
      const normalizedId = helpers.normalizePathVar(id);
      return helpers.createVariableReferenceNode('varIdentifier', {
        identifier: normalizedId,
        ...(fields.length > 0 ? { fields: fields } : {})
      }, location());
    }
  / SpecialVariable

// Text segments in exec commands
ExecCommandText
  = chars:$((!']' !'@' .)+) {
      return helpers.createNode(NodeType.Text, { content: chars, location: location() });
    }