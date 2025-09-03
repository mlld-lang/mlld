# Large Variable Handling Architecture

## Problem

Node.js `spawnSync()` throws `E2BIG` when environment variables exceed ~200KB total, well below OS limits. This affects mlld's core use case of processing entire codebases.

## Solution: Heredoc Injection

For bash/sh executables, large variables are injected via heredocs instead of environment variables.

### Implementation Location

`interpreter/env/executors/BashExecutor.ts`

### How It Works

1. **Detection**: Variables >128KB (configurable) are separated from regular env vars
2. **Sanitization**: Variable names are sanitized for bash compatibility
3. **Marker Generation**: Unique EOF markers avoid content collision
4. **Injection**: Heredoc prelude prepended to user code as shell-local assignments
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
echo "$huge_data" | wc -l
```

### Configuration

- `MLLD_BASH_HEREDOC`: Enabled by default for bash/sh. Set to `0`, `false`, `off`, or `disabled` to disable.
- `MLLD_MAX_BASH_ENV_VAR_SIZE`: Threshold in bytes for heredoc injection (default: 131072)
- `MLLD_DEBUG`: Shows when heredocs are used
- `MLLD_DEBUG_BASH_SCRIPT=1`: Dumps the full constructed bash script + env keys to stderr

Note: Oversized variables are intentionally not exported. Keeping them as local
shell variables avoids E2BIG when executing external programs (env + argv size).

If a parameter name contains characters not allowed in bash identifiers, we sanitize
it (e.g., `my-var-name` → `my_var_name`) and create an alias so both `$my_var_name`
and `$my-var-name` work within the script.

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

### Bash Variable Adapter Behavior

File-backed values (LoadContentResult) are unwrapped to their `.content` string for bash/sh
parameters. Arrays of LoadContentResult are joined with a blank line between entries.

- Implementation: `interpreter/env/bash-variable-adapter.ts`
- Rationale: bash expects plain strings; unwrapping preserves user intent for `$var`.

### Run Command Behavior (/run)

By default, simple `/run { ... }` will automatically fall back to bash execution
when command or env payloads exceed conservative limits, avoiding Node's E2BIG.
This fallback streams the command via stdin and, when parameters are present,
uses heredocs for oversized values. This makes large-data use transparent in most cases.

Configurable thresholds for the fallback check:

- `MLLD_MAX_SHELL_ENV_VAR_SIZE` (default 131072): per-variable env size guard
- `MLLD_MAX_SHELL_ENV_TOTAL_SIZE` (default ~200KB): total env override size guard
- `MLLD_MAX_SHELL_COMMAND_SIZE` (default 131072): command payload size guard
- `MLLD_MAX_SHELL_ARGS_ENV_TOTAL` (default ~256KB): combined args+env size guard

Implementation:
- Pre-check and fallback: `interpreter/env/executors/CommandExecutorFactory.ts`
- Strict simple executor (used when not falling back): `interpreter/env/executors/ShellCommandExecutor.ts`

### Default Behavior and Opt-out

- Bash/sh heredoc injection: ON by default (toggle via `MLLD_BASH_HEREDOC`)
- Variables injected via heredoc are shell-local (not exported)
- `/run` auto-fallback to bash for large payloads is ON by default
- Set `MLLD_DISABLE_SH=1` to disable fallback and keep `/run` strict (useful for
  debugging or enforcing policy until security controls are in place)

### Related Files

- `bug-large-env-vars.md`: Original issue and design decisions
- `interpreter/env/bash-variable-adapter.ts`: Variable conversion
- `docs/user/large-variables.md`: User documentation
