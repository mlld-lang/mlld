// EXE RHS CONTENT - Unified right-hand side for /exe directive
// Used by: /exe directive  
// Purpose: Route to appropriate content parser based on syntax detection

ExeRHSContent "exe assignment value"
  = WhenExpression              // when: [...] expressions for conditional execution
  / ExeSlashRunPattern          // /run {command} or /run js {code} - optional slash syntax
  / ExeRunCommandPattern        // run {command} - explicit run command syntax
  / ExeCodePattern              // js {code} - language-specific code blocks
  / ExeEnvironmentDeclaration   // { helper1, helper2 } - environment setup (must come before command)
  / ExeCommandPattern           // {command} - shell commands with interpolation
  / ExeTemplatePattern          // [[...]] and `...` - template executables
  / ExeSectionPattern           // [@file # section] - section extraction
  / ExeResolverPattern          // @resolver/path - resolver patterns
  / ExeCommandReference         // @otherCmd - command references

// -------------------------------------------------------------
// EXE-SPECIFIC RHS PATTERNS
// -------------------------------------------------------------

// Slash run pattern for exe context - handles "/run {command}" or "/run js {code}" syntax
ExeSlashRunPattern "exe slash run pattern"
  = "/run" _ langCode:RunLanguageCodeCore {
      // /run js {code} pattern
      return {
        subtype: 'exeCode',
        source: 'code',
        values: {
          lang: langCode.values.lang,
          args: langCode.values.args,
          code: langCode.values.code
        },
        raw: {
          lang: langCode.raw.lang,
          args: langCode.raw.args,
          code: langCode.raw.code
        },
        meta: langCode.meta
      };
    }
  / "/run" _ content:UnifiedCommandBrackets {
      // /run {command} pattern
      return {
        subtype: 'exeCommand',
        source: 'command',
        values: {
          command: content.values.command,
          commandBases: content.values.commandBases
        },
        raw: {
          command: content.raw.command,
          commandBases: content.raw.commandBases
        },
        meta: content.meta
      };
    }

// Run command pattern for exe context - handles "run {command}" syntax
ExeRunCommandPattern "exe run command pattern"
  = "run" _ content:UnifiedCommandBrackets {
      return {
        subtype: 'exeCommand',
        source: 'command',
        values: {
          command: content.values.command,
          commandBases: content.values.commandBases
        },
        raw: {
          command: content.raw.command,
          commandBases: content.raw.commandBases
        },
        meta: content.meta
      };
    }

// Code pattern for exe context - wraps RunLanguageCodeCore
ExeCodePattern "exe code pattern"
  = codeCore:RunLanguageCodeCore {
      return {
        subtype: 'exeCode',
        source: 'code',
        values: {
          lang: codeCore.values.lang,
          args: codeCore.values.args,
          code: codeCore.values.code
        },
        raw: {
          lang: codeCore.raw.lang,
          args: codeCore.raw.args,
          code: codeCore.raw.code
        },
        meta: codeCore.meta
      };
    }

// Command pattern for exe context - wraps UnifiedCommandBrackets
ExeCommandPattern "exe command pattern"
  = content:UnifiedCommandBrackets {
      return {
        subtype: 'exeCommand',
        source: 'command',
        values: {
          command: content.values.command,
          commandBases: content.values.commandBases
        },
        raw: {
          command: content.raw.command,
          commandBases: content.raw.commandBases
        },
        meta: content.meta
      };
    }

// Template pattern for exe context - wraps TemplateCore
ExeTemplatePattern "exe template pattern"
  = template:TemplateCore {
      return {
        subtype: 'exeTemplate',
        source: 'template',
        values: {
          template: template.values.content
        },
        raw: {
          template: template.raw.content
        },
        meta: template.meta
      };
    }

// Section pattern for exe context - handles [@file # section] [as @newheader]
ExeSectionPattern "exe section pattern"
  = "[" _ pathVar:VariableNoTail _ "#" _ section:SectionIdentifier _ "]" rename:ExecAsNewTitle? {
      return {
        type: 'exeSection',
        values: {
          path: [pathVar],
          section: Array.isArray(section) ? section : [section],
          ...(rename ? { rename: rename } : {})
        },
        raw: {
          path: '@' + pathVar.identifier + (pathVar.fields ? '.' + pathVar.fields.map(f => f.name || f.index).join('.') : ''),
          section: section.type === 'VariableReference' ? '@' + section.identifier : (section.content || section),
          ...(rename ? { rename: rename[0].type === 'VariableReference' ? '@' + rename[0].identifier : rename[0].content } : {})
        },
        meta: {
          hasRename: !!rename
        },
        subtype: 'exeSection',
        source: 'section'
      };
    }

// Resolver pattern for exe context - handles @resolver/path [{ @payload }]
ExeResolverPattern "exe resolver pattern"
  = "@" resolver:ResolverPathPattern payload:ExecResolverPayload? {
      return {
        type: 'exeResolver',
        values: {
          resolver: [helpers.createVariableReferenceNode('varIdentifier', { identifier: resolver }, location())],
          ...(payload ? { payload: payload } : {})
        },
        raw: {
          resolver: resolver,
          ...(payload ? { payload: payload[0].identifier || payload[0].content } : {})
        },
        meta: {
          hasPayload: !!payload
        },
        subtype: 'exeResolver',
        source: 'resolver'
      };
    }

// Command reference for exe context - handles @otherCmd
ExeCommandReference "exe command reference"
  = "@" commandRef:BaseIdentifier !("/" / "(" / ".") {
      return {
        type: 'exeCommandRef',
        values: {
          commandRef: [helpers.createVariableReferenceNode('varIdentifier', { identifier: commandRef }, location())]
        },
        raw: {
          commandRef: commandRef
        },
        meta: {
          isCommandRef: true
        },
        subtype: 'exeCommand',
        source: 'reference'
      };
    }

// Environment declaration for exe context - handles { helper1, helper2 }
ExeEnvironmentDeclaration "exe environment declaration"
  = "{" _ envVars:EnvironmentVarList _ "}" {
      return {
        type: 'exeEnvironment',
        values: {
          environment: envVars
        },
        raw: {
          environment: envVars.map(v => v.identifier)
        },
        meta: {
          environmentCount: envVars.length
        },
        subtype: 'environment',
        source: 'environment'
      };
    }

// -------------------------------------------------------------
// HELPER RULES (no conflicts with exe.peggy versions)
// -------------------------------------------------------------

// ResolverPathPattern - matches resolver paths like resolver/api/@endpoint/@parameter
// Must contain at least one slash to distinguish from simple identifiers like "run"
ResolverPathPattern
  = chars:$([a-zA-Z0-9_@-]+ "/" [a-zA-Z0-9_/@-]*) { return chars; }

// ExecResolverPayload - optional payload syntax: { @variable }
ExecResolverPayload
  = _ "{" _ varRef:VariableNoTail _ "}" {
      return [varRef];
    }

// AsNewTitle pattern for exec section renaming - supports both literals and variables
ExecAsNewTitle
  = _ "as" _ title:LiteralContent {
      return title;
    }
  / _ "as" _ varRef:VariableNoTail {
      return [varRef];
    }