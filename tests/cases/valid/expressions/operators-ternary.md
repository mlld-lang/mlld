# Ternary Operator Test

Tests the ternary conditional operator.

## Input

```mlld
/var @isDev = true
/var @isProd = false

/var @config = @isDev ? "development.json" : "production.json"
/var @logLevel = @isProd ? "error" : "debug"

/show "Config: "
/show @config
/show "\nLog Level: "
/show @logLevel
```

## Expected Output

```
Config: development.json
Log Level: debug
```