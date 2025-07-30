# Run Missing Braces Error

This pattern catches attempts to use /run without proper command wrapping.

## Example Input

```mld
/run echo "Hello World"
```

## Current Error (Peggy)
```
Expected "\"", "'", "@", "[", "\\", "{", or whitespace but "e" found.
```

## Enhanced Error (Pattern)
```
Commands in /run must be wrapped in braces or quotes:
  ❌ /run echo "Hello World"
  ✅ /run {echo "Hello World"}
  ✅ /run "echo Hello World"
```

## Common Mistakes This Catches
- `/run ls -la` (should be `/run {ls -la}`)
- `/run echo hello` (should be `/run {echo hello}`)
- `/run python script.py` (should be `/run {python script.py}`)

## Why This Happens
mlld requires explicit command boundaries to distinguish between:
- Command text
- Variable references
- Other directive modifiers