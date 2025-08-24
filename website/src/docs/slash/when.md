---
layout: docs.njk
title: "/when Directive"
---

# /when Directive

The `/when` directive provides conditional execution in mlld. It evaluates expressions and runs matching actions.

## Simple Form

```mlld
/when @condition => show "Condition met"
```

Any expression can be used as the condition.

### Truthiness and Operators

Conditions follow mlld's truthiness rules:

- **Falsy:** `false`, `null`, `undefined`, `""`, `0`, `[]`, `{}`
- **Truthy:** everything else

Build conditions with comparison operators (`==`, `!=`, `>`, `>=`, `<`, `<=`) and logical operators (`&&`, `||`, `!`). Parentheses control precedence.

## Block Form

The block form evaluates each condition independently. Every matching condition runs its action. Use `none` as a fallback when no conditions match.

```mlld
/when [
  @user.role == "admin" => show "Admin access"
  @user.role == "editor" => show "Editor access"
  none => show "Guest access"
]
```

## `/when first`

`/when first` stops after the first matching condition. Use the `*` wildcard for a default case.

```mlld
/when first [
  @env == "dev" => show "Dev mode"
  @env == "prod" => show "Prod mode"
  * => show "Unknown mode"
]
```

## Executables with `when`

Executables defined with `/exe` can include conditional logic.

```mlld
/exe @grade(score) = when [
  @score > 90 => "A"
  @score > 80 => "B"
  none => "F"
]
```

### `/exe` with `when first`

```mlld
/exe @status(code) = when first [
  200 => "OK"
  404 => "Not Found"
  * => "Error"
]
```
