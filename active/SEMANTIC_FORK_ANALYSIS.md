# Semantic Fork Analysis for /run Directive

## Current AtRun Pattern Order (after my changes):

```
AtRun
  = DirectiveContext "/run" _ security:(SecurityOptions _)? "\"" command:$([^"]*) "\"" ...
  / DirectiveContext "/run" _ security:(SecurityOptions _)? content:UnifiedCommandBrackets ...
  / DirectiveContext "/run" _ security:(SecurityOptions _)? codeCore:(RunLanguageCodeWithArgs / RunLanguageCodeCore) ...
  / DirectiveContext "/run" _ security:(SecurityOptions _)? "@" commandRef:RunCommandReference ...
```

## Fork Analysis for Input: `/run {echo "Hello"}`

### Step 1: DirectiveContext matches "/run"
- ✅ Success - advances to position 5 (after "/run ")

### Step 2: Optional whitespace (_)
- Position 5 is already past the space, no whitespace to match

### Step 3: SecurityOptions check
- Position 5: character is "{"
- SecurityOptions starts with "(" for TTL or "trust" for trust level
- ❌ "{" doesn't match "(" or "t"
- Parser tries to continue without SecurityOptions (it's optional)

### Step 4: First Alternative - Quoted Command
- Expects: "\""
- Found: "{"
- ❌ Fails - moves to next alternative

### Step 5: Second Alternative - UnifiedCommandBrackets
- Expects: content:UnifiedCommandBrackets
- UnifiedCommandBrackets expects: "{"
- Found: "{"
- ✅ Should match!

## The Problem

The error message says it found "{" but expected various things INCLUDING "Command brackets {...}". This suggests the parser is reaching UnifiedCommandBrackets but failing inside it.

Let me check what UnifiedCommandParts expects...

```
UnifiedCommandBrackets = "{" _ parts:UnifiedCommandParts _ "}"
```

So after matching "{", it tries to match UnifiedCommandParts. Let's see what that is...