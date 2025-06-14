# Allowed Environment Variables Plan

## Overview

Enable mlld files to access environment variables in a secure, explicit way by declaring required variables in `mlld.lock.json`. This replaces the current awkward pattern of piping JSON with environment variables.

## Current Problem

```bash
# Current awkward pattern:
echo '{"GITHUB_TOKEN":"'$GITHUB_TOKEN'"}' | mlld script.mld

# What users expect to work:
GITHUB_TOKEN=secret mlld script.mld
```

The JSON pipe pattern is a workaround because mlld doesn't allow direct environment variable access for security reasons. However, these env vars are already in the process (visible in `@DEBUG.environment`) - we just need a secure way to access them.

## Proposed Solution

Add an `allowedEnv` field to `mlld.lock.json` that declares which environment variables the project requires. mlld will:
1. Check these variables exist at startup (fail fast if missing)
2. Make them available through `@INPUT` 
3. Maintain explicit imports in each file that needs them

## Design Options

### Option 1: Simple Global Allow List (Recommended for v1)

```json
{
  "modules": { ... },
  "allowedEnv": [
    "NODE_ENV",
    "GITHUB_TOKEN",
    "ANTHROPIC_API_KEY",
    "DATABASE_URL"
  ]
}
```

**Pros:**
- Simple to implement and understand
- Easy to review in PRs
- Covers 90% of use cases
- Natural upgrade path to Option 2

**Cons:**
- All files get access to all allowed vars
- Less granular than ideal

### Option 2: File-Specific Permissions (Future Enhancement)

```json
{
  "modules": { ... },
  "allowedEnv": {
    "*": ["NODE_ENV", "DEBUG"],
    "scripts/deploy.mld": ["AWS_ACCESS_KEY", "AWS_SECRET_KEY"],
    "github-sync.mld": ["GITHUB_TOKEN"],
    "ai-review.mld": ["ANTHROPIC_API_KEY", "GITHUB_TOKEN"]
  }
}
```

**Pros:**
- Principle of least privilege
- Clear audit trail of what needs what
- More secure for larger projects

**Cons:**
- More complex to manage
- Lock file could become verbose
- Harder to refactor (moving code between files)
- Might be overkill for small projects

### Recommendation: Start with Option 1

Implement the simple global list first, but design the implementation to support file-specific permissions as a future enhancement. This follows mlld's philosophy of starting simple and adding complexity only when needed.

## Implementation Details

### 1. Lock File Changes

Update `mlld.lock.json` schema:
```typescript
interface MlldLockFile {
  modules: { ... };
  allowedEnv?: string[] | {  // Support both formats
    "*"?: string[];
    [filename: string]: string[];
  };
}
```

### 2. Environment Loading & Validation

At startup, mlld validates required environment variables:
```typescript
private async validateRequiredEnvVars(): Promise<void> {
  const lockFile = await this.loadLockFile();
  if (!lockFile.allowedEnv) return;
  
  const missing: string[] = [];
  
  if (Array.isArray(lockFile.allowedEnv)) {
    for (const varName of lockFile.allowedEnv) {
      if (!process.env[varName]) {
        missing.push(varName);
      }
    }
  }
  
  if (missing.length > 0) {
    throw new MlldError(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      `These variables are declared as required in mlld.lock.json`,
      { code: 'ENV_VARS_MISSING', severity: 'fatal' }
    );
  }
}

// Make allowed env vars available in @INPUT
private async getInputData(): Promise<any> {
  const lockFile = await this.loadLockFile();
  const allowedEnv = lockFile.allowedEnv || [];
  
  // Include allowed env vars in @INPUT
  const envData: Record<string, string> = {};
  for (const varName of allowedEnv) {
    if (process.env[varName]) {
      envData[varName] = process.env[varName];
    }
  }
  
  // Merge with any stdin data
  return { ...this.stdinData, ...envData };
}
```

### 3. Variable Access

Environment variables are accessed through explicit imports from `@INPUT`:
```mlld
# Import the env vars you need in this file
@import { GITHUB_TOKEN, NODE_ENV } from @INPUT

# Now use them like any other variable
@add "Token: @GITHUB_TOKEN"
@when @NODE_ENV: [
  "production" => @add "Running in production"
  "development" => @add "Running in development"
]
```

This maintains mlld's explicit philosophy - you can see exactly what external dependencies each file has.

### 4. CLI Commands

Add commands to manage allowed env vars:
```bash
# Add an allowed env var
mlld env allow GITHUB_TOKEN

# List allowed env vars
mlld env list

# Remove an allowed env var
mlld env remove GITHUB_TOKEN
```

### 5. Security Considerations

1. **Empty by default**: No env vars accessible unless explicitly listed
2. **Required means required**: Missing vars cause startup failure
3. **Case sensitive**: ENV var names must match exactly  
4. **No wildcards**: Each var must be explicitly named (no `AWS_*`)
5. **No dynamic access**: Can't use variables to access other env vars
6. **Import tracking**: Can audit which files use which env vars

### 6. Migration Path

For existing projects using the JSON pipe pattern:
1. Run migration command: `mlld migrate:env`
2. Scans for `@import { ... } from @input` patterns
3. Suggests env vars to add to allowedEnv
4. Updates lock file

## Testing Strategy

### Unit Tests
- Lock file parsing with allowedEnv
- Environment variable filtering
- File-specific matching (for Option 2)

### Integration Tests
```mlld
# test-env-vars.mld
@when @NODE_ENV => @add "NODE_ENV is accessible"
@when @SECRET_VAR => @add "This should not appear"
```

### Security Tests
- Verify non-allowed vars are not accessible
- Test that vars can't be accessed dynamically
- Ensure no env var injection attacks

## Success Criteria

1. ✅ No more JSON pipe hack needed
2. ✅ Environment variables work as users expect
3. ✅ Clear security model (explicit allow list)
4. ✅ Easy to review in PRs
5. ✅ Backward compatible (old pattern still works)
6. ✅ Good error messages for non-allowed vars

## Timeline

1. **Phase 1**: Implement Option 1 (global allow list)
2. **Phase 2**: Add CLI commands for management
3. **Phase 3**: Migration tooling
4. **Phase 4**: Consider Option 2 based on user feedback

## Open Questions

1. Should we have a default allowed list? (e.g., always allow NODE_ENV, DEBUG)
2. Should we support regex patterns? (e.g., "REACT_APP_*")
3. How do we handle env vars in modules vs. project files?
4. Should there be an --allow-all-env flag for development?

## Example Usage

```json
// mlld.lock.json
{
  "modules": {
    "@mlld/core": { "version": "1.0.0" }
  },
  "allowedEnv": [
    "NODE_ENV",
    "GITHUB_TOKEN",
    "ANTHROPIC_API_KEY"
  ]
}
```

```mlld
// my-script.mld
@import { NODE_ENV, GITHUB_TOKEN, ANTHROPIC_API_KEY } from @INPUT

@when @NODE_ENV: [
  "production" => @import { prodConfig } from "./config/prod.mld"
  "development" => @import { devConfig } from "./config/dev.mld"
]

@exec callGitHub(endpoint) = @run [(
  curl -H "Authorization: Bearer @GITHUB_TOKEN" \
       "https://api.github.com/@endpoint"
)]

@data user = @callGitHub("user")
@add "Authenticated as: @user.login"
```

This approach makes environment variables first-class citizens in mlld while maintaining security through explicit opt-in.

## Benefits of This Design

1. **Fail Fast**: Missing required env vars are caught immediately at startup
2. **Self-Documenting**: `mlld.lock.json` documents what env vars the project needs
3. **Explicit Dependencies**: Each file imports only what it uses via `@import`
4. **No Magic**: Clear flow from lock file → validation → import → use
5. **Secure by Default**: Only declared variables are accessible
6. **Natural Migration**: Existing `@import { ... } from @INPUT` pattern just works
7. **CI/CD Friendly**: Clear error messages about missing vars help debugging