# Grammar Parsing Issue: exec with js/code blocks

## Summary
The mlld parser is failing to parse the new syntax for exec directives with language-specific code blocks. The syntax `/exec @name() = js { code }` is throwing a parse error.

## Error Details
```
Parse Error: Expected Code brackets {...} or whitespace but "{" found.
Location: Line 3, Column 23
```

This error occurs at the position right after `js` and before `{`.

## Examples of Failing Syntax
```mlld
# All of these fail with the same error:
/exec @add(a, b) = js {a + b}
/exec @multiply(x, y) = js {x * y}
/exec @greet(name) = bash {echo "Hello, $name!"}
/exec @calculate(n) = js {
  const sum = add(n, 10);
  return sum * 2;
}
```

## What Should Work
According to the documentation in `llms-new-syntax.txt`:
```mlld
# Code executable
/exec @calculate(x) = js {return @x * 2}
```

## Grammar Structure
The exec directive grammar (from `grammar/directives/exec.peggy`) has this rule:
```peggy
// Code executable: /exec name(params) = js {code}
/ DirectiveContext "/exec" _ "@" id:BaseIdentifier meta:ExecMetadata? params:ExecParameters? _ "=" _ codeCore:RunLanguageCodeCore withClause:WithClause? trust:(_ t:TrustOption { return t; })? {
```

Which uses `RunLanguageCodeCore` from `grammar/core/code.peggy`:
```peggy
RunLanguageCodeCore
  = language:RunCodeLanguage _ code:UnifiedCodeBrackets {
```

And `UnifiedCodeBrackets` from `grammar/patterns/unified-run-content.peggy`:
```peggy
UnifiedCodeBrackets "Code brackets {...}"
  = "{" _ content:$(UnifiedCodeContent) _ "}" {
```

## The Problem
The parser is failing at the `UnifiedCodeBrackets` rule. It's expecting "Code brackets {...}" but when it encounters the `{` character, it fails. This suggests either:

1. **Token Conflict**: Another rule is consuming the `{` before `UnifiedCodeBrackets` can match it
2. **Whitespace Issue**: The `_` (whitespace) rule between `language` and `code` isn't matching properly
3. **Rule Ordering**: The exec directive rules are evaluated in a specific order, and an earlier rule is partially matching and failing

## Test Results
- 50 tests are failing due to this parse error
- All failing tests involve exec directives with language specifiers (js, node, bash, etc.)
- The shadow environment syntax `/exec js = { add, multiply }` might also be affected

## Files Affected
Key test files with this issue:
- `tests/cases/valid/exec/js-shadow-env-test/example.md`
- `tests/cases/valid/exec/code-brackets/example.md`
- `tests/cases/valid/data/foreach-bash-env/example.md`
- `tests/cases/valid/exec/param-interpolation/example.md`
- And many others...

## Current Status
1. We've updated all test files from old syntax (`@` → `/`, `[()]` → `{}`, etc.)
2. We've fixed formatting issues (empty `{}` blocks, indentation)
3. The fixtures have been rebuilt with the updated content
4. But the parser itself cannot parse the new exec + language syntax

## Next Steps
Need to debug why the grammar rule `UnifiedCodeBrackets` is not matching when preceded by a language specifier. This likely requires:
1. Examining the full grammar compilation to see if there are conflicts
2. Testing simpler cases to isolate the issue
3. Possibly adjusting the rule ordering or syntax in the grammar files