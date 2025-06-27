// VAR RHS CONTENT - Unified right-hand side for /var directive
// Used by: /var directive
// Purpose: Route to appropriate content parser based on syntax detection

VarRHSContent "var assignment value"
  = ForeachSectionExpression    // foreach [@array.field # section] as [[template]]
  / ForeachCommandExpression    // foreach @command(@arrays)
  / FieldAccessExecPattern      // NEW: Field access exec invocations @obj.method()
  / ExecInvocationPattern       // Exec invocations @func() - handle @ internally
  / CodeExecution               // Language + code patterns (run keyword and shortcuts)
  / TemplateStyleInterpolation  // Handles backtick, [[...]], double/single quotes
  / DataObjectLiteral           // Use data-context object parsing for proper typing
  / DataBracketAmbiguous        // Use data context version for proper string unwrapping
  / VariableReferenceWithTail   // Variable references @var with optional tail modifiers
  / NestedDirective             // Nested directives @run, etc.
  / PrimitiveValue              // Direct primitives: 42, true, false, null

// FIELD ACCESS EXEC PATTERN - Matches @obj.field() with nested field access
FieldAccessExecPattern "field access exec invocation"
  = "@" id:BaseIdentifier fields:AnyFieldAccess+ "(" args:CommandArgumentList? _ ")" tail:TailModifiers? {
      // Extract the last field as the method name
      const lastField = fields[fields.length - 1];
      const methodName = lastField.value;
      
      // Create variable reference for the object path (all fields except last)
      const objectFields = fields.slice(0, -1);
      const objectRef = helpers.createVariableReferenceNode('varIdentifier', {
        identifier: id,
        ...(objectFields.length > 0 ? { fields: objectFields } : {})
      }, location());
      
      // Create the exec invocation
      const ref = {
        name: methodName,
        identifier: [helpers.createNode(NodeType.Text, { content: methodName, location: location() })],
        args: args || [],
        isCommandReference: true,
        objectReference: objectRef
      };
      
      return {
        type: 'ExecInvocation',
        commandRef: ref,
        withClause: tail || null
      };
    }

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
  / DataObjectLiteral           // Use data-context object parsing for proper typing
  / ExecInvocationPattern       // Exec invocations @func() - handle @ internally
  / ArrayVariableReference      // Variable references without context check for arrays
  / BracketAmbiguous            // Nested arrays or paths - moved after AtVar
  / NestedDirective             // Nested directives
  / CodeExecution               // Code execution (run keyword and shortcuts)
  / PrimitiveValue              // Strings, numbers, booleans, null

// Variable references in array context (no context checks needed)
ArrayVariableReference
  = "@" id:BaseIdentifier !"(" fields:AnyFieldAccess* {
      // The !"(" ensures we don't match exec invocations like @func()
      return helpers.createVariableReferenceNode('varIdentifier', {
        identifier: helpers.normalizePathVar(id),
        ...(fields.length > 0 ? { fields: fields } : {})
      }, location());
    }

// Primitive values for arrays
PrimitiveValue
  = StringLiteral
  / NumberLiteral
  / BooleanLiteral
  / NullLiteral

// Object property values - use data context patterns for proper typing and unwrapping
ObjectPropertyValue "object property value"
  = DataPropertyValue           // Delegate to data-context patterns

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
  = "run" _ content:UnifiedCommandBrackets {
      // Use the same command parsing as regular /run directives
      return {
        type: 'command',
        command: content.values.command,  // Parsed command nodes
        commandBases: content.values.commandBases,
        hasRunKeyword: true,
        meta: content.meta
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
  = "/"? lang:VarCodeLanguage _ "{" _ code:CodeBlockContent _ "}" {
      return {
        type: 'code',
        language: lang,
        code: code,
        hasRunKeyword: false
      };
    }


// Property key - shared between old ObjectLiteral and DataObjectLiteral
PropertyKey
  = BaseIdentifier
  / StringLiteral

// Nested directive like @run
NestedDirective
  = "@"? "/"? "run" _ lang:VarCodeLanguage _ "{" _ code:CodeBlockContent _ "}" {
      // Inline code execution
      return {
        type: 'nestedDirective',
        directive: 'run',
        language: lang,
        code: code
      };
    }
  / "@"? "/"? "run" _ "[" _ cmd:CommandContent _ "]" {
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
  = "/"? "run" _ lang:VarCodeLanguage _ "{" _ content:CodeBlockContent _ "}" {
      // Language-specific code execution (js, python, etc.)
      return {
        type: 'code',
        language: lang,
        code: content,
        hasRunKeyword: true
      };
    }
  / "/"? "run" _ content:UnifiedCommandBrackets {
      // Shell command - use proper command parsing
      return {
        type: 'command',
        command: content.values.command,  // Parsed command nodes
        commandBases: content.values.commandBases,
        hasRunKeyword: true,
        meta: content.meta
      };
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