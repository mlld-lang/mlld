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
          isBracketed: code.raw.trim().startsWith('[') && code.raw.trim().endsWith(']'),
          hasLanguage: !!language,
          language: language || 'text'
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
          isBracketed: code.raw.trim().startsWith('[') && code.raw.trim().endsWith(']'),
          hasLanguage: true,
          language
        }
      };
    }

// -------------------------------------------------------------
// RUN LANGUAGE CODE CORE - Unified language + code block pattern
// -------------------------------------------------------------

// This is the key abstraction that can be used by both run.peggy and exec.peggy
// for consistent handling of language + code block patterns in different contexts
RunLanguageCodeCore
  = language:RunCodeLanguage _ args:RunCodeArgs? _ code:DirectCodeContent {
      helpers.debug('RunLanguageCodeCore matched', { language, args, code });
      
      // Create language node
      const langNode = helpers.createNode(NodeType.Text, { content: language }, location());
      
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
        isBracketed: true
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
    
// Code language identifier for run directive
RunCodeLanguage
  = language:BaseIdentifier {
      return language;
    }

// Optional arguments for code blocks
RunCodeArgs
  = "(" _ args:RunArgsList? _ ")" {
      return args || [];
    }

RunArgsList
  = first:RunArg rest:(_ "," _ arg:RunArg { return arg; })* {
      return [first, ...rest];
    }

RunArg
  = varName:BaseIdentifier {
      return helpers.createVariableReferenceNode('varInterpolation', { identifier: varName }, location());
    }