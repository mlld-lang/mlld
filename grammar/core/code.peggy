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
          ...(language ? { language } : {})
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
          language,
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

// This is the key abstraction that can be used by both run.peggy and exec.peggy
// for consistent handling of language + code block patterns in different contexts
RunLanguageCodeCore
  = &(RunCodeLanguage _) language:RunCodeLanguage _ args:RunCodeArguments? _ code:DirectCodeContent {
      helpers.debug('RunLanguageCodeCore matched', { language, args, code });
      
      // Create language node
      const langNode = helpers.createNode(NodeType.Text, { content: language, location: location() });
      
      // Process code content - get from bracketed content
      const codeContent = code[0].content;
      
      // Build values and raw objects
      const values = {
        lang: [langNode],
        args: args || [],
        code: code
      };
      
      const raw = {
        lang: language,
        args: args ? args.map(arg => arg.identifier || '') : [],
        code: codeContent
      };
      
      // Add metadata
      const meta = {
        isMultiLine: codeContent.includes('\n'),
        language: language,
        hasVariables: false  // Code blocks don't support variable interpolation
      };
      
      // Return a structured result that can be used by both directives
      return {
        type: 'runCode',
        values,
        raw,
        meta,
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
  = language:("javascript" / "js" / "python" / "py" / "bash" / "sh") {
      return language;
    }

// Optional arguments for code blocks
RunCodeArguments
  = "(" _ args:RunArgumentList? _ ")" {
      return args || [];
    }

RunArgumentList
  = first:RunArgument rest:(_ "," _ arg:RunArgument { return arg; })* {
      return [first, ...rest];
    }

RunArgument
  = varName:BaseIdentifier {
      return helpers.createVariableReferenceNode('varInterpolation', { identifier: varName }, location());
    }