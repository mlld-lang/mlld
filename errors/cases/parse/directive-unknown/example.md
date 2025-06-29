# Unknown Directive Error

This pattern catches attempts to use directives that don't exist in mlld.

## Example Input

```mld
/print "Hello World"
```

## Current Error (Peggy)
```
Expected "/exe", "/import", "/output", "/path", "/run", "/show", "/var", "/when", ">>", [^\r\n], or end of input but "/" found.
```

## Enhanced Error (Pattern)
```
Unknown directive '/print'. Available directives: /var, /show, /run, /exe, /import, /output, /when, /path, /foreach
```

## Common Mistakes This Catches
- `/print` (should be `/show`)
- `/echo` (should be `/show` or `/run {echo ...}`)
- `/set` (should be `/var`)
- `/if` (should be `/when`)
- `/for` (should be `/foreach`)