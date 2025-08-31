# Working with Large Variables

mlld can handle large amounts of data (like entire codebases loaded with `<**/*.sol>`) but has some limits due to system constraints.

## Quick Reference

**Problem**: Variables larger than ~200KB fail with `E2BIG` error when passed to commands.

**Solution**: Use bash/sh executables with heredoc support enabled:
```bash
export MLLD_BASH_HEREDOC=1  # Enable large variable support
export MLLD_MAX_BASH_ENV_VAR_SIZE=262144  # Optional: adjust threshold (default 128KB)
```

## When This Applies

- Loading many files: `<**/*.md>` 
- Processing large datasets
- Working with entire codebases

## How to Handle

### For Bash/Shell Code
```mlld
# This works with large data when MLLD_BASH_HEREDOC=1
/var @contracts = <**/*.sol>
/exe @analyze(code) = sh {
  echo "$code" | solidity-analyzer
}
/show @analyze(@contracts)
```

### For Simple Commands
If `/run` fails with large data, switch to an executable:
```mlld
# Instead of: /run {wc -l < "@bigfile"}
/exe @count(data) = sh { echo "$data" | wc -l }
/show @count(@bigfile)
```

## Environment Variables

- `MLLD_BASH_HEREDOC`: Set to `1`, `true`, `on`, or `enabled` to enable
- `MLLD_MAX_BASH_ENV_VAR_SIZE`: Size threshold in bytes (default: 131072)
- `MLLD_DEBUG`: Set to `true` to see when heredocs are used