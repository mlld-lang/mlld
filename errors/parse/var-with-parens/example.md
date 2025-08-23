# Example: /var with parentheses error

## What causes this error

This error occurs when you try to define an executable function using `/var` instead of `/exe`:

```mlld
/var @greeting = "Hello"
/var @getTime() = run {echo "12:00 PM"}  # ❌ Wrong - /var can't define executables
```

## How to fix it

Use `/exe` to define executables:

```mlld
/var @greeting = "Hello"
/exe @getTime() = run {echo "12:00 PM"}  # ✅ Correct - /exe for executables
```

## Why this distinction matters

- `/var` creates variables that hold data (strings, objects, arrays, etc.)
- `/exe` creates executable functions that can be called with parameters
- This separation makes the code clearer and helps prevent confusion

