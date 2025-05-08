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