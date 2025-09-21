Based on my examination of the existing documentation and test cases, I'll now create the new modules.md document that consolidates the module system information into a comprehensive, example-first guide.

# Modules

## tldr

Install modules with `mlld install @author/module`, import them with `/import { function } from @author/module`, and use the functions directly in your mlld scripts.

```bash
mlld install @community/string-utils
```

```mlld
/import { slugify, truncate } from @community/string-utils

/var @title = "My Blog Post Title!"
/var @slug = @slugify(@title)
/show @slug
```

Output: `my-blog-post-title`

## Installing Modules

Install from the public registry:

```bash
mlld install @alice/utils
mlld install @alice/utils @bob/helpers    # Multiple modules
mlld install                              # Install from lock file
```

List installed modules:

```bash
mlld ls
mlld ls --format table --verbose
```

Get module information:

```bash
mlld info @alice/utils
```

## Using Modules

Import functions and variables from installed modules. Modules should spell out their public API with `/export { ... }`; the runtime still auto-exports files that lack manifests, but new modules should always declare their manifest.

```mlld
/import { formatDate, capitalize } from @alice/utils

/var @greeting = @capitalize("world")
/var @today = @formatDate(@now)
/show `Hello @greeting! Today is @today`
```

### Import Patterns

**Selective imports:**
```mlld
/import { func1, func2 } from @author/module
```

**Import with aliases:**
```mlld
/import { longFunctionName as short, data } from @author/module
```

**Namespace imports:**
```mlld
/import { * as utils } from @author/module
/var @result = @utils.formatDate(@now)
```

**File imports (quotes required):**
```mlld
/import { helper } from "./local-file.mld"
/import { config } from "../shared/config.mld"
```

## Creating Modules

Create a new module file:

```bash
mlld init utils.mld.md
```

This creates an executable documentation file (`.mld.md`) that works both as GitHub markdown and mlld code:

```mlld
---
name: utils
author: alice
about: Utility functions
version: 1.0.0
license: CC0
---

/export { formatDate, capitalize, module }
/exe @formatDate(dateStr) = js {
  return new Date(@dateStr).toISOString().split('T')[0];
}

/exe @capitalize(text) = js {
  return @text.charAt(0).toUpperCase() + @text.slice(1).toLowerCase();
}

/var @module = {
  formatDate: @formatDate,
  capitalize: @capitalize
}
```

### Executable Documentation Format

The `.mld.md` format enables **executable documentation** - files that render beautifully on GitHub while functioning as mlld modules:

````markdown
# @alice/utils

Utility functions for text formatting and dates.

## tldr

```mlld-run
/import { formatDate, capitalize } from @alice/utils
/var @today = @formatDate(@now)
/show `Today is @today`
```

## export

```mlld-run
/export { formatDate, module }
/exe @formatDate(dateStr) = js {
  return new Date(@dateStr).toISOString().split('T')[0];
}

/var @module = { formatDate: @formatDate }
```

## interface

### `formatDate(dateStr)`

Formats a date to YYYY-MM-DD format.

```mlld
/var @date = @formatDate("2024-01-15T10:30:00Z")
/show @date
```

Output: `2024-01-15`
````

**Key distinction:**
- `mlld-run` blocks execute when processed by mlld
- `mlld` blocks are documentation-only (syntax highlighting on GitHub)

### Module Export Patterns

**Explicit exports (recommended):**
```mlld
/export { get, post }
/exe @get(url) = run {curl -s "@url"}
/exe @post(url, data) = run {curl -X POST -d "@data" "@url"}

/var @module = {
  get: @get,
  post: @post
}
```

**Named export objects:**
```mlld
/export { auth, login, logout }
/exe @login(user, pass) = run {...}
/exe @logout(token) = run {...}

/var @auth = {
  login: @login,
  logout: @logout
}

// Both @auth and individual functions are exported
```

**Auto-export fallback (for files without `/export`):**
```mlld
// Without explicit @module, all top-level variables are exported
/var @hello = "world"
/exe @greet(name) = `Hello @name!`
// Automatically creates: { hello: @hello, greet: @greet } (for files that have not declared an export manifest yet)
```

## Publishing Modules

Analyze dependencies and publish:

```bash
mlld add-needs utils.mld.md    # Auto-detect dependencies
mlld publish utils.mld.md      # Publish to registry
```

The publish command handles everything automatically:
1. Validates module syntax and metadata  
2. Auto-adds required fields (mlld-version, license)
3. Commits changes and pushes to git
4. Creates pull request to the mlld registry

### Private Modules

Publish to private repositories:

```bash
mlld publish my-module.mld.md --private
mlld publish my-module.mld.md --private --path lib/modules
```

Use private modules via file paths:

```mlld
/import { utils } from "./lib/modules/utils.mld.md"
/import { shared } from "../team-repo/modules/common.mld.md"
```

## Custom Resolvers

Set up path aliases and private module sources:

```bash
mlld setup                    # Interactive setup
mlld alias --name shared --path ../shared-modules
mlld setup --github           # Private GitHub modules
```

### Path Resolvers

Create shortcuts to local directories:

```json
{
  "config": {
    "resolvers": {
      "prefixes": [
        {
          "prefix": "@lib/",
          "resolver": "LOCAL", 
          "config": { "basePath": "./src/lib" }
        }
      ]
    }
  }
}
```

Usage:
```mlld
/import { stringUtils } from @lib/string-utils
/import { validators } from @lib/validation
```

### GitHub Resolvers

Access private GitHub repositories:

```json
{
  "config": {
    "resolvers": {
      "prefixes": [
        {
          "prefix": "@company/",
          "resolver": "GITHUB",
          "config": {
            "repository": "company/private-modules",
            "branch": "main",
            "basePath": "modules"
          }
        }
      ]
    }
  }
}
```

Requires authentication:
```bash
mlld auth login
```

Usage:
```mlld
/import { httpClient } from @company/web-utils
/import { validation } from @company/common
```

## Shadow Environments

Define reusable functions that JavaScript and Node.js code blocks can call:

```mlld
/exe @add(a, b) = js { return @a + @b }
/exe @multiply(x, y) = js { return @x * @y }

// Create JavaScript shadow environment  
/exe js = { add, multiply }

// Use shadow functions in JavaScript
/var @result = run js {
  const sum = add(5, 3);        // 8
  const product = multiply(4, 7); // 28
  return { sum, product };
}
```

**Node.js shadow environment (full API access):**
```mlld
/exe @readFile(path) = node {
  const fs = require('fs');
  return fs.readFileSync(@path, 'utf8');
}

/exe @fetchData(url) = node {
  const https = require('https');
  return new Promise((resolve, reject) => {
    https.get(@url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
  });
}

/exe node = { readFile, fetchData }

/var @config = run node {
  const content = await readFile('./config.json');
  const data = await fetchData(config.apiUrl);
  return { ...JSON.parse(content), data };
}
```

### When to Use Each Environment

- **JavaScript shadow**: Simple calculations, no Node.js APIs needed, speed critical
- **Node.js shadow**: File system, network, async operations, better isolation

## Module System Architecture  

### Registry Discovery

Modules use DNS TXT records for discovery:

1. Module reference: `@username/module` 
2. DNS lookup: `_mlld.username.public.mlld.ai`
3. Content fetch: Downloads from GitHub gist
4. Local cache: Stores with SHA-256 hash verification
5. Lock file: Records exact versions in `mlld.lock.json`

### Lock File Format

```json
{
  "version": "1.0",
  "modules": {
    "mlld://alice/utils": {
      "resolved": "https://gist.githubusercontent.com/alice/abc123/raw/...",
      "gistRevision": "abc123def456", 
      "integrity": "sha256:...",
      "approvedAt": "2024-01-15T10:30:00Z"
    }
  }
}
```

### Path Resolution in Modules

Relative paths in modules resolve relative to the module file itself:

```mlld
// In file: /home/user/modules/string-utils.mld
/import { helpers } from "./lib/helpers.mld"  
// → Resolves to: /home/user/modules/lib/helpers.mld

// Even when running from different directory:
// cd /tmp && mlld /home/user/modules/string-utils.mld
// Still resolves to: /home/user/modules/lib/helpers.mld
```

This ensures modules are portable and self-contained.

## Runtime Dependencies

Declare runtime requirements in module frontmatter:

```yaml
---
name: file-utils
needs: ["node", "sh"]
needs-node:
  node: ">=18.0.0"
  packages: ["glob", "fs-extra"]
needs-sh:
  commands: ["find", "grep"]
---
```

Auto-detect dependencies:
```bash
mlld add-needs my-module.mld.md --verbose
```

**Available runtimes:**
- `"js"` - Browser-compatible JavaScript
- `"node"` - Node.js with full API access  
- `"py"` - Python execution
- `"sh"` - Shell commands

## Best Practices

### For Module Users
- Always commit `mlld.lock.json` to version control
- Run `mlld registry audit` regularly for security
- Test modules before production use
- Keep resolver configuration in version control

### For Module Authors
- Use semantic versioning
- Include clear usage examples in documentation
- Never include secrets or credentials
- Test modules with different inputs
- Use the `.mld.md` format for better GitHub integration

### Module Development Workflow

```bash
# 1. Create module
mlld init my-utils.mld.md

# 2. Develop and test
# ... edit my-utils.mld.md ...
mlld my-utils.mld.md

# 3. Analyze dependencies  
mlld add-needs my-utils.mld.md

# 4. Test before publishing
mlld publish --dry-run my-utils.mld.md

# 5. Publish
mlld publish my-utils.mld.md

# 6. Use in other projects
mlld install @alice/my-utils
```

## Security

### Content Integrity
- All modules verified with SHA-256 hashes
- Only verified content cached and executed
- Lock file ensures reproducible builds

### Trust Model
- Manual approval required for new modules
- Exact versions recorded and verified
- Advisory system for known security issues
- Run `mlld registry audit` to check for issues

### Advisory System
```bash
mlld registry audit    # Check for security advisories
mlld info @alice/utils # Shows any security warnings
```

## Troubleshooting

**Module not found:**
```bash
mlld install @alice/typo
# Error: Module not found: @alice/typo
# Did you mean: @alice/utils, @alice/helpers?
```

**Cache issues:**
```bash
mlld install @alice/utils --force    # Force reinstall
mlld ls --missing                    # Show missing modules
```

**Resolver configuration:**
```bash
# Ensure you're in project root with mlld.lock.json
# mlld searches parent directories like npm
```

**GitHub authentication:**
```bash
mlld auth login    # Required for private GitHub modules
mlld auth status   # Check authentication
```
