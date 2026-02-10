// CODE CORE
// Core content handler for code blocks with optional bracketing

/* 
# Code Block Core

This file provides core code block handling that can be used by:
- @run directive for executing code blocks
- @exec directive for executing code with return values

Code blocks can be:
- Bracketed with [...] for multi-line code
- Unbracketed for simple expressions
- Without variable interpolation (unlike commands)

This file includes the RunLanguageCodeCore abstraction which provides a unified
handling of language + code block patterns that can be used consistently in both
top-level directive contexts and RHS contexts.
*/


// -------------------------------------------------------------
// CODE CORE - Standard code block
// -------------------------------------------------------------

CodeCore
  = code:WrappedCodeContent {
      helpers.debug('CodeCore matched code block', { code });
    
      // Extract language hint if present in brackets
      let language = null;
      let codeContent = code.raw;
      
      // Check for language hint in format [language: code]
      const langMatch = code.raw.match(/^\s*\[([a-zA-Z0-9_+#.]+)\s*:\s*([\s\S]*)\]\s*$/);
      if (langMatch) {
        language = langMatch[1];
        codeContent = langMatch[2];
      }
    
      // Structure for outputting a code block
      return {
        type: 'code',
        subtype: 'codeBlock',
        values: { 
          code: code.parts,
          ...(language ? { language: [helpers.createNode(NodeType.Text, { content: language, location: location() })] } : {})
        },
        raw: { 
          code: codeContent,
          ...(language ? { language } : {})
        },
        meta: {
          hasLanguage: !!language,
          language: language || 'text',
          hasVariables: false,  // Code blocks don't support variable interpolation
          isMultiLine: codeContent.includes('\n')
        }
      };
    }

// -------------------------------------------------------------
// LANGUAGE CODE CORE - Code with explicit language specification
// -------------------------------------------------------------

LanguageCodeCore
  = language:CodeLanguage _ code:WrappedCodeContent {
      helpers.debug('LanguageCodeCore matched', { language, code });
    
      // Structure for outputting language-specific code
      return {
        type: 'code',
        subtype: 'languageCode',
        values: { 
          language: [helpers.createNode(NodeType.Text, { content: language, location: location() })],
          code: code.parts
        },
        raw: { 
          language,
          code: code.raw
        },
        meta: {
          hasLanguage: true,
          language,
          hasVariables: false,  // Code blocks don't support variable interpolation
          isMultiLine: code.raw.includes('\n')
        }
      };
    }

// -------------------------------------------------------------
// RUN LANGUAGE CODE CORE - Unified language + code block pattern
// -------------------------------------------------------------

// This is the base abstraction for language + code patterns
// Used by exec.peggy where parameters are already parsed
RunLanguageCodeCore
  = streamPrefix:StreamKeyword? _ language:RunCodeLanguage workingDir:WorkingDirPath? _ code:UnifiedCodeBrackets {
      helpers.debug('RunLanguageCodeCore matched', { language, code });
      
      // Create language node
      const langNode = helpers.createNode(NodeType.Text, { content: language, location: location() });
      
      // Process code content - get from unified code brackets
      const codeContent = code.content;
      const codeNode = helpers.createNode(NodeType.Text, { content: codeContent, location: location() });
      
      // Build values and raw objects
      const values = {
        lang: [langNode],
        args: [],  // No args in this pattern - they're handled by the directive
        code: [codeNode]
      };
      
      const raw = {
        lang: language,
        args: [],
        code: codeContent
      };
      
      // Add metadata
      const meta = {
        isMultiLine: code.isMultiLine || codeContent.includes('\n'),
        language: language,
        hasVariables: false  // Code blocks don't support variable interpolation
      };

      if (workingDir) {
        values.workingDir = workingDir.parts;
        raw.workingDir = workingDir.raw;
        meta.workingDirMeta = workingDir.meta;
        meta.hasWorkingDir = true;
      }
      
      const withClause = streamPrefix ? { stream: true } : undefined;

      // Return a structured result that can be used by both directives
      return {
        type: 'runCode',
        values: withClause ? { ...values, withClause } : values,
        raw: withClause ? { ...raw, withClause } : raw,
        meta: withClause ? { ...meta, withClause } : meta,
        location: location()
      };
    }

// This pattern is used by run.peggy where arguments can appear after the language
RunLanguageCodeWithArgs
  = streamPrefix:StreamKeyword? _ language:RunCodeLanguage _ argList:UnifiedArgumentList workingDir:WorkingDirPath? _ code:UnifiedCodeBrackets {
      helpers.debug('RunLanguageCodeWithArgs matched', { language, argList, code });
      
      // Extract arguments from unified argument list
      const args = argList.arguments || [];
      
      // Create language node
      const langNode = helpers.createNode(NodeType.Text, { content: language, location: location() });
      
      // Process code content - get from unified code brackets
      const codeContent = code.content;
      const codeNode = helpers.createNode(NodeType.Text, { content: codeContent, location: location() });
      
      // Build values and raw objects
      const values = {
        lang: [langNode],
        args,
        code: [codeNode]
      };
      
      const raw = {
        lang: language,
        args: args ? args.map(arg => {
          // Handle different arg node types
          if (arg.type === NodeType.VariableReference) {
            return '@' + arg.identifier;
          }
          if (arg.type === NodeType.Argument && arg.value) {
            if (arg.value.type === NodeType.Text) return arg.value.content;
            if (arg.value.type === NodeType.VariableReference) return '@' + arg.value.identifier;
          }
          return arg.identifier || '';
        }) : [],
        code: codeContent
      };
      
      // Add metadata
      const meta = {
        isMultiLine: code.isMultiLine || codeContent.includes('\n'),
        language: language,
        hasVariables: false  // Code blocks don't support variable interpolation
      };

      if (workingDir) {
        values.workingDir = workingDir.parts;
        raw.workingDir = workingDir.raw;
        meta.workingDirMeta = workingDir.meta;
        meta.hasWorkingDir = true;
      }
      
      const withClause = streamPrefix ? { stream: true } : undefined;

      // Return a structured result that can be used by both directives
      return {
        type: 'runCode',
        values: withClause ? { ...values, withClause } : values,
        raw: withClause ? { ...raw, withClause } : raw,
        meta: withClause ? { ...meta, withClause } : meta,
        location: location()
      };
    }

// -------------------------------------------------------------
// SHARED CODE HELPERS
// -------------------------------------------------------------

// Simple code language identifier
CodeLanguage
  = lang:$(BaseIdentifier ("." BaseIdentifier)*) {
      return lang;
    }
    
// Code language identifier for run directive - restricted to known languages
RunCodeLanguage
  = language:("javascript" / "js" / "node" / "nodejs" / "python" / "py" / "bash" / "sh") {
      return language;
    }

// Legacy argument patterns removed - using UnifiedArgumentList directly where needed
