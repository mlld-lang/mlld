// FOREACH PATTERNS
// This file defines patterns for foreach functionality that can be used across
// multiple directives (data, text, add). Foreach enables iteration over arrays
// with parameterized commands or templates.

/* Import required patterns */

// -------------------------------------------------------------
// FOREACH COMMAND EXPRESSIONS
// -------------------------------------------------------------

// Main foreach command expression for iterating over arrays with parameterized commands
// Usage: foreach @command(@array1, @array2) 
// Creates cartesian product when multiple arrays provided
ForeachCommandExpression
  = "foreach" _ cmd:ForeachCommandRef _ "(" _ arrays:ForeachArrayArgumentList _ ")" withClause:ForeachWithClause? {
      helpers.debug('ForeachCommandExpression matched', { cmd, arrays, withClause });
      
      return {
        type: "foreach-command",
        value: {
          type: 'foreach-command',
          command: cmd,
          arrays: arrays,
          ...(withClause ? { with: withClause } : {})
        },
        rawText: text()
      };
    }

// Command reference for foreach expressions
// References parameterized @exec commands or @text templates
ForeachCommandRef
  = "@" identifier:BaseIdentifier fields:AnyFieldAccess* {
      return {
        type: 'commandRef',
        identifier: identifier,
        fields: fields || []
      };
    }

// List of array arguments separated by commas
// Each array will be iterated over, creating cartesian product for multiple arrays
ForeachArrayArgumentList
  = first:ForeachVariableRef rest:(_ "," _ arr:ForeachVariableRef { return arr; })* {
      return [first].concat(rest || []);
    }

// Variable reference for array arguments
// Must reference variables that contain arrays
ForeachVariableRef
  = "@" identifier:BaseIdentifier fields:AnyFieldAccess* {
      const normalizedId = helpers.normalizePathVar(identifier);
      return helpers.createVariableReferenceNode('varIdentifier', {
        identifier: normalizedId,
        ...(fields.length > 0 ? { fields: fields } : {})
      }, location());
    }

// -------------------------------------------------------------
// FOREACH SECTION EXTRACTION (NEW PATTERN)
// -------------------------------------------------------------

// Foreach with section extraction: foreach [path expression] as [[template]]
// This pattern enables direct iteration over arrays with section extraction and template application
// Usage examples:
//   - foreach [@files.path # tldr] as [[### {{files.name}}]]
//   - foreach [../{{files.path}} # tldr] as [[### {{files.name}}]]
//   - foreach [@docs.url # @docs.section] as [[## {{docs.title}}]]
ForeachSectionExpression
  = "foreach" _ "[" _ pathParts:ForeachPathParts _ "#" _ section:SectionIdentifier _ "]" _ "as" _ template:TemplateCore {
      helpers.debug('ForeachSectionExpression matched', { pathParts, section, template });
      
      // Extract the array variable from the path
      // This is a simplified extraction - in practice, the interpreter
      // will need to evaluate the full path expression
      let arrayVariable = null;
      let pathField = null;
      
      // Try to extract @arrayVar.field pattern if it's a simple case
      if (pathParts && pathParts.length > 0) {
        const firstPart = pathParts[0];
        if (firstPart.type === 'VariableReference' && firstPart.fields && firstPart.fields.length > 0) {
          arrayVariable = firstPart.identifier;
          pathField = firstPart.fields[0].value;
        }
      }
      
      // Extract section raw content
      let sectionRaw;
      if (section.type === 'VariableReference') {
        sectionRaw = '@' + section.identifier;
      } else if (typeof section === 'string') {
        sectionRaw = section;
      } else {
        sectionRaw = section.content || section.identifier || '';
      }
      
      return {
        type: "foreach-section",
        value: {
          type: 'foreach-section',
          path: pathParts,
          section: Array.isArray(section) ? section : [section],
          sectionRaw: sectionRaw,
          template: template,
          // Include simplified extraction for backward compatibility
          ...(arrayVariable ? { arrayVariable } : {}),
          ...(pathField ? { pathField } : {})
        },
        rawText: text()
      };
    }

// Path parts for foreach - without context checking
ForeachPathParts "Path parts for foreach section"
  = parts:(SpecialVariable / ForeachPathVariable / InterpolationVar / PathTextSegment / PathSeparator)* {
      return parts;
    }

// Variable in foreach path context - no VariableContext check needed
ForeachPathVariable "Variable in foreach path"
  = "@" id:BaseIdentifier fields:AnyFieldAccess* {
      const normalizedId = helpers.normalizePathVar(id);
      return helpers.createVariableReferenceNode('varIdentifier', {
        identifier: normalizedId,
        ...(fields.length > 0 ? { fields: fields } : {})
      }, location());
    }

// -------------------------------------------------------------
// FOREACH WITH CLAUSE (OPTIONAL)
// -------------------------------------------------------------

// Optional with clause for foreach expressions
// Supports separator and template options for output formatting
ForeachWithClause
  = _ "with" _ "{" _ options:ForeachWithOptions _ "}" {
      return options;
    }

// With clause options for foreach
ForeachWithOptions
  = first:ForeachWithOption rest:(_ "," _ opt:ForeachWithOption { return opt; })* {
      const options = {};
      [first, ...rest].forEach(option => {
        options[option.key] = option.value;
      });
      return options;
    }

// Individual with clause option
ForeachWithOption
  = ForeachSeparatorOption
  / ForeachTemplateOption

// Separator option for joining foreach results
// Usage: separator: "delimiter"
ForeachSeparatorOption
  = "separator" _ ":" _ value:StringLiteral {
      return { key: 'separator', value: value };
    }

// Template option for formatting foreach results  
// Usage: template: "format string"
ForeachTemplateOption
  = "template" _ ":" _ value:StringLiteral {
      return { key: 'template', value: value };
    }