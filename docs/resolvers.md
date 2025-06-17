# mlld Resolvers

Resolvers are mlld's system for handling @ references like `@TIME`, `@INPUT`, `@company/module`, and `@./path`. They provide a unified, extensible way to access external data, modules, and computed values.

## Built-in Resolvers

mlld includes several built-in resolvers that use UPPERCASE naming:

### @TIME - Dynamic Timestamps

Import formatted timestamps in any format:

```mlld
@import { "YYYY-MM-DD" as date, "HH:mm:ss" as time } from @TIME
@import { iso, unix } from @TIME

Today is @add @date at @add @time
ISO format: @add @iso
```

**Common format patterns:**
- `"YYYY-MM-DD"` → 2024-12-06
- `"HH:mm:ss"` → 14:30:15  
- `"iso"` → 2024-12-06T14:30:15.000Z
- `"unix"` → 1733493015

### @INPUT - Stdin and Environment Data

Access data from stdin or environment variables:

```mlld
@import { config, data } from @INPUT
@import { PATH, HOME } from @INPUT

Config: @add @config
Current PATH: @add @PATH
```

**How @INPUT works:**
- If stdin contains JSON, imports fields as variables
- Environment variables are also available
- Non-JSON stdin available as `content` field

### @DEBUG - Environment Information

Access debugging information about your mlld environment:

```mlld
@import { environment } from @DEBUG
@add @environment
```

**Includes:**
- Current variables and their values
- Import history
- File paths and project structure
- Performance statistics

### @PROJECTPATH / @. - Project Files

Access files relative to your project root:

```mlld
@import { readme } from [@./README.md]
@add [@PROJECTPATH/docs/api.md]
@path config = @./config/settings.json
```

**Project root detection:**
1. Directory with `mlld.config.json` (highest priority)
2. Directory with `package.json`  
3. Git repository root (`.git` directory)
4. Directory with `pyproject.toml`, `Cargo.toml`, etc.

## Content Types

Resolvers return different types of content based on what they're resolving:

### Module Content
mlld files with exportable variables and templates:
```mlld
# utils.mld - module content
@text greeting = "Hello"
@exec formatName(name) = @run [echo "Name: {{name}}"]
@data config = { "version": "1.0.0" }
```

When imported: `@import { greeting, formatName } from @company/utils`

### Data Content  
Structured data (JSON objects, arrays):
```json
// When @TIME returns data in import context
{
  "YYYY-MM-DD": "2024-01-15",
  "HH:mm:ss": "10:30:45"
}
```

### Text Content
Plain text strings:
```text
// When @PROJECTPATH returns the path as text
/Users/adam/dev/my-project

// When reading a markdown file
Content of README.md file...
```

## Usage Patterns

### Import Context

Use resolvers in imports to bring data into your mlld environment:

```mlld
# Function resolvers - compute data
@import { "MM/DD/YYYY" as usDate } from @TIME
@import { version } from @DEBUG

# Module resolvers - load modules  
@import { httpUtils } from @company/web-toolkit
@import { validation } from @acme/common

# Path resolvers - load file content
@import { apiDocs } from [@./docs/api.md]
```

### Path Context

Use path resolvers in file paths (only supported by path-type resolvers):

```mlld
@add [@./README.md]                    # ✅ PROJECTPATH supports paths
@path docs = @PROJECTPATH/documentation # ✅ PROJECTPATH supports paths  

@add [@TIME/something]                 # ❌ TIME doesn't support paths
@path config = @INPUT/file.json        # ❌ INPUT doesn't support paths
```

### Variable Context

When used as a bare variable, resolvers return their default value:

```mlld
@add @TIME          # → "2024-01-15T10:30:00Z" (current ISO timestamp)
@add @PROJECTPATH   # → "/Users/adam/dev/my-project" (project root path)

@text now = @TIME   # Store current time in variable
@text root = @PROJECTPATH  # Store project path in variable
```

### Context-Dependent Behavior

The same resolver can behave differently based on how it's used:

```mlld
# @PROJECTPATH as variable - returns the path
@text projectRoot = @PROJECTPATH
@add [[Project is at: {{projectRoot}}]]
# Output: Project is at: /Users/adam/dev/my-project

# @PROJECTPATH in path context - reads file content  
@add [@PROJECTPATH/README.md]
# Output: (contents of README.md)

# @TIME as variable - returns ISO timestamp
@text currentTime = @TIME  
# currentTime = "2024-01-15T10:30:00Z"

# @TIME in import context - returns structured data
@import { "YYYY-MM-DD" as date } from @TIME
# date = "2024-01-15"
```

## Resolver Priority

Resolvers are checked in strict priority order:

1. **Built-in resolvers** (TIME, DEBUG, INPUT, PROJECTPATH)
2. **Custom resolvers** (by configured priority)  
3. **Variable lookup** (fallback)

Higher priority always wins - you cannot override built-in resolvers.

## Custom Resolvers

You can create custom resolvers for organization-specific needs.

### Quick Setup

The easiest way to configure resolvers is using mlld's interactive commands:

```bash
# Complete setup wizard
mlld setup

# Set up GitHub private modules
mlld setup --github

# Set up local directory aliases
mlld setup --local

# Create specific aliases
mlld alias --name lib --path ./src/lib
mlld alias --name shared --path ../shared-modules --global
```

### Manual Configuration

You can also add custom resolvers manually to `mlld.lock.json`:

```json
{
  "resolvers": {
    "@docs": {
      "command": "mlld-path-resolver",
      "args": ["--base-path", "./documentation"],
      "priority": 100,
      "capabilities": {
        "io": { "read": true, "write": false, "list": true },
        "contexts": { "import": true, "path": true, "output": false },
        "supportedContentTypes": ["module", "data", "text"],
        "defaultContentType": "text"
      }
    },
    "@company": {
      "command": "node",
      "args": ["./resolvers/company-modules.js"],
      "priority": 200,
      "env": {
        "API_TOKEN": "${COMPANY_API_TOKEN}"
      },
      "capabilities": {
        "io": { "read": true, "write": false, "list": false },
        "contexts": { "import": true, "path": false, "output": false },
        "supportedContentTypes": ["module"],
        "defaultContentType": "module"
      }
    }
  }
}
```

### Understanding Resolver Capabilities

When creating custom resolvers, you need to declare their capabilities:

```json
{
  "@docs": {
    "command": "mlld-path-resolver",
    "args": ["--base-path", "./documentation"],
    "priority": 100,
    "capabilities": {
      "io": { "read": true, "write": false, "list": true },
      "contexts": { "import": true, "path": true, "output": false },
      "supportedContentTypes": ["module", "text"],
      "defaultContentType": "text"
    }
  }
}
```

**Capability Fields:**
- `io`: What operations the resolver supports (read/write/list)
- `contexts`: Where it can be used (import/path/output)
- `supportedContentTypes`: What content types it can return
- `defaultContentType`: What it returns when used as a bare variable

### Fuzzy Path Matching

Local path resolvers support smart fuzzy matching by default, making it easier to reference files without worrying about exact capitalization or spacing:

#### Case-Insensitive Matching
```mlld
# All of these reference the same file: ~/Desktop/My Projects/Todo List.md
@import { tasks } from @desktop/my-projects/todo-list
@import { tasks } from @desktop/MY-PROJECTS/TODO-LIST
@import { tasks } from @desktop/My-Projects/Todo-List
```

#### Whitespace Normalization
Spaces, dashes, and underscores are treated as interchangeable:
```mlld
# File: ~/Desktop/My Important File.md
@add @desktop/my-important-file     # spaces → dashes
@add @desktop/my_important_file     # spaces → underscores
@add @desktop/My-Important-File     # original spacing preserved
```

#### Ambiguity Resolution
When multiple files match, mlld shows all possibilities:
```
Error: Ambiguous path 'test-file' matches multiple files:
  - test-file.md (exact match)
  - test_file.md (whitespace match)
  - TEST_FILE.md (fuzzy match)

Please use a more specific path.
```

#### Configuration
Control fuzzy matching behavior in your resolver config:
```json
{
  "@desktop": {
    "prefix": "@desktop/",
    "resolver": "LOCAL",
    "type": "input",
    "config": {
      "basePath": "~/Desktop",
      "fuzzyMatch": {
        "enabled": true,         // default: true
        "caseInsensitive": true, // default: true
        "normalizeWhitespace": true // default: true
      }
    }
  }
}
```

Or disable entirely:
```json
{
  "fuzzyMatch": false  // Exact matches only
}
```

### Resolver Types

#### Path Resolvers
Map @ prefixes to filesystem locations:

**Usage:**
```mlld
@add [@docs/getting-started.md]
@import { tutorial } from [@docs/tutorials/basic.md]
```

#### Module Resolvers  
Access private module registries or repositories. For GitHub repositories, authenticate first with `mlld auth login`:

```json
{
  "@company": {
    "command": "node",
    "args": ["./resolvers/company-registry.js"],
    "priority": 200,
    "env": { "API_TOKEN": "${COMPANY_API_TOKEN}" },
    "capabilities": {
      "io": { "read": true, "write": false, "list": false },
      "contexts": { "import": true, "path": false, "output": false },
      "supportedContentTypes": ["module"],
      "defaultContentType": "module"
    }
  }
}
```

**Usage:**
```mlld
@import { httpClient } from @company/web-utils
@import { validation } from @company/common
```

#### Function Resolvers
Compute data dynamically:

```json
{
  "@weather": {
    "command": "python",
    "args": ["./resolvers/weather.py"],
    "priority": 150,
    "env": { "API_KEY": "${WEATHER_API_KEY}" },
    "capabilities": {
      "io": { "read": true, "write": false, "list": false },
      "contexts": { "import": true, "path": false, "output": false },
      "supportedContentTypes": ["data"],
      "defaultContentType": "data"
    }
  }
}
```

**Usage:**
```mlld
@import { "San Francisco" as sfWeather } from @weather
@import { current, forecast } from @weather
```

### Creating a Custom Resolver

Custom resolvers are programs that follow the Model Context Protocol (MCP). Here's a simple example:

```javascript
// company-resolver.js
class CompanyResolver {
  // Declare resolver capabilities
  getCapabilities() {
    return {
      io: { read: true, write: false, list: false },
      contexts: { import: true, path: false, output: false },
      supportedContentTypes: ['module'],
      defaultContentType: 'module',
      priority: 200
    };
  }
  
  async listTools() {
    return [
      {
        name: "resolve",
        description: "Resolve a company module or variable reference",
        inputSchema: {
          type: "object", 
          properties: {
            reference: { type: "string" },
            context: { type: "string", enum: ["import", "variable"] },
            requestedImports: { type: "array", items: { type: "string" } }
          }
        }
      }
    ];
  }
  
  async callTool(name, args) {
    if (name === "resolve") {
      // Handle different contexts
      if (args.context === "variable") {
        // Return module listing for bare @company reference
        return {
          content: "Company module registry",
          contentType: "text"
        };
      }
      
      // Import context - fetch and parse module
      const moduleData = await this.fetchFromRegistry(args.reference);
      
      // mlld modules should return their exports
      const exports = {};
      if (args.requestedImports?.length) {
        // Specific imports requested
        for (const importName of args.requestedImports) {
          if (!(importName in moduleData)) {
            throw new Error(`Export '${importName}' not found in ${args.reference}`);
          }
          exports[importName] = moduleData[importName];
        }
      } else {
        // Import all
        Object.assign(exports, moduleData);
      }
      
      return {
        content: JSON.stringify(exports),
        contentType: "module"
      };
    }
  }
  
  async fetchFromRegistry(moduleRef) {
    // Implementation specific to your organization
    const apiToken = process.env.API_TOKEN;
    const response = await fetch(`https://modules.company.com/api/${moduleRef}`, {
      headers: { 'Authorization': `Bearer ${apiToken}` }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch ${moduleRef}: ${response.status}`);
    }
    
    // Parse the mlld content and extract exports
    const mlldContent = await response.text();
    // In real implementation, parse mlld and extract module exports
    return this.parseMlldModule(mlldContent);
  }
}

// Start MCP server
const server = new CompanyResolver();
server.start();
```

## Name Protection

Resolver names are protected to prevent conflicts:

```mlld
@text TIME = "my time"  # ❌ ERROR: 'TIME' reserved for resolver
@text time = "my time"  # ✅ OK - only ALL CAPS names are reserved
@text timestamp = "my time"  # ✅ OK

@import { "format" as time } from @TIME     # ✅ OK - lowercase aliases allowed
@import { "format" as TIME } from @TIME     # ❌ ERROR: 'TIME' reserved
```

**Rules:**
- Built-in resolver names (TIME, DEBUG, INPUT, PROJECTPATH) are always reserved
- Custom resolver names become reserved when registered  
- Only ALL CAPS variants are protected for global resolvers
- Variable names and import aliases cannot use reserved names

## Error Handling

Resolver errors clearly identify the source:

```
TimeResolver failed: Invalid format string 'XYZ'
Available formats: YYYY-MM-DD, HH:mm:ss, iso, unix

CompanyResolver failed: Authentication token expired
Check your COMPANY_API_TOKEN environment variable

ProjectPathResolver failed: Path outside project directory: ../../../etc/passwd
Paths must be within the project root
```

## Advanced Features

### TTL and Caching

Custom resolvers can specify caching behavior using mlld's TTL format:

```json
{
  "@weather": {
    "type": "function",
    "command": "python", 
    "args": ["./weather.py"],
    "ttl": "15m"
  }
}
```

**TTL Format Options:**
- `"static"` - Cache indefinitely  
- `"live"` - Always refresh (no caching)
- `"7200"` - 7200 seconds
- `"1h"` - 1 hour
- `"30m"` - 30 minutes  
- `"7d"` - 7 days
- `"2w"` - 2 weeks

Function resolvers like @DEBUG use TTL caching to avoid expensive recomputations.

### Multiple Import Patterns

Some resolvers support multiple import patterns:

```mlld
# TIME resolver examples
@import { iso } from @TIME                    # Common format names
@import { "YYYY-MM-DD" as date } from @TIME   # Custom format strings
@import { "HH:mm" as time } from @TIME        # Multiple custom formats

# Path resolver examples  
@import { readme } from [@docs/README.md]     # Single file
@import { api, tutorial } from [@docs/]       # Multiple files (if supported)
```

## Best Practices

### Resolver Naming
- Use descriptive names: `@docs`, `@company`, `@weather`
- Follow your organization's naming conventions
- Avoid generic names like `@api`, `@data` that could conflict

### Security
- Use environment variables for sensitive data (API tokens, credentials)  
- Validate all inputs in custom resolvers
- Custom resolvers run with the same permissions as mlld - they are not sandboxed
- Only install custom resolvers from sources you trust
- Custom resolvers have full access to filesystem and network

### Performance  
- Use TTL caching for expensive operations
- Implement lazy loading where possible
- Consider batch operations for multiple imports

### Error Messages
- Provide helpful error messages with context
- Include suggestions for fixing common issues
- Log errors appropriately for debugging