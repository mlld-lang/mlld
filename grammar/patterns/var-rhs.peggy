// VAR RHS CONTENT - Unified right-hand side for /var directive
// Used by: /var directive
// Purpose: Route to appropriate content parser based on syntax detection

VarRHSContent "var assignment value"
  = CodeExecution               // Language + code patterns (run keyword and shortcuts)
  / TemplateStyleInterpolation  // Handles backtick, [[...]], double/single quotes
  / ObjectLiteral               // Object literal { key: value }
  / BracketAmbiguous            // NEW: Array vs path disambiguation
  / VarRHSVariableRef           // Variable references @var (without context check)
  / NestedDirective             // Nested directives @run, etc.

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
  / BracketAmbiguous            // Nested arrays or paths
  / AtVar                       // Variable references (from variables.peggy)
  / NestedDirective             // Nested directives
  / CodeExecution               // Code execution (run keyword and shortcuts)
  / PrimitiveValue              // Strings, numbers, booleans, null

// Primitive values for arrays
PrimitiveValue
  = StringLiteral
  / NumberLiteral
  / BooleanLiteral
  / NullLiteral

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
  = key:PropertyKey _ ":" _ value:ArrayValue {
      return [key, value];
    }

// Property key
PropertyKey
  = BaseIdentifier
  / StringLiteral

// Variable reference @var for var RHS context (without context check)
VarRHSVariableRef "var RHS variable reference"
  = "@" id:BaseIdentifier fields:AnyFieldAccess* {
      const normalizedId = helpers.normalizePathVar(id);
      return helpers.createVariableReferenceNode('varIdentifier', {
        identifier: normalizedId,
        ...(fields.length > 0 ? { fields: fields } : {})
      }, location());
    }

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