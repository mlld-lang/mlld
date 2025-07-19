# mlldx

Ephemeral mlld for CI/CD and serverless environments.

## Installation

```bash
# Run directly with npx
npx mlldx script.mld

# Or install globally
npm install -g mlldx
mlldx script.mld
```

## What is mlldx?

`mlldx` is a specialized version of [mlld](https://mlld.ai) designed for ephemeral environments like:
- GitHub Actions
- Vercel Functions
- AWS Lambda
- Docker containers
- CI/CD pipelines

## Key Features

- **No filesystem persistence** - All caching happens in memory
- **Auto-approves imports** - No interactive prompts that would hang CI/CD
- **Zero configuration** - Works out of the box in serverless environments
- **Same mlld syntax** - All your existing mlld scripts work unchanged

## Why mlldx?

Standard `mlld` is designed for development environments with:
- Persistent filesystem for module caching
- Interactive prompts for security
- Local `.mlld-cache` directory

`mlldx` adapts mlld for environments where:
- Filesystems are read-only or ephemeral
- User interaction is impossible
- Performance matters (in-memory caching)
- Security is handled by the environment

## Example

```bash
# In GitHub Actions
- name: Run mlld script
  run: npx mlldx my-script.mld

# With environment variables
- name: Run with secrets
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  run: npx mlldx process-data.mld
```

## Documentation

For full mlld documentation, see the [main mlld repository](https://github.com/mlld-lang/mlld).

## License

MIT
