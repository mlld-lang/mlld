// VAR RHS CONTENT - Unified right-hand side for /var directive
// Used by: /var directive
// Purpose: Route to appropriate content parser based on syntax detection

VarRHSContent "var assignment value"
  = ForeachSectionExpression    // foreach [@array.field # section] as [[template]]
  / ForeachCommandExpression    // foreach @command(@arrays)
  / ExecInvocationPattern       // Exec invocations @func() - handle @ internally
  / CodeExecution               // Language + code patterns (run keyword and shortcuts)
  / TemplateStyleInterpolation  // Handles backtick, [[...]], double/single quotes
  / ObjectLiteral               // Object literal { key: value }
  / BracketAmbiguous            // NEW: Array vs path disambiguation
  / VariableReferenceWithTail   // Variable references @var with optional tail modifiers
  / NestedDirective             // Nested directives @run, etc.

// EXEC INVOCATION PATTERN - Matches @func() specifically
ExecInvocationPattern "exec invocation pattern"
  = "@" name:BaseIdentifier "(" args:CommandArgumentList? _ ")" tail:TailModifiers? {
      // Create command reference with arguments
      const ref = {
        name,
        identifier: [helpers.createNode(NodeType.Text, { content: name, location: location() })],
        args: args || [],
        isCommandReference: true
      };
      
      return {
        type: 'ExecInvocation',
        commandRef: ref,
        withClause: tail || null
      };
    }

// BRACKET AMBIGUOUS - The critical disambiguation logic
BracketAmbiguous "bracket content (array or path)"
  = "[" _ "]" {
      // Empty brackets - treat as empty array
      return helpers.createEmptyArray(location());
    }
  / "[" _ "," _ "]" {
      // Explicit empty array syntax
      return helpers.createEmptyArray(location());
    }
  / "[" _ content:BracketContentWithComma _ "]" {
      // Has comma = array
      return helpers.createArrayFromContent(content, location());
    }
  / "[" _ content:BracketContentWithSection _ "]" {
      // Has # = section extraction
      return helpers.createSectionExtraction(content, location());
    }
  / "[" _ content:BracketContentSimple _ "]" {
      // No comma, no # = file path
      return helpers.createPathDereference(content, location());
    }

// Helper patterns for bracket content detection
BracketContentWithComma
  = first:ArrayValue rest:(_ "," _ value:ArrayValue { return value; })+ {
      return [first, ...rest];
    }
  / item:ArrayValue _ "," {
      // Single item with trailing comma
      return [item];
    }

// Array value - any valid value for array items
ArrayValue
  = TemplateStyleInterpolation  // Templates
  / ObjectLiteral               // Objects  
  / ExecInvocationPattern       // Exec invocations @func() - handle @ internally
  / AtVar                       // Variable references (from variables.peggy) - moved before BracketAmbiguous
  / BracketAmbiguous            // Nested arrays or paths - moved after AtVar
  / NestedDirective             // Nested directives
  / CodeExecution               // Code execution (run keyword and shortcuts)
  / PrimitiveValue              // Strings, numbers, booleans, null

// Primitive values for arrays
PrimitiveValue
  = StringLiteral
  / NumberLiteral
  / BooleanLiteral
  / NullLiteral

// Object property values - specialized context for values inside objects
ObjectPropertyValue "object property value"
  = RunCommandValue
  / CodeExecutionValue
  / ObjectLiteral
  / BracketAmbiguous            // Use ambiguous bracket handling for array/path disambiguation
  / ExecInvocationPattern       // Exec invocations @func() - handle @ internally
  / ObjectVariableReference     // Variable references without context checks
  / TemplateStyleInterpolation
  / PrimitiveValue

// Variable references in object context (no context checks needed)
ObjectVariableReference
  = "@" id:BaseIdentifier !"(" fields:AnyFieldAccess* {
      // The !"(" ensures we don't match exec invocations like @func()
      return helpers.createVariableReferenceNode('varIdentifier', {
        identifier: helpers.normalizePathVar(id),
        ...(fields.length > 0 ? { fields: fields } : {})
      }, location());
    }

// Run command in object context
RunCommandValue
  = "run" _ "{" _ content:CodeBlockContent _ "}" {
      return {
        type: 'command',
        command: content,
        hasRunKeyword: true
      };
    }
  / "run" _ "@" invocation:ExecInvocationWithTail {
      // Handle run @command() syntax
      return {
        type: 'runExec',
        invocation: invocation,
        hasRunKeyword: true
      };
    }

// Code execution in object context  
CodeExecutionValue
  = lang:VarCodeLanguage _ "{" _ code:CodeBlockContent _ "}" {
      return {
        type: 'code',
        language: lang,
        code: code,
        hasRunKeyword: false
      };
    }


// Object literal { key: value }
ObjectLiteral
  = "{" _ props:ObjectProperties? _ "}" {
      const result = {};
      if (props) {
        for (const [key, value] of props) {
          result[key] = value;
        }
      }
      return result;
    }

// Object properties
ObjectProperties
  = first:ObjectProperty rest:(_ "," _ p:ObjectProperty { return p; })* {
      return [first, ...rest];
    }

// Object property key:value
ObjectProperty
  = key:PropertyKey _ ":" _ value:ObjectPropertyValue {
      return [key, value];
    }

// Property key
PropertyKey
  = BaseIdentifier
  / StringLiteral

// Nested directive like @run
NestedDirective
  = "@run" _ lang:VarCodeLanguage _ "{" _ code:CodeBlockContent _ "}" {
      // Inline code execution
      return {
        type: 'nestedDirective',
        directive: 'run',
        language: lang,
        code: code
      };
    }
  / "@run" _ "[" _ cmd:CommandContent _ "]" {
      // Command execution
      return {
        type: 'nestedDirective', 
        directive: 'run',
        command: cmd
      };
    }

// Command content inside brackets
CommandContent
  = chars:(!"]" .)* {
      return chars.map(c => c[1]).join('');
    }

BracketContentWithSection
  = path:PathParts _ "#" _ section:SectionName {
      return { path, section };
    }

BracketContentSimple
  = PathParts  // Reuse existing path parsing from content.peggy

// Code execution patterns (language + code without @run prefix)
CodeExecution "code execution"
  = "run" _ lang:VarCodeLanguage? _ "{" _ content:CodeBlockContent _ "}" {
      // Return structure based on whether language is specified
      if (lang) {
        // Language-specific code execution
        return {
          type: 'code',
          language: lang,
          code: content,
          hasRunKeyword: true
        };
      } else {
        // Shell command (no language specified)
        return {
          type: 'command',
          command: content,
          hasRunKeyword: true
        };
      }
    }
  / lang:VarCodeLanguage _ "{" _ code:CodeBlockContent _ "}" {
      // Shorthand: language + code without 'run' keyword
      return {
        type: 'code',
        language: lang,
        code: code,
        hasRunKeyword: false
      };
    }

// Language keywords for var code execution
VarCodeLanguage "code language"
  = "js" / "javascript" / "node" / "python" / "bash" / "sh"

// Code block content - preserve everything literally
CodeBlockContent "code block content"
  = chars:CodeChar* {
      return chars.join('');
    }

// Characters in code blocks (handle nested braces)
CodeChar
  = "{" inner:CodeBlockContent "}" {
      return '{' + inner + '}';
    }
  / !"}" char:. {
      return char;
    }