# mlld (pre-release)

mlld is a modular prompt scripting language.

[Give this to your LLM](llms.txt)

## Installation

```bash
npm install -g mlld
```

or just run it with `npx mlld`

## CLI Usage

Process mlld files from the command line:

```bash
# Basic usage - outputs .xml file
mlld input.mld

# Specify output format
mlld input.mld --format md

# Specify output file
mlld input.mld --output output.xml

# Print to stdout instead of file
mlld input.mld --stdout
```

### Supported Options

- `--format, -f`: Output format (default: md)
  - Supported formats: md, xml
- `--output, -o`: Output file path (default: input filename with new extension)
- `--stdout`: Print to stdout instead of file

### Supported File Extensions

- `.mld` is standard `.mld.md` is another option.
- `.md`: mlld can just interpret regular old markdown files with added mlld syntax, too.

## JavaScript API

Here's mlld's simple API for processing content directly in JS:

```javascript
// ES Module import
import { processMlld } from 'mlld';

// Process mlld content
const mlldContent = `
  @text greeting = "Hello"
  @text name = "World"
  
  @add [[{{greeting}}, {{name}}!]]
`;

// Simple usage
const result = await processMlld(mlldContent);
console.log(result); // "Hello, World!"

// With options
const xmlResult = await processMlld(mlldContent, {
  format: 'xml',
  basePath: '/path/to/project'
});
```

## Writing mlld Files

mlld is a simple scripting language designed to work within markdown-like documents. It processes special `@directive` lines while preserving all other content as-is.

### Core Directives

```mlld
@text name = "value"              # Define a text variable
@data config = { "key": "value" } # Define a structured data variable
@path docs = [file.md]            # Define a path reference
@add [file.md]                    # Add content from another file
@add "# Section" from [file.md]   # Add specific section from file
@run [command]                    # Run a shell command
@import { * } from [file.mld]     # Import another mlld file
@exec cmd = @run [echo "hi"]      # Define a reusable command
```

### Variables & Interpolation

Must be inside an @ directive to be interpolated

```mlld
>> In directive contexts:
@variable               << Reference a variable in directives
@datavar.field          << Access data field in directives
@pathvar                << Reference a path variable in directives

>> In template contexts:
{{variable}}            << Reference a variable in templates
{{datavar.field}}       << Access data field in templates

>> Variables can be used in templates and commands:
@text greeting = [[Hello {{name}}!]]
@run [cat @file]
```

### Comments & Code Fences

````mlld
>> This is a comment
>> Comments work at line beginnings
@add [file.md] << They can also be added at line endings

>> Code fences preserve content exactly:
```python
def hello():
    print("Hi")  # @text directives here are preserved as-is
```
````

### String Values

- Use single quotes, double quotes, or backticks
- Quotes must match (no mixing)
- Use backticks for template strings with variables:
```mlld
@text simple = "Hello"
@text template = [[Hello {{name}}!]]
@text multiline = [[
  Multi-line
  template with {{vars}}
]]
```

### Path Variables

- Reference files and URLs using brackets
- Support both local files and remote URLs
```mlld
@path docs = [./docs/api.md]
@path remote = [https://example.com/config.json]
>> Example Usage:
@add @docs
@add [./some_file.txt] 
```

### Data Variables

- Store structured data (objects/arrays)
- Support field access
```mlld
@data user = { "name": "Alice", "id": 123 }
@text name = [[User: {{user.name}}]]
```

## Module System & Registry

mlld has a decentralized module system that enables sharing and reusing code across projects.

### Public Modules

Share modules publicly via the mlld registry:

```mlld
>> Import from public registry (DNS-based, no servers)
@import { format, parse } from @alice/strings
@import { * } from @company/templates

>> Modules are cached locally and content-addressed for security
>> Lock files ensure reproducible builds
```

Public modules are published as GitHub gists and discovered via DNS TXT records. No central servers required.

### Private Modules & Custom Resolvers

Configure resolvers for private or corporate modules:

```mlld
>> Local filesystem modules
@import { utils } from @notes/helpers

>> Private GitHub repositories  
@import { internal } from @company/tools

>> Custom HTTP endpoints
@import { api } from @corporate/modules
```

Configure resolvers in your lock file:
```json
{
  "registries": [
    {
      "prefix": "@notes/",
      "resolver": "local",
      "config": { "path": "~/Documents/Notes" }
    },
    {
      "prefix": "@company/", 
      "resolver": "github",
      "config": {
        "owner": "company",
        "repo": "mlld-modules",
        "token": "${GITHUB_TOKEN}"
      }
    }
  ]
}
```

### Security & Caching

- **Content Addressing**: All modules identified by SHA-256 hash
- **Progressive Trust**: Interactive approval for new modules  
- **Offline-First**: Everything cached locally for reliability
- **TTL Control**: Configure cache refresh intervals

```mlld
>> Security options
@import { trusted } from @company/utils trust always
@import { external } from @community/parser trust verify

>> Cache control  
@import { live } from @api/data (30m) << Refresh every 30 minutes
@import { stable } from @alice/lib (static) << Never refresh
```

## License

[MIT](LICENSE)
