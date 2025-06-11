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

## Resolver Priority

Resolvers are checked in strict priority order:

1. **Built-in resolvers** (TIME, DEBUG, INPUT, PROJECTPATH)
2. **Custom resolvers** (by configured priority)  
3. **Variable lookup** (fallback)

Higher priority always wins - you cannot override built-in resolvers.

## Custom Resolvers

You can create custom resolvers for organization-specific needs.

### Configuration

Add custom resolvers to `mlld.config.json`:

```json
{
  "resolvers": {
    "@docs": {
      "type": "path",
      "command": "mlld-path-resolver",
      "args": ["--base-path", "./documentation"],
      "priority": 100,
      "capabilities": {
        "supportsImports": true,
        "supportsPaths": true
      }
    },
    "@company": {
      "type": "module", 
      "command": "node",
      "args": ["./resolvers/company-modules.js"],
      "priority": 200,
      "env": {
        "API_TOKEN": "${COMPANY_API_TOKEN}"
      },
      "capabilities": {
        "supportsImports": true,
        "supportsPaths": false
      }
    }
  }
}
```

### Resolver Types

#### Path Resolvers
Map @ prefixes to filesystem locations:

```json
{
  "@docs": {
    "type": "path",
    "command": "mlld-path-resolver", 
    "args": ["--base-path", "./documentation"]
  }
}
```

**Usage:**
```mlld
@add [@docs/getting-started.md]
@import { tutorial } from [@docs/tutorials/basic.md]
```

#### Module Resolvers  
Access private module registries or repositories:

```json
{
  "@company": {
    "type": "module",
    "command": "node",
    "args": ["./resolvers/company-registry.js"],
    "env": { "API_TOKEN": "${COMPANY_API_TOKEN}" }
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
    "type": "function", 
    "command": "python",
    "args": ["./resolvers/weather.py"],
    "env": { "API_KEY": "${WEATHER_API_KEY}" }
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
  async listTools() {
    return [
      {
        name: "resolveModule",
        description: "Resolve a company module",
        inputSchema: {
          type: "object", 
          properties: {
            moduleRef: { type: "string" },
            imports: { type: "array", items: { type: "string" } }
          }
        }
      }
    ];
  }
  
  async callTool(name, args) {
    if (name === "resolveModule") {
      // Fetch module from company registry
      const moduleData = await this.fetchFromRegistry(args.moduleRef);
      
      // Extract requested imports
      const exports = {};
      for (const importName of args.imports || []) {
        exports[importName] = moduleData[importName];
      }
      
      return { content: JSON.stringify(exports) };
    }
  }
  
  async fetchFromRegistry(moduleRef) {
    // Implementation specific to your organization
    const apiToken = process.env.API_TOKEN;
    const response = await fetch(`https://modules.company.com/api/${moduleRef}`, {
      headers: { 'Authorization': `Bearer ${apiToken}` }
    });
    return response.json();
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