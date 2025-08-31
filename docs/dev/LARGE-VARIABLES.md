# Large Variable Handling Architecture

## Problem

Node.js `spawnSync()` throws `E2BIG` when environment variables exceed ~200KB total, well below OS limits. This affects mlld's core use case of processing entire codebases.

## Solution: Heredoc Injection

For bash/sh executables, large variables are injected via heredocs instead of environment variables.

### Implementation Location

`interpreter/env/executors/BashExecutor.ts` (lines 84-138)

### How It Works

1. **Detection**: Variables >128KB (configurable) are separated from regular env vars
2. **Sanitization**: Variable names are sanitized for bash compatibility
3. **Marker Generation**: Unique EOF markers avoid content collision
4. **Injection**: Heredoc prelude prepended to user code
5. **Execution**: Script sent via stdin to bash

### Example Transformation

Input:
```typescript
envVars = { 
  huge_data: "500KB of content...",
  small_var: "hello"
}
code = 'echo "$huge_data" | wc -l'
```

Output script:
```bash
huge_data=$(cat <<'MLLD_EOF_abc123_def456'
[500KB of content...]
MLLD_EOF_abc123_def456
)
export huge_data
echo "$huge_data" | wc -l
```

### Configuration

- `MLLD_BASH_HEREDOC`: Enable flag (off by default)
- `MLLD_MAX_BASH_ENV_VAR_SIZE`: Threshold in bytes (default: 131072)
- `MLLD_DEBUG`: Shows when heredocs are used

### Security Considerations

1. **Single-quoted markers**: Prevents variable expansion in heredoc content
2. **Collision detection**: Ensures marker doesn't exist in content
3. **Name sanitization**: Handles special characters in variable names
4. **Mock safety**: Disabled in test mock mode

### Limitations

- Only applies to BashExecutor (not ShellCommandExecutor)
- Increases script size (but avoids E2BIG)
- Bash's own limits still apply (much higher)

### Testing

Test with large files:
```bash
# Create 250KB test file
head -c 256000 < /dev/zero | tr '\0' 'a' > large.txt

# Test script
MLLD_BASH_HEREDOC=1 MLLD_DEBUG=true mlld test.mld
```

Where test.mld:
```mlld
/var @data = <large.txt>
/exe @process(content) = sh { echo "$content" | wc -c }
/show @process(@data)
```

### Related Files

- `bug-large-env-vars.md`: Original issue and design decisions
- `interpreter/env/bash-variable-adapter.ts`: Variable conversion
- `docs/user/large-variables.md`: User documentation