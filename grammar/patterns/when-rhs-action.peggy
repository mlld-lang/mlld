// When RHS Action Pattern
// =======================
// Unified pattern for actions in RHS when expressions
// Supports both side effects (show, output, var assignment) and value returns
// Used in both /when and /exe...when RHS contexts

// Main pattern - try side-effect actions first, fall back to pure values
WhenRHSAction "when RHS action"
  = WhenRHSShowAction
  / WhenRHSOutputAction  
  / WhenRHSVarAssignment
  / WhenRHSFunctionCall
  / VarRHSContent  // Pure values (fallback)

// Show action - displays content AND returns it
WhenRHSShowAction
  = "show" _ content:WhenRHSShowContent {
      helpers.debug('WhenRHSShowAction matched', { content });
      
      return {
        type: 'WhenRHSAction',
        subtype: 'show',
        content: content,
        sideEffect: true,
        returnsValue: true,
        location: location()
      };
    }

// Output action - writes to file/stream AND returns content
WhenRHSOutputAction
  = "output" _ source:WhenRHSOutputSource _ "to" _ target:WhenRHSOutputTarget format:(_ "as" _ f:OutputFormat { return f; })? {
      helpers.debug('WhenRHSOutputAction matched', { source, target, format });
      
      return {
        type: 'WhenRHSAction',
        subtype: 'output',
        source: source,
        target: target,
        format: format || null,
        sideEffect: true,
        returnsValue: true,
        location: location()
      };
    }

// Variable assignment - sets variable AND returns value
WhenRHSVarAssignment  
  = "@" name:BaseIdentifier _ "=" _ value:VarRHSContent {
      helpers.debug('WhenRHSVarAssignment matched', { name, value });
      
      return {
        type: 'WhenRHSAction',
        subtype: 'varAssignment',
        identifier: name,
        value: value,
        sideEffect: true,
        returnsValue: true,
        location: location()
      };
    }

// Function call - executes function AND returns result
WhenRHSFunctionCall
  = ref:UnifiedReference &{ 
      // Check if this is actually an executable reference
      return ref.type === 'ExecInvocation' || 
             ref.type === 'FieldAccessExec' ||
             (ref.arguments && ref.arguments.length >= 0);
    } {
      helpers.debug('WhenRHSFunctionCall matched', { ref });
      
      return {
        type: 'WhenRHSAction',
        subtype: 'functionCall',
        reference: ref,
        sideEffect: true,
        returnsValue: true,
        location: location()
      };
    }

// Show content for RHS context - use same patterns as VarRHSContent
WhenRHSShowContent
  = UnifiedQuoteOrTemplate  // Use unified pattern instead of TemplateStyleInterpolation
  / UnifiedReference             // Variable or exec reference
  / PrimitiveValue              // Includes string literals and other primitives

// Output source for RHS context - use same patterns as VarRHSContent  
WhenRHSOutputSource
  = UnifiedQuoteOrTemplate  // Use unified pattern instead of TemplateStyleInterpolation
  / UnifiedReference             // Variable or exec reference
  / PrimitiveValue              // Includes string literals and other primitives

// Output target for RHS context
WhenRHSOutputTarget
  = OutputTarget  // Reuse existing output target patterns

// Error recovery - catch exe definitions and provide helpful error
WhenRHSExeDefinitionError
  = "@" name:BaseIdentifier "(" args:CommandArgumentList? ")" _ "=" _ value:VarRHSContent {
      helpers.mlldError(
        `Executable definitions are not allowed in when RHS contexts.\n\n` +
        `Instead of:\n` +
        `  /when @condition => @${name}() = ...\n` +
        `  /var @result = when: [@condition => @${name}() = ...]\n\n` +
        `Use:\n` +
        `  /exe @${name}() = when: [@condition => ..., * => default]`,
        "/exe",
        location()
      );
    }