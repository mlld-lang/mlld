// EXE RHS CONTENT - Unified right-hand side for /exe directive
// Used by: /exe directive  
// Purpose: Route to appropriate content parser based on syntax detection for executable definitions
// 
// This file provides 1:1 abstraction of existing SlashExe RHS patterns without adding new functionality

ExeRHSContent "exe assignment value"
  = WhenExpression              // when: [...] expressions for conditional executables (from var-rhs)
  / RunLanguageCodeCore         // Language + code patterns: js {code}
  / UnifiedCommandBrackets      // Command execution: {command}
  / TemplateCore                // Template executables: [[template]] or `template`
  / ExeDirectCommandReference   // Direct command references: @other (not @other/)
  / ExeResolverReference        // Resolver patterns: @resolver/path
  / ExeEnvironmentDeclaration   // Environment declarations: { vars }

// Direct command reference pattern (from SlashExe line 470)
// Matches: @other (but not @resolver/path)
ExeDirectCommandReference "direct command reference"
  = "@" commandRef:BaseIdentifier !"/" {
      return helpers.createVariableReferenceNode('varIdentifier', { identifier: commandRef }, location());
    }

// Resolver pattern (from SlashExe line 523)  
// Matches: @resolver/path
ExeResolverReference "resolver reference"
  = "@" resolver:ResolverPathPattern payload:ExecResolverPayload? {
      return {
        type: 'resolver',
        resolver: helpers.createVariableReferenceNode('varIdentifier', { identifier: resolver }, location()),
        payload: payload || null
      };
    }

// Environment declaration pattern (from SlashExe line 35, 68)
// Matches: { helperA, helperB }
ExeEnvironmentDeclaration "environment declaration"
  = "{" _ envVars:EnvironmentVarList _ "}" {
      return {
        type: 'environment',
        environment: envVars
      };
    }