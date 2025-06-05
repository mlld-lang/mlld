```
Expected "@add" or whitespace but "@" found.
Location: line 1, column 22
```

**Error explanation:**
The syntax `@text codecat(dir) = @run [(...)]` is invalid. For parameterized commands that execute shell commands, use `@exec` instead:

**Correct syntax:**
```mlld
@exec codecat(dir) = @run [(find @dir -type f -name "*.js" -exec cat {} \;)]
```

**Alternative for text templates:**
```mlld
@text greeting(name) = @add [[Hello {{name}}!]]
```