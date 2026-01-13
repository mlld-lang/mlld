# mlld Modules

## tldr

Modules let you package and reuse mlld code. Create modules with `export`, import with `import`, and publish to the registry with `mlld publish`. Modules capture their environment so executables work anywhere.

## Creating Modules

### Basic Module Structure

```mlld
---
name: greetings
author: alice
version: 1.0.0
about: Simple greeting utilities
license: CC0
---

/needs {}

exe @sayHello(name) = `Hello, @name!`
exe @sayGoodbye(name) = `Goodbye, @name!`

export { @sayHello, @sayGoodbye }
```

Save as `greetings.mld` and it's ready to import.

### Export Control

`export` declares what others can import:

```mlld
exe @publicHelper(x) = `Value: @x`
exe @_internalHelper(x) = run {echo "@x" | tr a-z A-Z}

export { @publicHelper }
```

Only `@publicHelper` is accessible to importers. Without `export`, all variables are exported (legacy behavior).

### Module Dependencies

Declare what your module needs with `needs`:

```mlld
/needs {
  js: [lodash],
  sh: true,
  cmd: [git, curl]
}
```

`js`/`node`/`py` entries declare runtime packages. `sh` requests shell access; `cmd` lists required commands.

### Module Structure

Modules are directories with an entry point, manifest, and optional supporting files:

```
myapp/
├── index.mld          # Entry point
├── module.yml         # Manifest
├── README.md          # Documentation
└── lib/               # Supporting files
    └── helpers.mld
```

**module.yml format:**
```yaml
name: myapp
author: alice
type: app               # library | app | command | skill
about: "Description"
version: 1.0.0
license: CC0
entry: index.mld        # Optional, defaults to index.mld
```

**Module types and their install locations:**

| Type | Local | Global |
|------|-------|--------|
| `library` | `llm/lib/` | `~/.mlld/lib/` |
| `app` | `llm/run/` | `~/.mlld/run/` |
| `command` | `.claude/commands/` | `~/.claude/commands/` |
| `skill` | `.claude/skills/` | `~/.claude/skills/` |

**Create directory modules:**
```bash
mlld module app myapp              # → llm/run/myapp/
mlld module library utils          # → llm/lib/utils/
mlld module command review         # → .claude/commands/review/
mlld module skill helper           # → .claude/skills/helper/
mlld module app myapp --global     # → ~/.mlld/run/myapp/
```

**Run directory apps:**
```bash
mlld run myapp                     # Runs llm/run/myapp/index.mld
```

## Importing Modules

### Registry Modules

```mlld
import { @helper } from @alice/utils
show @helper("data")
```

Install first:
```bash
mlld install @alice/utils
```

### Local Files

```mlld
import { @config } from <./config.mld>
show @config.apiKey
```

### URL Imports

```mlld
import cached(1h) <https://example.com/utils.mld> as @remote
show @remote.version
```

### Import Types

Control when and how imports resolve:

```mlld
>> Registry module (offline after install)
import module { @api } from @company/tools

>> Embedded at parse time
import static <./prompts/system.md> as @systemPrompt

>> Always fetch fresh
import live <https://api.status.io> as @status

>> Cached with TTL
import cached(30m) <https://feed.xml> as @feed

>> Local development (llm/modules/)
import local { @helper } from @alice/dev-module
```

### Import Patterns

**Selected imports**:
```mlld
import { @helper, @validator } from @alice/utils
```

**Namespace imports**:
```mlld
import @alice/utils as @utils
show @utils.helper("data")
```

**Avoid collisions**:
```mlld
import { @helper } from @alice/utils
import @bob/tools as @bob  >> Use namespace for second import
show @helper("x")
show @bob.helper("y")
```

## Module Environment

Modules capture their defining environment. Executables reference their original variables:

```mlld
>> In utils.mld
var @prefix = "Result: "
exe @format(x) = `@prefix @x`
export { @format }
```

When imported:
```mlld
import { @format } from <./utils.mld>
show @format("success")  >> → "Result: success"
```

`@prefix` resolves from the module, not your script.

## Development Workflow

### Local Development

1. Create module in `llm/modules/`:
```bash
mkdir -p llm/modules/@alice
# Create llm/modules/@alice/my-tool.mld
```

2. Use local import:
```mlld
import local { @tool } from @alice/my-tool
```

3. Test and iterate without registry publishing

### Quick Start

Generate module template:
```bash
mlld init @alice/my-tool
```

This creates a complete module structure with frontmatter and examples.

### Testing Modules

Create test scripts in your project:

```mlld
>> test-module.mld
import { @helper } from <./my-module.mld>
var @result = @helper("test")
when @result == "expected" => show "✓ Pass"
when @result != "expected" => show "✗ Fail"
```

Run tests:
```bash
mlld test-module.mld
```

## Configuration

### Project Config (mlld-config.json)

```json
{
  "dependencies": {
    "@alice/utils": "1.0.0",
    "@company/auth": "latest"
  },
  "dev": {
    "localModulesPath": "llm/modules",
    "enabled": true
  }
}
```

Create config:
```bash
mlld setup
```

### Lock File (mlld-lock.json)

Auto-generated when you install modules. Ensures reproducible imports:

```json
{
  "lockfileVersion": 1,
  "modules": {
    "@alice/utils": {
      "version": "1.0.0",
      "resolved": "abc123def456...",
      "source": "@alice/utils",
      "sourceUrl": "https://registry.mlld.org/modules/@alice/utils/1.0.0",
      "integrity": "sha256:abc123...",
      "fetchedAt": "2024-01-15T10:00:00Z",
      "registryVersion": "1.0.0"
    }
  }
}
```

Never edit manually. Use `mlld install`, `mlld update`, or `mlld outdated`.

## Commands

### Install Dependencies
```bash
mlld install                    # Install from mlld-config.json
mlld install @alice/utils       # Install specific module
mlld install @alice/utils@1.2.0 # Install specific version
```

### Update Modules
```bash
mlld update                     # Update all modules
mlld update @alice/utils        # Update specific module
mlld outdated                   # Check for newer versions
```

### Publishing
```bash
mlld publish my-module.mld      # Publish to registry
mlld publish --pr               # Force PR workflow
```

See [registry.md](registry.md) for publishing details.

## Version Resolution

Use semantic versioning with `@` suffix:

| Import | Version |
|--------|---------|
| `import ... from @alice/utils` | latest |
| `import ... from @alice/utils@1.0.0` | exact |
| `import ... from @alice/utils@^1.0.0` | compatible |
| `import ... from @alice/utils@beta` | tag |

Lock file pins exact versions for reproducibility.

## Best Practices

**Use explicit exports**:
```mlld
export { @publicAPI, @helper }
```

**Prefix internals** (convention):
```mlld
exe @_internal(name) = "opaque"  >> Not in export list
```

**Document exports**:
```mlld
>> Public API for data transformation
exe @transform(data) = `Processed: @data`
export { @transform }
```

**Test before publishing**:
```bash
mlld my-module.mld  # Run as script first
```

**Use local imports for development**:
```mlld
import local { @tool } from @me/dev-module
```

## Common Patterns

### Config Module
```mlld
---
name: config
about: App configuration
---

var @apiUrl = "https://api.example.com"
var @timeout = 30000
export { @apiUrl, @timeout }
```

### Utility Collection
```mlld
---
name: text-utils
about: String manipulation utilities
---

exe @uppercase(text) = run {echo "@text" | tr a-z A-Z}
exe @trim(text) = js { return @text.trim() }
export { @uppercase, @trim }
```

### Template Library
```mlld
---
name: prompts
about: Reusable prompts
---

exe @systemPrompt(role) = `You are a @role assistant.`
exe @userPrompt(task) = `Please help me with: @task`
export { @systemPrompt, @userPrompt }
```

## Dynamic Modules (SDK)

Runtime module injection without filesystem I/O. Enables multi-tenant applications to inject per-user/project context from database.

### String Modules

Inject mlld source as strings:

```typescript
const output = await processMlld(template, {
  dynamicModules: {
    '@user/context': `/export { @userId, @userName }\n/var @userId = "123"\n/var @userName = "Ada"`
  }
});
```

### Object Modules

Inject structured data directly (recommended):

```typescript
const output = await processMlld(template, {
  dynamicModules: {
    '@state': {
      count: 0,
      messages: ['Hello', 'World'],
      preferences: { theme: 'dark' }
    },
    '@payload': {
      text: userInput,
      userId: session.userId
    }
  }
});
```

Access in your script:

```mlld
var @count = @state.count + 1
var @theme = @state.preferences.theme
var @input = @payload.text
```

### Security

Dynamic modules are automatically labeled `src:dynamic` for guard enforcement:

```mlld
guard before secret = when [
  @input.mx.taint.includes('src:dynamic') =>
    deny "Cannot use dynamic data as secrets"
  * => allow
]
```

### Priority

Dynamic modules override filesystem and registry modules with the same path (highest priority).

**Use cases**: Multi-tenant SaaS, per-request context injection, testing with mock data.

**Not for CLI**: CLI users should use filesystem modules. Dynamic modules are SDK-only.

## Troubleshooting

**Import not found**:
```bash
mlld install @alice/utils  # Install first
```

**Version mismatch**:
```bash
mlld update @alice/utils   # Update to latest
# Or edit mlld-config.json and run mlld install
```

**Export not found**:
Check `export` directive includes the variable name.

**Collision error**:
Use namespace imports:
```mlld
import @alice/utils as @alice
import @bob/utils as @bob
```

**Module not updating**:
Local imports read from disk every time. Registry modules are cached - use `mlld update` to refresh.
