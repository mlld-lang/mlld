# Workstream D: Keychain & Capabilities - Session Handoff

## Session History
- 87455325 (prior session)
- 366f1898 (prior session)
- 72c7ce5f (current session - dev-d)

## Current Status Summary

**6 of 9 phases complete. Keychain working. 3 CLI commands remaining.**

| Phase | Bead | Description | Status |
|-------|------|-------------|--------|
| 2.2 | mlld-ov8w | Keychain grammar | ✅ Closed |
| 2.3 | mlld-8ohj | /needs validation | ✅ Closed |
| 4.1 | mlld-esjy | Keychain functions | ✅ Closed |
| 4.2 | mlld-ut9i | macOS keychain | ✅ Closed |
| 5.1 | mlld-bniq | Environment type | ✅ Closed |
| 6.1 | mlld-19ya | `mlld env list` | ✅ Closed |
| 6.2 | mlld-l6n4 | `mlld env capture` | ⏳ **NEXT** |
| 6.3 | mlld-hmw5 | `mlld env spawn` | ⏳ Pending |
| 6.4 | mlld-9rot | `mlld env shell` | ⏳ Pending |

---

## Completed Work

### Keychain Import Pattern (Key Achievement)

**Syntax:** `/import { get, set, delete } from @keychain`

**Working example:**
```mlld
/needs { keychain }
/import { get, set, delete } from @keychain

/var @setResult = @set("mlld-test", "test-account", "my-secret-value")
/var @result = @get("mlld-test", "test-account")  // Returns: my-secret-value
/var @deleteResult = @delete("mlld-test", "test-account")
```

**Commits:**
- `ef9b93c3c` - Grammar + multi-arg fix
- `82605901f` - Handoff notes

**Key files modified:**
- `grammar/directives/import.peggy` - Added `@keychain` to ImportPath rule
- `interpreter/eval/exec-invocation.ts` - Multi-arg handling for keychain functions

### Env Command Router (Phase 6.0)

Already implemented at `cli/commands/env.ts`:
- `mlld env list` - ✅ Working
- `mlld env capture` - Stubbed, needs implementation
- `mlld env spawn` - Stubbed, needs implementation
- `mlld env shell` - Stubbed, needs implementation

---

## Remaining Work: Phase 6.2, 6.3, 6.4

### Phase 6.2: `mlld env capture <name>` (mlld-l6n4)

**Purpose:** Create environment module from current Claude config

**Implementation location:** `cli/commands/env.ts` - replace stub at line 129

**What it does:**
1. Extract OAuth token from `~/.claude/.credentials.json`
2. Store token in keychain (`mlld-env` service, `<name>` account)
3. Copy `settings.json`, `CLAUDE.md`, `hooks.json` to `.mlld/env/<name>/.claude/`
4. Generate `module.yml` with `type: environment`
5. Generate `index.mld` with `@spawn` and `@shell` exports

**Key code to add:**
```typescript
import { MacOSKeychainProvider } from '@core/resolvers/builtin/keychain-macos';

async function captureEnvCommand(args: string[]): Promise<void> {
  const name = args[0];
  const isGlobal = args.includes('--global');
  const claudeDir = path.join(os.homedir(), '.claude');
  const targetDir = isGlobal
    ? path.join(os.homedir(), '.mlld/env', name)
    : path.join(process.cwd(), '.mlld/env', name);

  // 1. Create directories
  await fs.mkdir(path.join(targetDir, '.claude'), { recursive: true });

  // 2. Extract and store token
  const credsPath = path.join(claudeDir, '.credentials.json');
  if (await exists(credsPath)) {
    const creds = JSON.parse(await fs.readFile(credsPath, 'utf-8'));
    const token = creds.oauth_token || creds.token;
    if (token) {
      const keychain = new MacOSKeychainProvider();
      await keychain.set('mlld-env', name, token);
      console.log('✓ Token stored in keychain');
    }
  }

  // 3. Copy config files (NOT credentials)
  const filesToCopy = ['settings.json', 'CLAUDE.md', 'hooks.json'];
  for (const file of filesToCopy) {
    const src = path.join(claudeDir, file);
    if (await exists(src)) {
      await fs.copyFile(src, path.join(targetDir, '.claude', file));
      console.log(`✓ Copied ${file}`);
    }
  }

  // 4. Generate module.yml
  await fs.writeFile(path.join(targetDir, 'module.yml'), `
name: ${name}
type: environment
about: "Environment captured from ~/.claude"
version: 1.0.0
entry: index.mld
`.trim());

  // 5. Generate index.mld
  await fs.writeFile(path.join(targetDir, 'index.mld'), `
/needs { keychain, cmd: [claude] }
/import { get } from @keychain

/var secret @token = @get("mlld-env", "${name}")

/exe @spawn(prompt) = \\
  CLAUDE_CODE_OAUTH_TOKEN=@token \\
  CLAUDE_CONFIG_DIR=@fm.dir/.claude \\
  claude -p @prompt

/exe @shell() = \\
  CLAUDE_CODE_OAUTH_TOKEN=@token \\
  CLAUDE_CONFIG_DIR=@fm.dir/.claude \\
  claude

/export { @spawn, @shell }
`.trim());

  console.log(`\n✓ Created environment: ${targetDir}`);
}
```

**Exit criteria:**
- [ ] Creates `.mlld/env/<name>/` directory structure
- [ ] Token stored in keychain (NOT in files)
- [ ] Config files copied (credentials.json NOT copied)
- [ ] module.yml and index.mld generated
- [ ] `--global` flag works

---

### Phase 6.3: `mlld env spawn <name> -- <command>` (mlld-hmw5)

**Purpose:** Run command with environment credentials/config

**Implementation location:** `cli/commands/env.ts` - replace stub at line 146

**What it does:**
1. Find environment module (local or global)
2. Load and evaluate `index.mld` to get exports
3. Retrieve token from keychain
4. Call `@spawn(prompt)` if available, else spawn directly with env vars

**Key code to add:**
```typescript
import { spawn } from 'child_process';

async function spawnEnvCommand(args: string[]): Promise<void> {
  const name = args[0];
  const separatorIndex = args.indexOf('--');
  const command = args.slice(separatorIndex + 1);

  // Find environment
  const envDir = await findEnvModule(name);
  if (!envDir) {
    console.error(`Environment not found: ${name}`);
    process.exit(1);
  }

  // Get token from keychain
  const keychain = new MacOSKeychainProvider();
  const token = await keychain.get('mlld-env', name);
  if (!token) {
    console.error(`No credentials found for ${name}. Run: mlld env capture ${name}`);
    process.exit(1);
  }

  // Spawn with env vars
  const proc = spawn(command[0], command.slice(1), {
    env: {
      ...process.env,
      CLAUDE_CODE_OAUTH_TOKEN: token,
      CLAUDE_CONFIG_DIR: path.join(envDir, '.claude'),
    },
    stdio: 'inherit'
  });

  proc.on('exit', (code) => process.exit(code || 0));
}

async function findEnvModule(name: string): Promise<string | null> {
  const localPath = path.join(process.cwd(), '.mlld/env', name);
  const globalPath = path.join(os.homedir(), '.mlld/env', name);

  if (await exists(path.join(localPath, 'module.yml'))) return localPath;
  if (await exists(path.join(globalPath, 'module.yml'))) return globalPath;
  return null;
}
```

**Exit criteria:**
- [ ] Finds environment in local or global paths
- [ ] Retrieves token from keychain
- [ ] Injects `CLAUDE_CODE_OAUTH_TOKEN` and `CLAUDE_CONFIG_DIR`
- [ ] Spawns command with inherited stdio
- [ ] Propagates exit code

---

### Phase 6.4: `mlld env shell <name>` (mlld-9rot)

**Purpose:** Start interactive Claude session with environment

**Implementation:** Similar to spawn but calls `claude` without args

```typescript
async function shellEnvCommand(args: string[]): Promise<void> {
  const name = args[0];
  const envDir = await findEnvModule(name);
  // ... same as spawn but with:
  const proc = spawn('claude', [], { ... });
}
```

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `cli/commands/env.ts` | Main env command router - **ADD IMPLEMENTATIONS HERE** |
| `core/resolvers/builtin/KeychainResolver.ts` | Keychain resolver (import support) |
| `core/resolvers/builtin/keychain-macos.ts` | macOS keychain provider |
| `grammar/directives/import.peggy` | @keychain import syntax |
| `interpreter/eval/exec-invocation.ts` | Multi-arg handling |

## Test Commands

```bash
# Keychain is working:
npx mlld tmp/keychain-import-test.mld

# Run tests:
npm test

# Check AST:
npm run ast -- '/import { get } from @keychain'
```

## Important Notes for Next Session

1. **Keychain is fully working** - don't modify keychain code unless necessary
2. **Phase 6.0 (router) is done** - just need to implement the stub functions
3. **Follow the stub patterns** - capture/spawn/shell stubs show expected arg parsing
4. **MacOSKeychainProvider** - import from `@core/resolvers/builtin/keychain-macos`
5. **Test manually** - these commands interact with real keychain and filesystem

## Beads to Close

When implementing, close beads with:
```bash
bd close mlld-l6n4 --reason "mlld env capture implemented: <commit>"
bd close mlld-hmw5 --reason "mlld env spawn implemented: <commit>"
bd close mlld-9rot --reason "mlld env shell implemented: <commit>"
```
