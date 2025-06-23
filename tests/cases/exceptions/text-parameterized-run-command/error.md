```
Expected "@add" or whitespace but "@" found.
Location: line 1, column 22
```

**Error explanation:**
The syntax `@exec codecat(dir) = @run {...}` is invalid. For parameterized commands that execute shell commands, use `@exec` instead:

**Correct syntax:**
```mlld
/exe @codecat(dir) = {find @dir -type f -name "*.js" -exec cat {} \;}
```

**Alternative for text templates:**
```mlld
/exe @greeting(name) = [[Hello {{name}}!]]
```