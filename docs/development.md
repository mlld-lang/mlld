# mlld Development Guide

Tips and techniques for developing with mlld and debugging modules.

## Debugging Techniques

### Inspect Module State with `@debug`

Add `@add @debug` at the bottom of your module to see the complete state as mlld sees it:

```mlld
@import { utils } from @alice/utils
@text myVar = "Hello"
@data config = { "env": "dev" }

# Your module code here...

# Add this at the end to inspect state
@add @debug
```

This outputs:
- All variables in the current scope
- Imported modules and their exports
- Environment information
- File paths and module resolution

**Note**: The debug output shows environment variables from your system, but these aren't directly accessible in mlld code. To use environment variables, pass them via stdin:

```bash
# Pass environment variables to mlld
echo '{"API_KEY": "'$API_KEY'"}' | mlld my-module.mld.md
```

Then import them:
```mlld
@import { API_KEY } from @INPUT
```

### Use `--stdout` for Quick Testing

Skip file creation and see results immediately in your terminal:

```bash
mlld my-module.mld.md --stdout
```

This is perfect for:
- Quick iterations during development
- Piping output to other commands
- Testing without cluttering your filesystem
- CI/CD pipelines where you only need the output

Example workflow:
```bash
# Test and pipe to jq for JSON formatting
mlld data-processor.mld.md --stdout | jq .

# Test and save only if successful
mlld my-module.mld.md --stdout && mlld my-module.mld.md -o output.md
```


---

*More development tips coming soon! Have a useful technique? [Contribute to this guide](../CONTRIBUTING.md).*