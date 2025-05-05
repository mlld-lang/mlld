// OREGON TRAIL GRAVEYARD 🪦 - Rewritten during the Great Grammar Rewrite of 2025
// If you see errors after this change, you've made a wrong turn. Turn back before you catch dysentery.

// New implementation using modern patterns
DirectiveContent
  = content:WrappedPathContent {
    return content.parts;
  }

// Clean implementation of the quoted string patterns
QuotedString
  = '"' chars:DoubleQuotedChars '"' { return '"' + chars + '"'; }
  / "'" chars:SingleQuotedChars "'" { return "'" + chars + "'"; }
  / "`" chars:BacktickQuotedChars "`" { return "`" + chars + "`"; }

DoubleQuotedChars
  = chars:[^"]* { return chars.join(''); }

SingleQuotedChars
  = chars:[^']* { return chars.join(''); }

BacktickQuotedChars
  = chars:[^`]* { return chars.join(''); }

// Use our modern WrappedTemplateContent
NestedBrackets
  = content:WrappedTemplateContent {
    return content.parts;
  }

// Common directive parts
DirectiveOptions
  = options:DirectiveOptionsList {
    return options;
  }

DirectiveOptionsList
  = first:DirectiveOption rest:(_ "," _ option:DirectiveOption { return option; })* {
    return [first, ...rest];
  }

DirectiveOption
  = key:Identifier _ "=" _ value:QuotedString {
    return { key, value };
  }