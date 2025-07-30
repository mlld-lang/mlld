# Semantic-Only Highlighting in mlld VSCode Extension

The mlld VSCode extension has been configured to rely primarily on semantic tokens from the Language Server Protocol (LSP) rather than regex-based TextMate grammars.

## Why This Change?

The regex-based TextMate grammar for mlld is problematic because:
1. mlld's context-sensitive syntax (6 different template types with different interpolation rules)
2. Embedded languages with their own syntax
3. Complex interactions between Markdown and mlld directives

The LSP semantic tokens provide accurate, context-aware highlighting based on the actual AST.

## Current Setup

1. **Minimal TextMate Grammar**: The extension includes a minimal grammar (`mlld-minimal.tmLanguage.json`) that provides no highlighting rules. This prevents VSCode from applying incorrect regex-based highlighting.

2. **Semantic Tokens Only**: All syntax highlighting comes from the Language Server's semantic tokens, which understand:
   - Template contexts and interpolation rules
   - Variable declarations vs references
   - Embedded language regions
   - Operators and keywords in context

## Fallback Behavior

If the Language Server fails to start or semantic tokens are unavailable:
- The code will appear with NO syntax highlighting (just plain text)
- This is intentional - no highlighting is better than incorrect highlighting

## Re-enabling TextMate Grammar

If you need to re-enable the regex-based grammar:
1. Replace `mlld-minimal.tmLanguage.json` with the original `mlld.tmLanguage.json`
2. Update `package.json` to point to the full grammar file

## For Users

This change means:
- More accurate syntax highlighting
- Highlighting that understands context
- No more incorrect highlighting in complex scenarios
- Requires the Language Server to be running for any highlighting