# mlld Module Dependencies Specification

## Overview

All mlld modules must declare their runtime dependencies to ensure they can run correctly in different environments. This includes both the runtime languages they use (js, py, sh) and any specific packages/tools they require.

## Dependency Declaration

### Required: `needs` Field

Every module MUST have a `needs` field in its frontmatter. This field declares what runtime environments the module requires.

```yaml
---
name: my-module
author: myusername
description: My module description
mlld-version: ">=1.0.0-rc"
needs: []  # Pure mlld - no external runtimes needed
---
```

### Runtime Types

The `needs` field accepts the following values:

- `[]` - Pure mlld (no external runtime dependencies)
- `["js"]` - Requires JavaScript/Node.js
- `["py"]` - Requires Python
- `["sh"]` - Requires shell/bash
- `["js", "sh"]` - Multiple runtimes (any combination)

### Detailed Dependencies

When a runtime is declared in `needs`, you SHOULD provide additional details about specific requirements:

#### JavaScript Dependencies: `needs-js`

```yaml
needs: ["js"]
needs-js:
  node: ">=16.0.0"  # Optional: specific Node.js version
  packages:         # Optional: npm packages used
    - axios
    - lodash
```

#### Python Dependencies: `needs-py`

```yaml
needs: ["py"]
needs-py:
  python: ">=3.8"   # Optional: specific Python version
  packages:         # Optional: pip packages used
    - requests
    - pandas
```

#### Shell Dependencies: `needs-sh`

```yaml
needs: ["sh"]
needs-sh:
  shell: "bash"     # Optional: specific shell (bash, zsh, sh)
  commands:         # Optional: required commands
    - curl
    - jq
    - git
```

## Examples

### Pure mlld Module

```yaml
---
name: string-utils
author: mlld
description: String manipulation utilities
mlld-version: ">=1.0.0-rc"
needs: []  # No external dependencies
---

@text upper(text) = :::{{text}}:::  # Would need JS for actual uppercase
@text join(a, b) = :::{{a}}{{b}}:::
```

### JavaScript Module

```yaml
---
name: json-utils
author: mlld-dev
description: JSON parsing and manipulation
mlld-version: ">=1.0.0-rc"
needs: ["js"]
needs-js:
  node: ">=16.0.0"
---

@exec parseJSON(text) = @run js [(JSON.parse(text))]
@exec stringify(obj) = @run js [(JSON.stringify(obj, null, 2))]
```

### Multi-Runtime Module

```yaml
---
name: file-processor
author: myuser
description: Process files with multiple tools
mlld-version: ">=1.0.0-rc"
needs: ["js", "sh"]
needs-js:
  node: ">=18.0.0"
  packages:
    - glob
    - fs-extra
needs-sh:
  commands:
    - find
    - sed
    - awk
---

@exec findFiles(pattern) = run [(find . -name "@pattern")]
@exec processJSON(file) = @run js [(
  const fs = require('fs-extra');
  const data = fs.readJSONSync(file);
  // process data
  return data;
)]
```

## Auto-Detection Implementation

The publish command should automatically detect runtime usage if not explicitly declared:

### Detection Logic

1. **Parse the module AST**
2. **Walk all nodes looking for `@run` and `@exec` directives**
3. **Identify runtime from directive syntax**:
   - `run [(command)]` → `sh`
   - `@run js [(code)]` → `js`
   - `@run javascript [(code)]` → `js`
   - `@run py [(code)]` → `py`
   - `@run python [(code)]` → `py`
   - `@run bash [(command)]` → `sh`
   - `@run sh [(command)]` → `sh`

### Package Detection

For deeper dependency analysis:

#### JavaScript
- Look for `require('package')` or `require("package")`
- Look for `import ... from 'package'`
- Look for common global usage: `axios.`, `lodash.`, etc.

#### Python
- Look for `import package`
- Look for `from package import`
- Look for common usage patterns

#### Shell
- Look for command invocations at start of command
- Common patterns: `curl `, `git `, `jq `, etc.

## Registry Schema Updates

### Current Registry Entry

```json
{
  "name": "@author/module",
  "description": "Module description",
  "source": { ... },
  "mlldVersion": ">=1.0.0-rc"
}
```

### Updated Registry Entry

```json
{
  "name": "@author/module",
  "description": "Module description",
  "source": { ... },
  "mlldVersion": ">=1.0.0-rc",
  "needs": ["js", "sh"],
  "dependencies": {
    "js": {
      "node": ">=16.0.0",
      "packages": ["axios", "lodash"]
    },
    "sh": {
      "commands": ["curl", "jq"]
    }
  }
}
```

## Implementation Plan

### Phase 1: Schema & Validation (Immediate)

1. **Update ModuleMetadata interface** in `publish.ts`:
   ```typescript
   export interface ModuleMetadata {
     // ... existing fields
     needs: string[];  // Required
     needsJs?: {
       node?: string;
       packages?: string[];
     };
     needsPy?: {
       python?: string;
       packages?: string[];
     };
     needsSh?: {
       shell?: string;
       commands?: string[];
     };
   }
   ```

2. **Add validation** in `readModule()`:
   - Require `needs` field (error if missing)
   - Validate `needs` values are in allowed set
   - Validate detailed dependencies match declared needs

3. **Update registry validation** in `registry-utils.mld`:
   - Add `needs` to required fields
   - Validate consistency

### Phase 2: Auto-Detection (Week 1)

1. **Create detection utilities**:
   ```typescript
   function detectRuntimeNeeds(ast: MlldNode[]): string[] {
     const needs = new Set<string>();
     
     walkAST(ast, (node) => {
       if (node.type === 'Directive' && node.kind === 'run') {
         const language = detectLanguage(node);
         if (language) needs.add(language);
       }
     });
     
     return Array.from(needs).sort();
   }
   ```

2. **Implement package detection**:
   ```typescript
   function detectJsPackages(ast: MlldNode[]): string[] {
     const packages = new Set<string>();
     
     walkAST(ast, (node) => {
       if (isJavaScriptCode(node)) {
         const code = extractCode(node);
         // Regex for require/import
         const matches = [
           ...code.matchAll(/require\(['"]([^'"]+)['"]\)/g),
           ...code.matchAll(/import .+ from ['"]([^'"]+)['"]/g)
         ];
         
         for (const match of matches) {
           const pkg = match[1];
           // Filter out built-ins and relative paths
           if (!pkg.startsWith('.') && !isBuiltinModule(pkg)) {
             packages.add(pkg);
           }
         }
       }
     });
     
     return Array.from(packages).sort();
   }
   ```

3. **Integration in publish flow**:
   - Run detection after parsing
   - Show detected dependencies to user
   - Prompt for confirmation/editing
   - Auto-populate if missing

### Phase 3: CLI Install Integration (Week 2)

1. **Check dependencies on install**:
   ```bash
   $ mlld install @user/module
   
   ⚠️  This module requires:
      - Node.js >=16.0.0 (you have: 14.0.0)
      - Python >=3.8 (not found)
      - Commands: curl, jq
   
   Some dependencies are missing. Install anyway? (y/N)
   ```

2. **Add `--check-deps` flag**:
   ```bash
   $ mlld install @user/module --check-deps
   ```

3. **Environment detection utilities**:
   - Check Node.js version
   - Check Python version  
   - Check shell commands availability

### Phase 4: Documentation & Migration (Week 3)

1. **Update all existing modules** with `needs` field
2. **Document in module publishing guide**
3. **Add to LLM review criteria**
4. **Create migration script** for existing modules

## Benefits

1. **Transparency**: Users know what's required before installing
2. **Reliability**: Modules fail fast if dependencies missing
3. **Portability**: Clear about environment requirements
4. **Security**: Can audit what modules use
5. **Discovery**: Can search by pure-mlld vs runtime-dependent

## Future Enhancements

1. **Dependency resolution**: Auto-install npm/pip packages
2. **Virtual environments**: Isolate module dependencies
3. **Compatibility matrix**: Test across runtime versions
4. **Pure mlld alternatives**: Suggest pure alternatives when available
5. **Web compatibility**: Flag modules that work in browser