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
  = "foreach" _ execInvocation:UnifiedReferenceWithTail withClause:ForeachWithClause? {
      helpers.debug('ForeachCommandExpression matched', { execInvocation, withClause });
      
      // Extract arrays from exec invocation arguments
      let arrays = [];
      if (execInvocation.type === 'ExecInvocation' && execInvocation.commandRef.args) {
        arrays = execInvocation.commandRef.args;
      }
      
      return {
        type: "foreach-command",
        value: {
          type: 'foreach',
          execInvocation,
          arrays,
          ...(withClause ? { with: withClause } : {})
        },
        rawText: text()
      };
    }


// List of array arguments separated by commas
// Each array will be iterated over, creating cartesian product for multiple arrays
ForeachArrayArgumentList
  = first:VariableNoTail rest:(_ "," _ arr:VariableNoTail { return arr; })* {
      return [first].concat(rest || []);
    }


// -------------------------------------------------------------
// FOREACH SECTION EXTRACTION (NEW PATTERN)
// -------------------------------------------------------------

// REMOVED: ForeachSectionExpression
// This pattern has been superseded by file reference interpolation
// Migration: Use <*.md # section> as "template" instead of foreach <@files # section> as "template"

// REMOVED: ForeachPathParts - no longer needed without ForeachSectionExpression


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
  = "separator" _ ":" _ value:DataString {
      return { key: 'separator', value: value };
    }

// Template option for formatting foreach results  
// Usage: template: "format string"
ForeachTemplateOption
  = "template" _ ":" _ value:DataString {
      return { key: 'template', value: value };
    }