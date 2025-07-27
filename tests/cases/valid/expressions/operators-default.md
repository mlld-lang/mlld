# Default Value Operator Test

Tests the || operator for default values.

## Input

```mlld
/var @userConfig = null
/var @defaultConfig = "default.json"

>> Using || for default values
/var @config = @userConfig || @defaultConfig

/show "Config: "
/show @config
```

## Expected Output

```
Config: default.json
```