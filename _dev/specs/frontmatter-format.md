# Frontmatter Format Specification

Version: 1.0  
Last Updated: 2025-05-30

## Overview

This document specifies the YAML frontmatter format for mlld files. Frontmatter provides optional metadata that is accessible within the mlld script as `@fm.*` variables.

## Syntax

### Basic Structure
```mlld
---
key: value
another_key: another value
---

# Rest of mlld content
@add [[Title: {{@fm.key}}]]
```

### Requirements
- Must start at the very beginning of the file
- Delimited by `---` on its own line
- Contains valid YAML between delimiters
- Optional - files work without frontmatter
- Ends with `---` followed by newline

## YAML Support

### Supported Types
All standard YAML types are supported:

```yaml
---
# Strings
title: My Module
description: |
  Multi-line description
  with preserved formatting

# Numbers
version: 1.2
timeout: 30

# Booleans
debug: true
production: false

# Arrays
tags: [mlld, prompts, ai]
authors:
  - name: Alice
    email: alice@example.com
  - name: Bob

# Objects
config:
  api:
    endpoint: https://api.example.com
    retry: 3
  cache:
    enabled: true
    ttl: 3600

# Null
deprecated: null
---
```

### YAML Features
- Comments with `#`
- Multi-line strings with `|` or `>`
- References with `&` and `*`
- Explicit typing with `!!type`

## Access in mlld

### Direct Access
```mlld
---
title: Customer Support
author: Alice
---

@text doc_title = @fm.title
@text creator = @fm.author
```

### Nested Access
```mlld
---
config:
  api:
    key: abc123
    url: https://api.example.com
---

@text api_key = @fm.config.api.key
@text endpoint = @fm.config.api.url
```

### Array Access
```mlld
---
tags: [ai, prompts, customer-service]
users:
  - name: Alice
    role: admin
  - name: Bob
    role: user
---

@text first_tag = @fm.tags.0
@text admin_name = @fm.users.0.name
```

### Missing Fields
Accessing non-existent fields returns undefined:
```mlld
---
title: Test
---

@text missing = @fm.nonexistent  # undefined
@if @fm.optional
  @add [[Has optional field]]
@end
```

## Import Behavior

### Frontmatter Isolation
Each file's frontmatter is isolated:

```mlld
# module.mld
---
title: Module Title
author: Alice
---
@text greeting = "Hello"

# main.mld
---
title: Main Title
author: Bob
---
@import { greeting, fm as moduleFm } from [./module.mld]

@add [[Main: {{@fm.title}} by {{@fm.author}}]]
@add [[Module: {{@moduleFm.title}} by {{@moduleFm.author}}]]
```

### Destructuring
```mlld
@import { fm as importedMeta } from @alice/utils
@text author = @importedMeta.author
```

## Conventional Fields

While all fields are optional, these conventions aid discovery:

### Module Identification
```yaml
---
# Basic metadata
author: Alice Johnson           # Human-readable name
module: alice/prompts          # Registry identifier  
description: Customer support templates
version: 1.2.0                 # Semantic version (informational)

# Categorization
category: support
tags: [customer-service, templates, tier-1]
license: MIT
---
```

### Links and Documentation
```yaml
---
# External links
readme: https://github.com/alice/prompts/README.md
repository: https://github.com/alice/prompts
homepage: https://alice.dev/prompts
issues: https://github.com/alice/prompts/issues

# Inline documentation
usage: |
  Import the greeting template:
  @import { greeting } from @alice/prompts
  
notes: |
  This module requires the customer name to be
  set in the environment before use.
---
```

### Technical Metadata
```yaml
---
# Requirements
mlld_version: ">=0.5.0"
requires:
  - @alice/utils
  - @bob/helpers

# Configuration
config:
  timeout: 30
  retries: 3
  
# Deprecation
deprecated: false
deprecation_notice: null
---
```

## Size and Security

### Limits
- Maximum frontmatter size: 1MB
- Maximum parsing time: 1 second
- No external file inclusion
- No code execution

### Security
- Frontmatter is trusted like file content
- No dynamic evaluation
- No variable interpolation in frontmatter
- Same security context as containing file

## Error Handling

### Invalid YAML
```
Error: Invalid frontmatter in example.mld

Failed to parse YAML:
  - unexpected character at line 3

💡 Check your YAML syntax or remove the frontmatter
```

### Access Errors
```
Error: Cannot read property 'name' of undefined

Accessing: @fm.author.name
But @fm.author is undefined

💡 Check if the field exists in frontmatter
```

## Examples

### Minimal
```mlld
---
title: Simple Module
---

@add [[{{@fm.title}}]]
```

### Rich Metadata
```mlld
---
title: Advanced Customer Support System
author:
  name: Alice Johnson
  email: alice@example.com
  github: alicej
  
description: |
  Comprehensive customer support template system
  with multi-tier support and escalation paths
  
category: support
tags: [customer-service, templates, automation]
license: MIT

repository: https://github.com/alice/support-templates
issues: https://github.com/alice/support-templates/issues
documentation: https://docs.alice.dev/support-templates

config:
  tiers: [1, 2, 3]
  escalation_time: 3600
  auto_close: true
  
requires:
  - @alice/utils: ">=1.0.0"
  - @bob/nlp: "^2.0.0"
---

# Module implementation using frontmatter
@data config = @fm.config
@text author_email = @fm.author.email
```

### Obsidian Compatible
```mlld
---
title: Daily Standup Template
tags: [meeting, standup, agile]
created: 2024-01-15
modified: 2024-01-16
aliases: [standup, daily]
---

# This works in both Obsidian and mlld
@add [[Running {{@fm.title}}]]
```

## Future Considerations

- Schema validation via JSON Schema
- Type annotations for frontmatter fields
- Frontmatter inheritance/composition
- Dynamic frontmatter generation
- IDE autocomplete for known fields